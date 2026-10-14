// Vercel Edge Function: POST /api/publish
// Body (JSON): { name: string, html: string }
// Pins the app's HTML to IPFS via Pinata and returns { url } — a public
// link anyone can open. A coin launched for the app uses it as its website.
//
// Env: PINATA_JWT (required), PINATA_GATEWAY (optional, e.g. you.mypinata.cloud)

export const config = { runtime: "edge" };

const MAX_BYTES = 2 * 1024 * 1024;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return Response.json({ error: "Use POST" }, { status: 405 });
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return Response.json({ error: "Publishing is not configured (PINATA_JWT is missing)." }, { status: 500 });
  const gateway = process.env.PINATA_GATEWAY ? `https://${process.env.PINATA_GATEWAY}/ipfs/` : "https://ipfs.io/ipfs/";

  let body: { name?: unknown; html?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const html = typeof body.html === "string" ? body.html : "";
  const name = (typeof body.name === "string" ? body.name : "app").trim().slice(0, 60) || "app";
  if (!/^\s*<!doctype html/i.test(html)) return Response.json({ error: "Nothing to publish yet." }, { status: 400 });
  if (new TextEncoder().encode(html).length > MAX_BYTES) return Response.json({ error: "The app is larger than 2 MB." }, { status: 400 });

  const form = new FormData();
  form.append("file", new Blob([html], { type: "text/html" }), "index.html");
  form.append("pinataMetadata", JSON.stringify({ name: `reboot-${name}` }));
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!res.ok) return Response.json({ error: `Publishing failed (${res.status}).` }, { status: 502 });
  const { IpfsHash } = (await res.json()) as { IpfsHash: string };
  return Response.json({ url: `${gateway}${IpfsHash}`, cid: IpfsHash });
}

declare const process: { env: Record<string, string | undefined> };
