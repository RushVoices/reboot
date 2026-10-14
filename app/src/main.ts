// Reboot: describe an app, paste code or point at a website, watch it get
// planned and built, keep changing it, publish it, and launch its coin on
// pump.fun.

import { IN_ARTIFACT, build, fetchSite, plan, type BuildRequest } from "./build";
import { cleanHtml, siteNotes } from "./site";
import { EXPECTED_APP_CHARS, Progress, duration } from "./progress";
import { startShowcase } from "./showcase";
import { PRESETS } from "./presets";
import {
  type Project, deleteProject, getProject, listProjects, nameFrom, newProject, saveProject,
} from "./store";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
// The artifact build can't reach Solana or a wallet, so it never loads the chain code.
const chain = () => {
  if (IN_ARTIFACT) throw new Error("Coin launches run on your deployed Reboot site. This preview inside Claude can't reach Solana or your wallet.");
  return import("./chain/launch");
};


let project: Project | null = null;
let busy: AbortController | null = null;

// ---- small helpers ----------------------------------------------------------

function toast(text: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const shortKey = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;
const current = () => (project && project.current >= 0 ? project.versions[project.current] : null);

function onCmdEnter(el: HTMLTextAreaElement, fn: () => void) {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fn(); }
  });
}

// ---- routing ------------------------------------------------------------------

