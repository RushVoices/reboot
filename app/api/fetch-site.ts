// Vercel Edge Function: POST /api/fetch-site
// Body (JSON): { url: string }
// Fetches a public web page so Reboot can remake it, and returns
// { url, title, html, notes }: the page's HTML with scripts, inline images and
// other bulk stripped (capped at ~150 KB), plus notes on its colors, fonts,
// headings and links that help Claude rebuild the design.
//
// Only public http(s) pages are fetched: private, local and metadata
// addresses are refused.

import { cleanHtml, siteNotes } from "../src/site";

export const config = { runtime: "edge" };

const MAX_BYTES = 3 * 1024 * 1024;

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|\[.*\])$/i;

function parseUrl(raw: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    if (PRIVATE_HOST.test(u.hostname) || !u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return Response.json({ error: "Use POST" }, { status: 405 });
  let body: { url?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const url = parseUrl(typeof body.url === "string" ? body.url.trim() : "");
  if (!url) return Response.json({ error: "Enter a public website address, like stripe.com." }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; RebootBot/1.0; +https://github.com/rushvoices/slice)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    return Response.json({ error: "That website didn't respond. Check the address, or paste the page's code instead." }, { status: 502 });
  }
  const final = parseUrl(res.url || url.href);
  if (!final) return Response.json({ error: "That website redirected somewhere Reboot can't open." }, { status: 400 });
  if (!res.ok) return Response.json({ error: `That website returned an error (${res.status}). Some sites block tools like this; paste the page's code instead.` }, { status: 502 });
  if (!/html/i.test(res.headers.get("content-type") || "")) return Response.json({ error: "That address isn't a web page." }, { status: 400 });

  const buf = await res.arrayBuffer();
  const raw = new TextDecoder().decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf);
  const notes = siteNotes(raw, final.href);
  return Response.json({ url: final.href, title: notes.title, html: cleanHtml(raw), notes: notes.text });
}
