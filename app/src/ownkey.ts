// "Use my own Claude key": a visitor can paste their own Anthropic API key to
// build with Claude instead of the site's free AI. The key is kept only in
// their browser (localStorage) and sent only to Anthropic: the browser calls
// the API directly, so the site's server never sees it.

import { CONTINUE_SERVER as CONTINUE } from "./prompt";

const STORE = "reboot.anthropicKey";
const MODEL = "claude-opus-5-5";

export function ownKey(): string {
  try { return localStorage.getItem(STORE) || ""; } catch { return ""; }
}

export function setOwnKey(key: string) {
  try {
    if (key) localStorage.setItem(STORE, key);
    else localStorage.removeItem(STORE);
  } catch { /* storage blocked: the key just won't be remembered */ }
}

/**
 * Streams an answer from Claude using the visitor's key, continuing in new
 * requests if an answer hits the length limit. `onText` gets everything so far.
 */
export async function askOwnClaude(
  system: string,
  user: string,
  opts: { maxParts: number; light: boolean },
  onText: (raw: string, part: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (import.meta.env.MODE === "artifact") throw new Error("Not available here.");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: ownKey(), dangerouslyAllowBrowser: true });
  let text = "";
  try {
    for (let part = 0; part < opts.maxParts; part++) {
      const sofar = text;
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        output_config: { effort: opts.light || part ? "low" : "medium" },
        system,
        messages: [{ role: "user", content: part ? `${user}\n\n${CONTINUE(sofar)}` : user }],
      }, { signal });
      let got = "";
      stream.on("text", (delta) => { got += delta; onText(sofar + got, part); });
      const final = await stream.finalMessage();
      text = sofar + got;
      if (final.stop_reason === "refusal") throw new Error("That request can't be built. Try describing it differently.");
      if (final.stop_reason !== "max_tokens") return text;
    }
  } catch (e) {
    if (signal?.aborted) throw new Error("Stopped.");
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Your Claude key isn't valid. Check it in AI settings (it starts with sk-ant-api).");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Your Claude account hit a rate limit. Wait a minute and try again.");
    if (e instanceof Anthropic.APIError) {
      const msg = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
      throw new Error(/credit balance/i.test(msg) ? "Your Claude account is out of credits. Add some at console.anthropic.com." : `Claude couldn't build this (${e.status}): ${msg}`);
    }
    throw e;
  }
  throw new Error("This app is too big to finish in one go. Ask for fewer features, then add more one change at a time.");
}