function route() {
  const id = location.hash.match(/^#app\/(\w+)/)?.[1];
  if (id && project?.id === id) return;
  const p = id ? getProject(id) : null;
  if (p) openStudio(p);
  else if (location.hash === "#docs") showDocs();
  else showHome();
}

function leaveStudio() {
  busy?.abort();
  project = null;
  $("studio").hidden = true;
}

function showHome() {
  leaveStudio();
  $("docs").hidden = true;
  $("home").hidden = false;
  document.title = "Reboot";
  renderApps();
}

function showDocs() {
  leaveStudio();
  $("home").hidden = true;
  $("docs").hidden = false;
  document.title = "Docs · Reboot";
  window.scrollTo(0, 0);
}

/** Goes to the home page (if needed), then scrolls to one of its sections. */
function goHome(sectionId?: string) {
  if (location.hash) location.hash = "";
  else showHome();
  requestAnimationFrame(() => {
    if (sectionId) $(sectionId).scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ---- home -----------------------------------------------------------------------

type Mode = "idea" | "site" | "code";
let mode: Mode = "idea";
const QUALITY: Record<Mode, string> = {
  idea: "Usually ready in a few minutes",
  site: "Reads the site, writes a blueprint, then builds from it",
  code: "Writes a blueprint of your code, then rebuilds it",
};

function setMode(m: Mode, focus = true) {
  mode = m;
  const tabs: Record<Mode, string> = { idea: "tabIdea", site: "tabSite", code: "tabCode" };
  const panels: Record<Mode, string> = { idea: "panelIdea", site: "panelSite", code: "panelCode" };
  for (const k of Object.keys(tabs) as Mode[]) {
    $(tabs[k]).setAttribute("aria-selected", String(k === m));
    $(panels[k]).hidden = k !== m;
  }
  $("qualityText").textContent = QUALITY[m];
  $("startBtn").textContent = m === "idea" ? "Build it" : "Remake it";
  if (focus) ({ idea: $("ideaText"), site: $("siteUrl"), code: $("codeText") })[m].focus();
}

function renderPresets() {
  $("presets").innerHTML = PRESETS.map((p, i) => `
    <button class="preset" type="button" data-i="${i}">
      <span class="ico"><svg viewBox="0 0 24 24" role="img" aria-label="${esc(p.logo.title)} logo"><path fill="#${p.logo.hex}" d="${p.logo.path}"/></svg></span>
      <span class="txt"><b>${esc(p.title)}</b><small>like ${esc(p.logo.title)}</small></span>
    </button>`).join("");
  $("presets").querySelectorAll<HTMLButtonElement>(".preset").forEach((b) =>
    b.addEventListener("click", () => {
      const p = PRESETS[Number(b.dataset.i)];
      setMode("idea");
      $<HTMLTextAreaElement>("ideaText").value = p.prompt;
      start(p.title);
    }),
  );
}

function renderApps() {
  const list = listProjects().filter((p) => p.versions.length);
  const box = $("apps");
  if (!list.length) {
    box.innerHTML = `<p class="empty">Apps you build show up here. They're saved in this browser.</p>`;
    return;
  }
  box.innerHTML = list.map((p) => `
    <button class="app-card" type="button" data-id="${p.id}">
      <div class="thumb"><iframe sandbox tabindex="-1" aria-hidden="true" loading="lazy"></iframe></div>
      <div class="meta"><b>${esc(p.name)}</b>${p.coin ? `<span class="tag">$${esc(p.coin.symbol)}</span>` : ""}</div>
    </button>`).join("");
  box.querySelectorAll<HTMLButtonElement>(".app-card").forEach((card) => {
    const p = list.find((x) => x.id === card.dataset.id)!;
    // Thumbnails render without scripts, so they're static and safe.
    card.querySelector("iframe")!.srcdoc = p.versions[p.current]?.html ?? "";
    card.addEventListener("click", () => { location.hash = `app/${p.id}`; });
  });
}

const val = (id: string) => $<HTMLInputElement | HTMLTextAreaElement>(id).value.trim();
const clear = (...ids: string[]) => ids.forEach((id) => { $<HTMLInputElement | HTMLTextAreaElement>(id).value = ""; });

function start(name?: string) {
  if (mode === "idea") {
    const prompt = val("ideaText");
    if (!prompt) { toast("Describe the app you want."); return; }
    open(name ?? nameFrom("", prompt));
    clear("ideaText");
    void runBuild(prompt);
  } else if (mode === "code") {
    const source = val("codeText");
    if (!source) { toast("Paste some code to remake."); return; }
    const want = val("codeWant");
    open("My app");
    clear("codeText", "codeWant");
    void runRemake({ source, want });
  } else {
    const url = val("siteUrl").replace(/^https?:\/\//i, "").replace(/\/$/, "");
    const pasted = val("sitePaste");
    if (!url && !pasted) { toast("Enter a website address, or paste the page's code."); return; }
    if (url && !/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(url)) { toast("That doesn't look like a website address. Try something like linear.app"); return; }
    const want = val("siteWant");
    open(url ? url.split("/")[0] : "Website remake");
    clear("siteUrl", "siteWant", "sitePaste");
    void runRemake({ url: url ? `https://${url}` : "", pasted, want });
  }
}

/** Creates a new project and opens it in the studio. */
function open(name: string) {
  const p = newProject(name);
  saveProject(p);
  openStudio(p);
  location.hash = `app/${p.id}`;
}

// ---- studio ---------------------------------------------------------------------

function openStudio(p: Project) {
  if (project?.id !== p.id) busy?.abort();
  project = p;
  $("home").hidden = true;
  $("studio").hidden = false;
  $<HTMLInputElement>("appName").value = p.name;
  document.title = `${p.name} · Reboot`;
  renderLog();
  renderVersions();
  renderPreview();
  renderCoin();
  window.scrollTo(0, 0);
}

function persist() {
  if (!project) return;
  project.updated = Date.now();
  saveProject(project);
}

function renderLog(extra?: HTMLElement) {
  const log = $("log");
  log.innerHTML = "";
  project?.versions.forEach((v, i) => {
    const you = document.createElement("div");
    you.className = "msg you";
    you.textContent = v.prompt;
    const ai = document.createElement("div");
    ai.className = "msg ai";
    ai.textContent = v.note || "Done.";
    const tag = document.createElement("span");
    tag.className = "v";
    tag.innerHTML = i === project!.current
      ? `<span class="mono">Version ${i + 1} · showing${v.secs ? ` · built in ${duration(v.secs)}` : ""}</span>`
      : `<button type="button">Go back to version ${i + 1}</button>`;
    tag.querySelector("button")?.addEventListener("click", () => setVersion(i));
    ai.append(tag);
    if (v.plan) blueprintBox(ai, false)(v.plan);
    log.append(you, ai);
  });
  if (extra) log.append(extra);
  log.scrollTop = log.scrollHeight;
}

function renderVersions() {
  const sel = $<HTMLSelectElement>("versions");
  const vs = project?.versions ?? [];
  sel.hidden = !vs.length;
  sel.innerHTML = vs.map((v, i) => `<option value="${i}">Version ${i + 1}: ${esc(v.prompt.slice(0, 40))}</option>`).reverse().join("");
  sel.value = String(project?.current ?? 0);
  const has = !!vs.length;
  for (const id of ["dlBtn", "pubBtn", "coinBtn"]) $<HTMLButtonElement>(id).disabled = !has || !!busy;
}

function setVersion(i: number) {
  if (!project || busy) return;
  project.current = i;
  persist();
  renderLog();
  renderVersions();
  renderPreview();
}

let lastFrameHtml = "";
function renderPreview(live?: string) {
  const html = live ?? current()?.html ?? "";
  $("blank").hidden = !!html;
  $("frame").hidden = !html;
  $("code").textContent = html;
  if (html !== lastFrameHtml) {
    lastFrameHtml = html;
    $<HTMLIFrameElement>("frame").srcdoc = html;
  }
}

function renderCoin() {
  const coin = project?.coin;
  const chip = $<HTMLAnchorElement>("coinChip");
  chip.hidden = !coin;
  $("coinBtn").hidden = !!coin;
  if (coin) {
    chip.href = `https://pump.fun/coin/${coin.mint}`;
    chip.textContent = `$${coin.symbol} on pump.fun ↗`;
  }
}

function setBusy(on: AbortController | null) {
  busy = on;
  $("stopBtn").hidden = !on;
  $<HTMLButtonElement>("askBtn").disabled = !!on;
  $<HTMLSelectElement>("versions").disabled = !!on;
  renderVersions();
}

/** Adds the request and a live progress bubble to the chat. */
function startTurn(label: string, opts: { remake: boolean; expectedChars: number }) {
  const you = document.createElement("div");
  you.className = "msg you";
  you.textContent = label;
  const status = document.createElement("div");
  status.className = "msg ai live";
  const wrap = document.createElement("div");
  wrap.style.display = "contents";
  wrap.append(you, status);
  renderLog(wrap);
  return { status, progress: new Progress(status, opts) };
}

/** Shows the blueprint inside a chat bubble as it's written. */
function blueprintBox(status: HTMLElement, open = true) {
  const d = document.createElement("details");
  d.open = open;
  d.innerHTML = `<summary>Blueprint</summary><pre></pre>`;
  status.append(d);
  const pre = d.querySelector("pre")!;
  return (text: string) => { pre.textContent = text; pre.scrollTop = pre.scrollHeight; };
}

async function runBuild(prompt: string, extra: Partial<BuildRequest> = {}, turn?: ReturnType<typeof startTurn>) {
  if (!project || (busy && !turn)) return;
  const p = project;
  const base = current();
  const ctrl = busy ?? new AbortController();
  if (!busy) setBusy(ctrl);
  const { status, progress } = turn ?? startTurn(prompt, {
    remake: false,
    expectedChars: base ? EXPECTED_APP_CHARS.edit : EXPECTED_APP_CHARS.build,
  });
  progress.setPhase("think", base && !turn ? "Reading your app and planning the change…" : "Designing your app…");

  // Throttle the code view: re-rendering on every token is wasteful.
  let lastPaint = 0;
  try {
    const out = await build(
      { prompt, html: extra.source || extra.site ? undefined : base?.html, history: p.versions.map((v) => v.prompt), ...extra },
      (prog) => {
        if (project?.id !== p.id) return;
        // Full documents count their HTML; edits to an existing app count everything written.
        if (prog.html) progress.wrote(prog.html.length, prog.part);
        else if (base && prog.raw.length > 120) progress.wrote(prog.raw.length, prog.part);
        const now = performance.now();
        if (prog.html && now - lastPaint > 1500) {
          lastPaint = now;
          $("code").textContent = prog.html;
        }
      },
      ctrl.signal,
    );
    progress.done();
    p.versions.push({ html: out.html, prompt: turn ? turnLabel(extra) : prompt, note: out.note, at: Date.now(), plan: extra.plan, secs: Math.round(progress.elapsed) });
    p.current = p.versions.length - 1;
    if (p.versions.length === 1) p.name = nameFrom(out.html, prompt);
    p.updated = Date.now();
    saveProject(p);
  } catch (err) {
    progress.stop();
    if (!ctrl.signal.aborted) {
      const e = document.createElement("div");
      e.className = "msg ai err";
      e.textContent = `${(err as Error).message || "Building failed."} (after ${duration(progress.elapsed)})`;
      status.replaceWith(e);
      if (project?.id === p.id) { setBusy(null); return; }
    }
  }
  setBusy(null);
  if (project?.id === p.id) openStudio(p);
}

const turnLabel = (r: Partial<BuildRequest>) =>
  (r.site ? `Remake ${r.site.url.replace(/^https?:\/\//, "")}` : "Remake this code") + (r.prompt ? `: ${r.prompt}` : "");

/** A remake: read the website (if any), write the blueprint, then build from it. */
async function runRemake(job: { url?: string; pasted?: string; source?: string; want: string }) {
  if (!project || busy) return;
  const p = project;
  const ctrl = new AbortController();
  setBusy(ctrl);
  const req: BuildRequest = { prompt: job.want };
  if (job.source) req.source = job.source;
  const turn = startTurn(
    turnLabel({ ...req, site: job.url || job.pasted ? { url: job.url || "the pasted page", notes: "" } : undefined }),
    { remake: true, expectedChars: EXPECTED_APP_CHARS.remake },
  );
  try {
    if (job.url || job.pasted) {
      let url = job.url || "the pasted page";
      let html = "";
      let notes = "";
      if (job.pasted) {
        html = cleanHtml(job.pasted);
        notes = siteNotes(job.pasted, job.url || "https://example.com").text;
      } else if (!IN_ARTIFACT) {
        turn.progress.setPhase("read", `Reading ${url.replace(/^https?:\/\//, "")}…`);
        const site = await fetchSite(url, ctrl.signal);
        url = site.url;
        html = site.html;
        notes = site.notes;
      }
      req.site = { url, notes };
      if (html) req.source = html;
    }
    turn.progress.setPhase("plan", "Writing the blueprint…");
    const show = blueprintBox(turn.status);
    req.plan = await plan(req, (t) => { if (project?.id === p.id) { show(t); turn.progress.planned(t.length); } }, ctrl.signal);
    show(req.plan);
    turn.status.querySelector("details")!.open = false;
  } catch (err) {
    if (!ctrl.signal.aborted) {
      const e = document.createElement("div");
      e.className = "msg ai err";
      e.textContent = (err as Error).message || "Planning failed.";
      turn.status.replaceWith(e);
    }
    turn.progress.stop();
    setBusy(null);
    return;
  }
  await runBuild(job.want, req, turn);
}

async function download() {
  const v = current();
  if (!v || !project) return;
  const filename = `${project.name.replace(/[^\w-]+/g, "-").toLowerCase() || "app"}.html`;
  if (IN_ARTIFACT) {
    const rt = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
    const dl = (await rt?.use("downloads")) as { save(f: { filename: string; data: string }): Promise<unknown> } | null;
    if (!dl) { toast("Downloads aren't available here."); return; }
    await dl.save({ filename, data: v.html }).catch(() => {});
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([v.html], { type: "text/html" }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function ensurePublished(): Promise<string> {
  if (!project) throw new Error("No app open.");
  if (IN_ARTIFACT) throw new Error("Publishing runs on your deployed Reboot site.");
  if (project.publishedUrl && project.publishedVersion === project.current) return project.publishedUrl;
  const { publishApp } = await import("./chain/ipfs");
  const url = await publishApp(project.name, current()!.html);
  project.publishedUrl = url;
  project.publishedVersion = project.current;
  persist();
  return url;
}

async function publish() {
  const btn = $<HTMLButtonElement>("pubBtn");
  btn.disabled = true;
  btn.textContent = "Publishing…";
  try {
    const url = await ensurePublished();
    await navigator.clipboard?.writeText(url).catch(() => {});
    window.open(url, "_blank", "noopener");
    toast("Published. The link is copied.");
  } catch (err) {
    toast((err as Error).message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Publish";
  }
}

// ---- coin launch --------------------------------------------------------------

let coinImage: File | null = null;

/** A default coin image: the ticker on a gradient picked from the app's name. */
async function defaultCoinImage(name: string, symbol: string): Promise<File> {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, `hsl(${hue} 85% 58%)`);
  grad.addColorStop(1, `hsl(${(hue + 60) % 360} 80% 42%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = "rgba(255,255,255,.14)";
  g.beginPath(); g.arc(400, 110, 170, 0, Math.PI * 2); g.fill();
  const text = (symbol || name.slice(0, 3)).toUpperCase().slice(0, 6);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 ${Math.min(220, 760 / Math.max(text.length, 1))}px Geist, Arial, sans-serif`;
  g.fillText(text, 256, 270);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
  return new File([blob], `${text.toLowerCase()}.png`, { type: "image/png" });
}

let autoImage = true;
async function refreshCoinImage() {
  if (!autoImage || !project) return;
  coinImage = await defaultCoinImage(project.name, $<HTMLInputElement>("cSym").value);
  $<HTMLImageElement>("coinImg").src = URL.createObjectURL(coinImage);
}

function counter(inputId: string, ctId: string, max: number) {
  const el = $<HTMLInputElement>(inputId);
  const up = () => { $(ctId).textContent = `${el.value.length}/${max}`; };
  el.addEventListener("input", up);
  up();
}

function openCoin() {
  if (!project || !current()) return;
  const name = project.name.slice(0, 32);
  $<HTMLInputElement>("cName").value = name;
  $<HTMLInputElement>("cSym").value = name.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "APP";
  $<HTMLTextAreaElement>("cDesc").value = current()!.note.slice(0, 500);
  $("cName").dispatchEvent(new Event("input"));
  $("cSym").dispatchEvent(new Event("input"));
  $("coinErr").textContent = "";
  $("coinSteps").hidden = true;
  $<HTMLButtonElement>("coinGo").disabled = false;
  autoImage = true;
  void refreshCoinImage();
  $<HTMLDialogElement>("coinDlg").showModal();
}

function step(i: number) {
  $("coinSteps").hidden = false;
  $("coinSteps").querySelectorAll("li").forEach((li) => {
    const s = Number(li.dataset.s);
    li.className = s < i ? "ok" : s === i ? "on" : "";
  });
}

async function launch() {
  if (!project) return;
  const p = project;
  const name = $<HTMLInputElement>("cName").value.trim();
  const symbol = $<HTMLInputElement>("cSym").value.trim().toUpperCase();
  const buy = Number($<HTMLInputElement>("cBuy").value.trim() || "0");
  const err = $("coinErr");
  err.textContent = "";
  if (!name || !symbol) { err.textContent = "Give the coin a name and a ticker."; return; }
  if (!Number.isFinite(buy) || buy < 0) { err.textContent = "The first buy must be a number of SOL, or 0."; return; }
  if (!coinImage) { err.textContent = "Add a coin image."; return; }

  const go = $<HTMLButtonElement>("coinGo");
  go.disabled = true;
  try {
    const { launchCoin, isLive } = await chain();
    if (!isLive()) throw new Error("Coin launches aren't switched on for this site yet.");
    step(0);
    const website = await ensurePublished();
    const res = await launchCoin(
      {
        name, symbol, image: coinImage, devBuySol: buy, website,
        description: $<HTMLTextAreaElement>("cDesc").value.trim(),
        twitter: $<HTMLInputElement>("cX").value.trim(),
        telegram: $<HTMLInputElement>("cTg").value.trim(),
      },
      (s) => step(s === "upload" ? 1 : 2),
    );
    step(4);
    p.coin = { mint: res.mint, symbol, at: Date.now() };
    p.updated = Date.now();
    saveProject(p);
    if (project?.id === p.id) renderCoin();
    $<HTMLDialogElement>("coinDlg").close();
    toast(`$${symbol} is live on pump.fun.`);
    window.open(res.url, "_blank", "noopener");
  } catch (e) {
    const msg = (e as Error).message || "Launch failed.";
    err.textContent = /reject|denied|cancel/i.test(msg) ? "You cancelled in your wallet. Nothing was launched." : msg;
    go.disabled = false;
  }
}

// ---- wire up ----------------------------------------------------------------------

$("homeBtn").addEventListener("click", () => goHome());
$("navBuild").addEventListener("click", () => goHome("build"));
$("navApps").addEventListener("click", () => goHome("mine"));
for (const id of ["navDocs", "pillDocs", "howDocs"]) $(id).addEventListener("click", () => { location.hash = "docs"; });
$("toc").addEventListener("click", (e) => {
  const to = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-to]")?.dataset.to;
  if (to) $(to).scrollIntoView({ behavior: "smooth", block: "start" });
});
$("walletBtn").addEventListener("click", async () => {
  try {
    const { connectWallet } = await chain();
    const key = await connectWallet();
    $("walletBtn").textContent = shortKey(key.toBase58());
  } catch (e) {
    toast((e as Error).message);
  }
});

$("tabIdea").addEventListener("click", () => setMode("idea"));
$("tabSite").addEventListener("click", () => setMode("site"));
$("tabCode").addEventListener("click", () => setMode("code"));
$("startForm").addEventListener("submit", (e) => { e.preventDefault(); start(); });
for (const id of ["ideaText", "siteWant", "sitePaste", "codeText", "codeWant"]) onCmdEnter($(id), () => start());
$("siteUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); start(); } });

const ask = () => {
  const t = $<HTMLTextAreaElement>("askText");
  const v = t.value.trim();
  if (!v || busy) return;
  t.value = "";
  void runBuild(v);
};
$("askForm").addEventListener("submit", (e) => { e.preventDefault(); ask(); });
onCmdEnter($("askText"), ask);
$("stopBtn").addEventListener("click", () => { busy?.abort(); setBusy(null); renderLog(); });

$<HTMLInputElement>("appName").addEventListener("change", (e) => {
  if (!project) return;
  project.name = (e.target as HTMLInputElement).value.trim() || project.name;
  document.title = `${project.name} · Reboot`;
  persist();
});
$("delBtn").addEventListener("click", () => {
  if (!project) return;
  const btn = $("delBtn");
  if (btn.dataset.armed) {
    deleteProject(project.id);
    location.hash = "";
  } else {
    btn.dataset.armed = "1";
    btn.textContent = "Sure?";
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = "Delete"; }, 3000);
  }
});

function setView(code: boolean) {
  $("viewPreview").setAttribute("aria-pressed", String(!code));
  $("viewCode").setAttribute("aria-pressed", String(code));
  $("stage").hidden = code;
  $("code").hidden = !code;
}
$("viewPreview").addEventListener("click", () => setView(false));
$("viewCode").addEventListener("click", () => setView(true));
function setDevice(phone: boolean) {
  $("devDesk").setAttribute("aria-pressed", String(!phone));
  $("devPhone").setAttribute("aria-pressed", String(phone));
  $("stage").classList.toggle("phone", phone);
}
$("devDesk").addEventListener("click", () => setDevice(false));
$("devPhone").addEventListener("click", () => setDevice(true));
$<HTMLSelectElement>("versions").addEventListener("change", (e) => setVersion(Number((e.target as HTMLSelectElement).value)));
$("dlBtn").addEventListener("click", download);
$("pubBtn").addEventListener("click", publish);

$("coinBtn").addEventListener("click", openCoin);
$("coinGo").addEventListener("click", launch);
counter("cName", "cNameCt", 32);
counter("cSym", "cSymCt", 10);
$("cSym").addEventListener("input", () => void refreshCoinImage());
$<HTMLInputElement>("coinFile").addEventListener("change", (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { $("coinErr").textContent = "The image must be 5 MB or smaller."; return; }
  autoImage = false;
  coinImage = f;
  $<HTMLImageElement>("coinImg").src = URL.createObjectURL(f);
});

if (IN_ARTIFACT) {
  // Wallets and IPFS publishing live on the deployed site.
  $("walletBtn").hidden = true;
  $("pubBtn").hidden = true;
}
setMode("idea", false);
renderPresets();
startShowcase($("showcase"));
window.addEventListener("hashchange", route);
route();
