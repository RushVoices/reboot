// Google's Gemini API (Interactions API), used on the free tier so the site
// owner pays nothing. Server-side only: the key stays on the server.
// Docs: https://ai.google.dev/gemini-api/docs/text-generation and
// https://ai.google.dev/gemini-api/docs/streaming

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse";
/** Free-tier models, best first. The next one is tried if a model is unavailable. */
export const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash"];

export class GeminiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Streams one answer. Calls `onText` with each piece of text and resolves with
 * whether the answer finished (false when it was cut off by the length limit).
 */
export async function streamGemini(opts: {
  key: string;
  model: string;
  system: string;
  input: string;
  maxTokens: number;
  thinking: "low" | "medium" | "high";
  signal: AbortSignal;
  onText: (text: string) => void;
}): Promise<{ complete: boolean }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": opts.key, "content-type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      system_instruction: opts.system,
      input: opts.input,
      stream: true,
      store: false, // nothing kept on Google's side between requests
      generation_config: { thinking_level: opts.thinking, max_output_tokens: opts.maxTokens },
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new GeminiError(res.status, body?.error?.message ?? `Gemini request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let status = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let ev: {
        event_type?: string;
        delta?: { type?: string; text?: string };
        interaction?: { status?: string };
        error?: { message?: string; code?: string };
      };
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.event_type === "step.delta" && ev.delta?.type === "text" && ev.delta.text) opts.onText(ev.delta.text);
      else if (ev.event_type === "interaction.completed") status = ev.interaction?.status ?? "completed";
      else if (ev.event_type === "error") throw new GeminiError(502, ev.error?.message ?? "Gemini stopped with an error.");
    }
  }
  // Anything other than "completed" (for example the output limit) means there's more to write.
  return { complete: status === "completed" };
}
