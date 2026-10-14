// The instructions and request format Reboot sends to Claude. Shared by the
// server route (api/generate.ts) and the claude.ai artifact build, which asks
// Claude from the page.
//
// A remake (of pasted code or a website) runs in two steps: a blueprint
// (PLAN_SYSTEM + planMessage), then the build with that blueprint attached.

const MAX_HTML = 400_000;
const MAX_TEXT = 8_000;
const MAX_PLAN = 20_000;
export const LIMITS = { MAX_HTML, MAX_TEXT };

export const SYSTEM = `You are Reboot, an app builder. People describe an app, paste code, or point at a website, and you deliver a complete, working app they can use immediately.

Output format, exactly:
1. One short sentence telling the person what you built or changed, in plain words. No markdown.
2. Then the full app as a single HTML document, starting with <!doctype html> and ending with </html>. Nothing after it, no code fences.

The app runs inside a sandboxed iframe with scripts allowed but no same-origin access, so:
- Put all CSS and JavaScript inline. You may load libraries only from https://cdn.jsdelivr.net/npm/ or https://unpkg.com/ with an exact version, and fonts from Google Fonts.
- Keep state in memory or localStorage wrapped in try/catch (it may be unavailable). No backend, no API keys, no network calls except public CORS-friendly APIs that need no key. Simulate server features (accounts, sync, other users) locally and convincingly.
- No alert(), confirm() or prompt(): build in-page UI instead.

Quality bar: this should feel like a shipped product from a strong team, not a demo.
- Every visible control works. No dead buttons, no "coming soon".
- Design system first: CSS custom properties for color, type scale, spacing, radius and shadow; one accent color; generous whitespace; crisp 1px borders; a modern sans-serif from Google Fonts. Light and dark themes via prefers-color-scheme.
- Real states: empty, loading, error, selected, hover, focus-visible, disabled. Subtle 150-250ms transitions, turned off under prefers-reduced-motion.
- Works at phone width and on desktop; keyboard accessible with sensible shortcuts; labelled controls.
- Organized JavaScript: one state object, render functions, event delegation, persistence in one place. No comments, no dead code.
- Realistic sample content so the app looks alive on first open; generate repetitive data in code instead of writing it out.
- Size: speed matters, so write tight code. Aim for 25-40 KB for a normal build and at most about 70 KB for a HIGH EFFORT remake. Prefer CSS and small helper functions over repeated markup.
- Start writing promptly: plan briefly, then write.

When changing an existing app, keep everything the person did not ask to change and preserve their data model so saved localStorage still loads. Reply with the summary sentence, then only the edits, as one or more blocks in exactly this format:
<<<<<<< SEARCH
(an exact, unique excerpt of the current app, a few lines long)
=======
(what replaces it)
>>>>>>> REPLACE
Copy SEARCH text character for character from the current app. If the change touches most of the app, return the whole updated document instead (starting with <!doctype html>).
When remaking code in another language or framework, rebuild its full behavior as a single-file HTML app.
When remaking a website, recreate its layout, sections, hierarchy, interactions and feel closely, and make every link and form work inside the app. Replace images with CSS, SVG or neutral placeholders.
When asked for an app like a well-known product, or remaking someone else's site, build the features and structure people use it for, but give it an original name, logo, copy and visual identity: never copy a brand's name, logo, artwork or written content. If the person says the brand is their own, keep it.`;

export const PLAN_SYSTEM = `You are the lead engineer at Reboot planning a HIGH EFFORT remake. Study what the person gave you (code, a website, or a description) and write the blueprint another engineer will build from in a single HTML file.

Write plain text with these short headings, dashes for items, no code, at most about 700 words:
WHAT IT IS - one or two sentences.
NAME & BRAND - an original name and a one-line logo idea (never the original brand's, unless the person says it's theirs).
SCREENS & LAYOUT - every screen, panel and section in order, with what's in each.
FEATURES - an exhaustive checklist grouped by area. Include the small things that make it feel real.
DATA - entities, their fields, and the sample data to seed.
INTERACTIONS - flows, keyboard shortcuts, drag and drop, animations.
VISUAL DESIGN - palette as hex values, fonts, type scale, spacing, radius, shadows, and how it should feel.
SIMULATED - anything that needs a server and how to fake it locally.`;

export type BuildKind = "new" | "change" | "remake-code" | "remake-site";

export interface BuildBody {
  prompt?: unknown;
  html?: unknown;
  history?: unknown;
  source?: unknown;
  /** For a website remake: the address and the notes from src/site.ts. */
  site?: unknown;
  /** The blueprint from the planning step. */
  plan?: unknown;
  /** Ask for the whole document even for a change (used when edits didn't apply). */
  full?: unknown;
}

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function siteOf(b: BuildBody): { url: string; notes: string } | null {
  const s = b.site as { url?: unknown; notes?: unknown } | undefined;
  const url = str(s?.url, 2000);
  return url ? { url, notes: str(s?.notes, 6000) } : null;
}

export function kindOf(b: BuildBody): BuildKind {
  if (siteOf(b)) return "remake-site";
  if (str(b.source, 10).trim()) return "remake-code";
  return str(b.html, 10) ? "change" : "new";
}

/** The material a remake works from: the website notes and page, or the pasted code. */
function material(b: BuildBody): string[] {
  const parts: string[] = [];
  const site = siteOf(b);
  const source = str(b.source, MAX_HTML);
  if (site) {
    parts.push(`Website to remake: ${site.url}${site.notes ? `\n<site_notes>\n${site.notes}\n</site_notes>` : ""}`);
    if (source) parts.push(`The page's HTML (scripts and bulk removed):\n<page_html>\n${source}\n</page_html>`);
    else parts.push("The page's HTML isn't available. Rebuild it from what you know about this website and the notes above.");
  } else if (source) {
    parts.push(`Code to turn into the person's own app:\n<source_code>\n${source}\n</source_code>`);
  }
  return parts;
}

export function planMessage(b: BuildBody): string {
  const prompt = str(b.prompt, MAX_TEXT).trim();
  return [...material(b), prompt ? `What the person wants: ${prompt}` : "What the person wants: their own version of this, at least as good as the original."].join("\n\n");
}

export function userMessage(b: BuildBody): string {
  const kind = kindOf(b);
  const prompt = str(b.prompt, MAX_TEXT).trim();
  const html = str(b.html, MAX_HTML);
  const plan = str(b.plan, MAX_PLAN).trim();
  const history = Array.isArray(b.history) ? b.history.slice(-12).map((h) => str(h, 1000)).filter(Boolean) : [];
  const parts: string[] = [];
  if (history.length) parts.push(`Earlier requests for this app, oldest first:\n${history.map((h, i) => `${i + 1}. ${h}`).join("\n")}`);
  if (html) parts.push(`The current app:\n<current_app>\n${html}\n</current_app>`);
  if (kind === "remake-code" || kind === "remake-site") {
    parts.push(...material(b));
    if (plan) parts.push(`The blueprint to build from. Implement every item:\n<blueprint>\n${plan}\n</blueprint>`);
    parts.push(`HIGH EFFORT remake. ${prompt ? `The person also asked: ${prompt}` : ""}`.trim());
  } else {
    parts.push(html ? `Change request: ${prompt}${b.full ? "\n\nReturn the whole updated document this time, starting with <!doctype html>." : ""}` : `Build this app: ${prompt}`);
  }
  return parts.join("\n\n");
}
