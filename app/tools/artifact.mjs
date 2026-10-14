// Builds the claude.ai artifact version of Reboot into one HTML file:
//   node tools/artifact.mjs  ->  dist-artifact/nextapp.html (file name kept so the published link stays the same)
// In that build, apps are built by asking Claude from the page (the `sample`
// capability) instead of api/generate.ts, and coin launches are switched off.
import { build } from "vite";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";

await build({ mode: "artifact", base: "./", logLevel: "warn", build: { outDir: "dist-artifact/tmp", emptyOutDir: true } });

const html = readFileSync("dist-artifact/tmp/index.html", "utf8");
const assets = readdirSync("dist-artifact/tmp/assets");
const js = assets.filter((f) => f.endsWith(".js"));
if (js.length !== 1) throw new Error(`Expected one JS chunk, got ${js.join(", ")}`);
const code = readFileSync(`dist-artifact/tmp/assets/${js[0]}`, "utf8").replace(/<\/script/gi, "<\\/script");

const pick = (re) => html.match(re)?.[0] ?? "";
const page = [
  pick(/<title>[\s\S]*?<\/title>/),
  pick(/<meta name="description"[^>]*>/),
  ...html.match(/<link rel="(preconnect|stylesheet)"[^>]*>/g),
  pick(/<style>[\s\S]*?<\/style>/),
  html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).replace(/<script type="module"[^>]*><\/script>/, "").trim(),
  `<script type="module">${code}</script>`,
].join("\n");

mkdirSync("dist-artifact", { recursive: true });
writeFileSync("dist-artifact/nextapp.html", page);
console.log(`dist-artifact/nextapp.html  ${(page.length / 1024).toFixed(1)} kB`);
