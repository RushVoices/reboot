// Uploads the token image + metadata JSON through our serverless route
// (api/upload.ts), which holds the Pinata key. Returns the metadata URI that
// pump.fun stores on the token.
export interface TokenMeta {
  name: string;
  symbol: string;
  description?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export async function uploadMetadata(image: File, meta: TokenMeta): Promise<string> {
  const form = new FormData();
  form.append("file", image);
  for (const [k, v] of Object.entries(meta)) if (v) form.append(k, v);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.uri) throw new Error(body.error || `Upload failed (${res.status})`);
  return body.uri as string;
}

/** Publishes an app's HTML to IPFS (api/publish.ts) and returns its public URL. */
export async function publishApp(name: string, html: string): Promise<string> {
  const res = await fetch("/api/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, html }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new Error(body.error || `Publishing failed (${res.status})`);
  return body.url as string;
}
