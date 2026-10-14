// Sends a build, change or planning request and streams Claude's output back.
// On the deployed site that goes through api/generate.ts; in the claude.ai
// artifact build (vite --mode artifact) the page asks Claude directly. A build's
// output is a one-line summary, then a full HTML document; `splitOutput`
// separates the two. A plan is plain text.

import { PLAN_SYSTEM, SYSTEM, kindOf, planMessage, userMessage } from "./prompt";

export const IN_ARTIFACT = import.meta.env.MODE === "artifact";

export interface BuildRequest {
  prompt: string;
  html?: string;
  history?: string[];
  source?: string;
  site?: { url: string; notes: string };
  plan?: string;
  full?: boolean;
}

export interface BuildProgress {
  /** Everything received so far. */
  raw: string;
  /** The summary line (may still be growing). */
  note: string;
  /** The HTML received so far ("" until the document starts). */
  html: string;
  /** Which part of a multi-part answer is arriving (0 for the first). */
  part?: number;
}

export function splitOutput(raw: string): { note: string; html: string } {
  const at = raw.search(/<!doctype html/i);
  if (at < 0) {
    const edits = raw.indexOf("<<<<<<< SEARCH");
    return { note: (edits < 0 ? raw : raw.slice(0, edits)).replace(/```\w*/g, "").trim(), html: "" };
  }
  let html = raw.slice(at);
  const end = html.toLowerCase().lastIndexOf("</html>");
  if (end >= 0) html = html.slice(0, end + 7);
  return { note: raw.slice(0, at).replace(/```(html)?/g, "").trim(), html };
}

// ---- inside Claude (artifact build) -------------------------------------------

interface SampleError { code: string; message: string }
type SampleFn = (input: string | { role: string; content: string }[], opts: object) => Promise<{ text: string; truncated: boolean }>;
const claudeRuntime = () => (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;

const SAMPLE_COPY: Record<string, string> = {
  not_granted: "Reboot needs your permission to use Claude. Reload the page and allow it to build apps.",
  sampling_disabled: "Claude isn't available for this account, so apps can't be built here.",
  rate_limited: "You've hit a usage limit. Wait a bit and try again.",
  refused: "That request can't be built. Try describing it differently.",
  prompt_too_large: "That's too much to send at once. Paste less code, or start from a smaller page.",
  session_expired: "Sign in to Claude again, then try again.",
};

const CONTINUE =
  "Your previous reply was cut off by the length limit. Continue it exactly where it stopped: output only the remaining characters, " +
  "starting with the very next character. Do not repeat anything, do not explain, no code fences.";

/** Joins a continuation onto what was already written, dropping any overlap Claude repeated. */
export function stitch(sofar: string, more: string): string {
  more = more.replace(/^\s*```(html)?\s*\n?/, "");
  if (/^\s*<!doctype html/i.test(more)) return more; // started over: keep the fresh copy
  for (let n = Math.min(400, sofar.length, more.length); n >= 12; n--) {
    if (sofar.endsWith(more.slice(0, n))) return sofar + more.slice(n);
  }
  return sofar + more;
}

async function askClaude(
  prompt: string,
  opts: { maxParts: number },
  onText: (raw: string, part: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const sample = (await claudeRuntime()?.use("sample")) as SampleFn | null;
  if (!sample) throw new Error("Open this page in Claude to build apps.");
  // The balanced model at low effort starts writing within seconds; long silent
  // thinking was making builds slow and could use up a whole answer with no text.
  let tier: object = { modelTier: "default", effort: "low" };
  let text = "";
  let fellBack = false;
  // Each answer is capped by length and time; long apps arrive in parts. A part
  // that fails after writing something is continued like a cut-off one.
  for (let part = 0; part < opts.maxParts; part++) {
    const sofar = text;
    const input = part === 0 ? prompt : [
      { role: "user", content: prompt },
      { role: "assistant", content: sofar },
      { role: "user", content: CONTINUE },
    ];
    try {
      const res = await sample(input, {
        ...tier,
        cache: false,
        signal,
        onText: ({ text: t }: { text: string }) => onText(part === 0 ? t : stitch(sofar, t), part),
      });
      text = part === 0 ? res.text : stitch(sofar, res.text);
      if (!res.truncated || opts.maxParts === 1) return text;
    } catch (e) {
      const { code, text: partial } = e as SampleError & { text?: string };
      if (code === "cancelled") throw new Error("Stopped.");
      if (SAMPLE_COPY[code]) throw new Error(SAMPLE_COPY[code]);
      // Kept some of the answer: carry on from there in the next part.
      if (partial && partial.trim() && opts.maxParts > 1) {
        text = part === 0 ? partial : stitch(sofar, partial);
        continue;
      }
      // Nothing written: try once more on the fastest model, which doesn't think first.
      if (!fellBack) {
        fellBack = true;
        tier = { modelTier: "quick" };
        part--;
        continue;
      }
      throw new Error(`Building failed${code ? ` (${code})` : ""}. Try again in a moment.`);
    }
  }
  throw new Error("This app is too big to finish in one go. Ask for fewer features, then add more one change at a time.");
}

// ---- deployed site ----------------------------------------------------------------

async function askServer(body: object, onText: (raw: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Building failed (${res.status}).`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let raw = "";
  let finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line) as { t: string; d?: string };
      if (ev.t === "text") {
        raw += ev.d ?? "";
        onText(raw);
      } else if (ev.t === "error") {
        throw new Error(ev.d || "Building failed.");
      } else if (ev.t === "done") {
        finished = true;
      }
    }
  }
  if (!finished) throw new Error("The connection dropped before Claude finished. Try again.");
  return raw;
}

