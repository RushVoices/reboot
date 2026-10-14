// Prepares a fetched or pasted web page for remaking: strips what Claude
// doesn't need (scripts, inline images, SVG paths, tracking) and pulls out
// the design and structure notes it does. Used by api/fetch-site.ts and by
// the browser when someone pastes a page's code.

const MAX_CLEAN = 150_000;
const MAX_CSS = 24_000;

export function cleanHtml(raw: string): string {
  let h = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, "")
    .replace(/(<svg\b[^>]*>)[\s\S]*?(<\/svg>)/gi, "$1…$2")
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, "data:…")
    .replace(/\s(on[a-z]+|data-[\w-]+|nonce|integrity|crossorigin)="[^"]*"/gi, "")
    .replace(/\sclass="([^"]{160})[^"]*"/gi, ' class="$1…"')
    .replace(/<link\b[^>]*rel="(preload|prefetch|preconnect|dns-prefetch|modulepreload|manifest|alternate|icon|apple-touch-icon|mask-icon)"[^>]*>/gi, "")
    .replace(/<meta\b(?![^>]*name="description")[^>]*>/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
  // Styles first (capped), so the page's structure gets most of the space.
  let css = "";
  h = h.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, block: string) => { css += block + "\n"; return ""; });
  css = css.replace(/\s+/g, " ").replace(/\s*([{}:;,])\s*/g, "$1");
  if (css.length > MAX_CSS) css = css.slice(0, MAX_CSS) + "/* …trimmed… */";
  const body = h.length > MAX_CLEAN - css.length ? h.slice(0, MAX_CLEAN - css.length) + "\n<!-- …page trimmed… -->" : h;
  return (css ? `<style>${css}</style>\n` : "") + body;
}

const top = (xs: string[], n: number) => {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([x]) => x);
};
const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export function siteNotes(raw: string, url: string): { title: string; text: string } {
  const title = text(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || new URL(url).hostname;
  const desc = raw.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)?.[1] ?? "";
  const colors = top((raw.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)/gi) ?? []).map((c) => c.toLowerCase()), 14);
  const fonts = top((raw.match(/font-family:\s*([^;}"]+)/gi) ?? []).map((f) => f.replace(/font-family:\s*/i, "").trim()), 6);
  const googleFonts = [...raw.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"&]+)/gi)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, " "));
  const headings = [...raw.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => `h${m[1]}: ${text(m[2])}`).filter((h) => h.length > 4).slice(0, 30);
  const nav = top([...raw.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => text(m[1])).filter((t) => t && t.length < 40), 30);
  const buttons = top([...raw.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map((m) => text(m[1])).filter((t) => t && t.length < 40), 15);
  const lines = [
    `Website: ${url}`,
    `Title: ${title}`,
    desc && `Description: ${desc}`,
    colors.length && `Most used colors: ${colors.join(", ")}`,
    (fonts.length || googleFonts.length) && `Fonts: ${[...googleFonts, ...fonts].slice(0, 6).join(" | ")}`,
    headings.length && `Headings:\n${headings.join("\n")}`,
    nav.length && `Link labels: ${nav.join(" · ")}`,
    buttons.length && `Button labels: ${buttons.join(" · ")}`,
  ].filter(Boolean);
  return { title, text: lines.join("\n") };
}
