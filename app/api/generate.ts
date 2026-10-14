// Vercel Function (Node.js runtime): POST /api/generate
// Body (JSON): BuildBody from src/prompt.ts, plus `mode`:
//   mode "plan"  - write the blueprint for a remake (plain text)
//   otherwise    - build or change the app (summary line + HTML document)
// Streams newline-delimited JSON events back to the browser:
//   {"t":"text","d":"..."}   a chunk of the model's output
//   {"t":"ping"}             keep-alive while Claude thinks
//   {"t":"done"}             finished
//   {"t":"error","d":"..."}  something went wrong (message is safe to show)
// Long apps that hit the output limit are continued automatically.
//
// Env: ANTHROPIC_API_KEY (required). vercel.json gives this function up to
// 800 s, which high-effort remakes can use.

import Anthropic from "@anthropic-ai/sdk";
import { LIMITS, PLAN_SYSTEM, SYSTEM, kindOf, planMessage, str, userMessage, type BuildBody } from "../src/prompt";

const MODEL = "claude-opus-5-5";
const { MAX_HTML, MAX_TEXT } = LIMITS;
const MAX_PARTS = 3;

const CONTINUE = (sofar: string) =>
  `Your reply was cut off by the length limit. Here is everything you wrote so far:\n<partial>\n${sofar}\n</partial>\n\n` +
  "Continue exactly where it stops: output only the remaining characters, starting with the very next character. No repetition, no explanation, no code fences.";

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "App building is not configured (ANTHROPIC_API_KEY is missing)." }, { status: 500 });

  let body: BuildBody & { mode?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const kind = kindOf(body);
  if (!str(body.prompt, MAX_TEXT).trim() && !str(body.source, MAX_HTML).trim() && kind !== "remake-site") {
    return Response.json({ error: "Describe the app you want." }, { status: 400 });
  }
  const planning = body.mode === "plan";
  const remake = kind === "remake-code" || kind === "remake-site";
  const system = planning ? PLAN_SYSTEM : SYSTEM;
  const first = planning ? planMessage(body) : userMessage(body);
  // Effort trades thinking time for speed: remakes think hardest, changes least.
  const effort = planning ? "medium" : remake ? "high" : kind === "change" ? "low" : "medium";
  const maxTokens = planning ? 16000 : remake ? 128000 : 64000;

  const client = new Anthropic();
  const enc = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (e: object) => { try { ctrl.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* closed */ } };
      const ping = setInterval(() => send({ t: "ping" }), 15_000);
      let written = "";
      try {
        for (let part = 0; part < MAX_PARTS; part++) {
          const stream = client.beta.messages.stream({
            model: MODEL,
            max_tokens: maxTokens,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort },
            system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: part === 0 ? first : `${first}\n\n${CONTINUE(written)}` }],
          }, { signal: req.signal });
          for await (const ev of stream) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
              written += ev.delta.text;
              send({ t: "text", d: ev.delta.text });
            }
          }
          const final = await stream.finalMessage();
          if (final.stop_reason === "refusal") { send({ t: "error", d: "That request can't be built. Try describing it differently." }); return; }
          if (final.stop_reason !== "max_tokens" || planning) { send({ t: "done" }); return; }
        }
        send({ t: "error", d: "This app is too big to finish in one go. Ask for fewer features, then add more one change at a time." });
      } catch (err) {
        let msg = "Building failed. Try again.";
        if (err instanceof Anthropic.RateLimitError) msg = "Too many builds right now. Wait a minute and try again.";
        else if (err instanceof Anthropic.AuthenticationError) msg = "The server's Anthropic API key is invalid.";
        else if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) msg = "The AI service is busy. Try again in a moment.";
        if (!req.signal.aborted) send({ t: "error", d: msg });
      } finally {
        clearInterval(ping);
        try { ctrl.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(out, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

declare const process: { env: Record<string, string | undefined> };