// ---- public API -------------------------------------------------------------------

/** Writes the blueprint for a remake. Streams the text as it's written. */
export async function plan(req: BuildRequest, onText: (text: string) => void, signal?: AbortSignal): Promise<string> {
  const text = IN_ARTIFACT
    ? await askClaude(`${PLAN_SYSTEM}\n\n---\n\n${planMessage(req)}`, { maxParts: 1 }, (t) => onText(t), signal)
    : await askServer({ ...req, mode: "plan" }, onText, signal);
  return text.trim();
}

const EDIT = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n?>>>>>>> REPLACE/g;

/** Applies SEARCH/REPLACE edits to `html`. Returns null if there are none or any doesn't match. */
export function applyEdits(html: string, raw: string): string | null {
  const edits = [...raw.matchAll(EDIT)];
  if (!edits.length) return null;
  let out = html;
  for (const [, find, repl] of edits) {
    let at = out.indexOf(find);
    if (at < 0) {
      // Tolerate differences in indentation and trailing spaces.
      const norm = (t: string) => t.split("\n").map((l) => l.trim()).join("\n");
      const lines = out.split("\n");
      const want = norm(find);
      const n = find.split("\n").length;
      let hit = -1;
      for (let i = 0; i + n <= lines.length && hit < 0; i++) if (norm(lines.slice(i, i + n).join("\n")) === want) hit = i;
      if (hit < 0) return null;
      const before = lines.slice(0, hit).join("\n");
      at = hit ? before.length + 1 : 0;
      out = out.slice(0, at) + repl + out.slice(at + lines.slice(hit, hit + n).join("\n").length);
      continue;
    }
    out = out.slice(0, at) + repl + out.slice(at + find.length);
  }
  return out;
}

async function ask(req: BuildRequest, onProgress: (p: BuildProgress) => void, signal?: AbortSignal) {
  return IN_ARTIFACT
    ? askClaude(`${SYSTEM}\n\n---\n\n${userMessage(req)}`, { maxParts: 4 }, (t, part) => onProgress({ raw: t, part, ...splitOutput(t) }), signal)
    : askServer(req, (t) => onProgress({ raw: t, ...splitOutput(t) }), signal);
}

const complete = (html: string) => /<\/html>\s*$/i.test(html);

export async function build(req: BuildRequest, onProgress: (p: BuildProgress) => void, signal?: AbortSignal) {
  const raw = await ask(req, onProgress, signal);
  const out = splitOutput(raw);
  if (out.html) {
    if (!complete(out.html)) throw new Error("The app came back incomplete. Try again.");
    return out;
  }
  // A change sent as edits: apply them, or ask once for the whole document if they don't fit.
  if (kindOf(req) === "change" && req.html) {
    const edited = applyEdits(req.html, raw);
    if (edited && complete(edited)) return { note: out.note, html: edited };
    const again = splitOutput(await ask({ ...req, full: true }, onProgress, signal));
    if (again.html && complete(again.html)) return { note: again.note || out.note, html: again.html };
  }
  throw new Error("The app came back incomplete. Try again.");
}

/** Fetches a website for remaking (deployed site only). */
export async function fetchSite(url: string, signal?: AbortSignal): Promise<{ url: string; title: string; html: string; notes: string }> {
  const res = await fetch("/api/fetch-site", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.html) throw new Error(body.error || `Couldn't open that website (${res.status}).`);
  return body;
}
