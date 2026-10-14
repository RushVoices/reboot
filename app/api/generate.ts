// Vercel Function (Node.js runtime): POST /api/generate
// Body (JSON): BuildBody from src/prompt.ts, plus:
//   mode "plan"  - write the blueprint for a remake (plain text)
//   otherwise    - build or change the app (summary line + HTML document)
//   partial      - what earlier requests already wrote; Claude continues from it
// Streams newline-delimited JSON events back to the browser:
//   {"t":"text","d":"..."}   a chunk of the model's output
//   {"t":"ping"}             keep-alive while Claude thinks
//   {"t":"done"}             finished
//   {"t":"more"}             stopped early (time or length limit): send the
//                            text so far back as `partial` to continue
//   {"t":"error","d":"..."}  something went wrong (message is safe to show)
//
// Env: ANTHROPIC_API_KEY (required). Vercel's Hobby plan allows 300 s per
// request (vercel.json), so each request stops writing at ~270 s and the
// browser continues long builds in a new request (src/build.ts).

import Anthropic from "@anthropic-ai/sdk";
import { CONTINUE_SERVER as CONTINUE, LIMITS, PLAN_SYSTEM, SYSTEM, kindOf, planMessage, str, userMessage, type BuildBody } from "../src/prompt.js";
import { GEMINI_MODELS, GeminiError, streamGemini } from "../src/gemini.js";

const MODEL = "claude-opus-5-5";
const { MAX_HTML, MAX_TEXT } = LIMITS;
/** Stop writing this long into a request, safely inside Vercel's 300 s limit. */
const BUDGET_MS = 270_000;

export async function POST(req: Request): Promise<Response> {
  // Free by default: Gemini's free tier when GEMINI_API_KEY is set, else Claude
  // with ANTHROPIC_API_KEY (paid). Visitors with their own Claude key never
  // reach this route; their browser calls Anthropic directly (src/build.ts).
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey && !process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "App building is not configured (GEMINI_API_KEY is missing)." }, { status: 500 });
  }

  let body: BuildBody & { mode?: unknown; partial?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const kind = kindOf(body);
  if (!str(body.prompt, MAX_TEXT).trim() && !str(body.source, MAX_HTML).trim() && kind !== "remake-site") {
    return Response.json({ error: "Describe the app you want." }, { status: 400 });
  }
  const planning = body.mode === "plan";
  const remake = kind === "remake-code" || kind === "remake-site";
  const system = planning ? PLAN_SYSTEM : SYSTEM;
  const first = planning ? planMessage(body) : userMessage(body);
  const partial = str(body.partial, MAX_HTML);
  // Effort trades thinking time for speed; a continuation just writes.
  const effort = partial || kind === "change" ? "low" : "medium";
  const maxTokens = planning ? 16000 : remake ? 96000 : 64000;

  const client = geminiKey ? null! : new Anthropic();
  const enc = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (e: object) => { try { ctrl.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* closed */ } };
      const ping = setInterval(() => send({ t: "ping" }), 15_000);
      let written = "";
      // Stop before Vercel's limit; the browser continues in a new request.
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), BUDGET_MS);
      const signal = AbortSignal.any([req.signal, stop.signal]);
      try {
        if (geminiKey) {
          let result: { complete: boolean } | null = null;
          for (const model of GEMINI_MODELS) {
            try {
              result = await streamGemini({
                key: geminiKey, model, signal, maxTokens: Math.min(maxTokens, 65536),
                system, input: partial ? `${first}\n\n${CONTINUE(partial)}` : first,
                thinking: partial || kind === "change" ? "low" : "medium",
                onText: (t) => { written += t; send({ t: "text", d: t }); },
              });
              break;
            } catch (e) {
              // A model that isn't available on this key: try the next one, if nothing was written yet.
              if (e instanceof GeminiError && (e.status === 404 || e.status === 400 && /model/i.test(e.message)) && !written) continue;
              throw e;
            }
          }
          if (!result) throw new GeminiError(404, "No free Gemini model is available for this key.");
          send(result.complete || planning ? { t: "done" } : { t: "more" });
          return;
        }
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: maxTokens,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: partial ? `${first}\n\n${CONTINUE(partial)}` : first }],
        }, { signal });
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            written += ev.delta.text;
            send({ t: "text", d: ev.delta.text });
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") send({ t: "error", d: "That request can't be built. Try describing it differently." });
        else if (final.stop_reason === "max_tokens" && !planning) send({ t: "more" });
        else send({ t: "done" });
      } catch (err) {
        if (stop.signal.aborted && !req.signal.aborted) {
          // Out of time for this request: continue if anything was written.
          send(written || partial ? { t: "more" } : { t: "error", d: "Claude took too long to start. Try again, or ask for a smaller app." });
          return;
        }
        if (err instanceof GeminiError) {
          const m = err.status === 429
            ? "Reboot's free building limit is used up for now. Try again later, or add your own Claude key in AI settings."
            : err.status === 400 && /API key/i.test(err.message) ? "The server's Gemini key isn't valid. Check GEMINI_API_KEY in Vercel."
            : `Building failed (${err.status}): ${err.message}`;
          console.error("gemini failed:", err.status, err.message);
          if (!req.signal.aborted) send({ t: "error", d: m });
          return;
        }
        let msg = "Building failed. Try again.";
        const detail = err instanceof Anthropic.APIError ? (err.error as { error?: { message?: string } } | undefined)?.error?.message ?? err.message : String(err);
        if (err instanceof Anthropic.RateLimitError) msg = "Too many builds right now. Wait a minute and try again.";
        else if (err instanceof Anthropic.AuthenticationError) msg = "The server's Anthropic API key isn't valid. Create an API key (it starts with sk-ant-api) at console.anthropic.com and set it as ANTHROPIC_API_KEY.";
        else if (err instanceof Anthropic.PermissionDeniedError) msg = `The Anthropic key can't use this model: ${detail}`;
        else if (err instanceof Anthropic.APIError && /credit balance/i.test(detail)) msg = "The Anthropic account is out of credits. Add credits at console.anthropic.com/settings/billing.";
        else if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) msg = "The AI service is busy. Try again in a moment.";
        else if (err instanceof Anthropic.APIError) msg = `Building failed (${err.status}): ${detail}`;
        console.error("generate failed:", err instanceof Anthropic.APIError ? `${err.status} ${detail}` : err);
        if (!req.signal.aborted) send({ t: "error", d: msg });
      } finally {
        clearTimeout(timer);
        clearInterval(ping);
        try { ctrl.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(out, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

declare const process: { env: Record<string, string | undefined> };
