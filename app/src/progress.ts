// The live progress readout in the chat while an app is planned and built:
// a percentage, a bar, the elapsed time and an estimate of the time left.
//
// Claude doesn't report progress, so it's estimated from what's known: how
// much text the plan and app usually take, how much has arrived, and how fast
// it's arriving. Thinking time before any text shows as slow, steady progress.
// The percentage never goes backwards and only reaches 100% when done.

export type Phase = "read" | "plan" | "think" | "write";

const fmt = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

function left(secs: number): string {
  if (!isFinite(secs) || secs <= 0) return "";
  if (secs < 45) return "less than a minute left";
  if (secs < 90) return "about a minute left";
  return `about ${Math.round(secs / 60)} min left`;
}

/** Typical plan length, and how long a typical app is when none is known. */
const PLAN_CHARS = 3500;
export const EXPECTED_APP_CHARS = { build: 34_000, remake: 60_000, edit: 5_000 };

export class Progress {
  private el: HTMLElement;
  private start = performance.now();
  private phaseStart = performance.now();
  private writeStart = 0;
  private pct = 0;
  private phase: Phase = "think";
  private ranges: Record<Phase, [number, number]>;
  private label = "Starting…";
  private eta = "";
  private timer: number;
  private expected: number;

  constructor(host: HTMLElement, opts: { remake: boolean; expectedChars: number }) {
    this.expected = opts.expectedChars;
    this.ranges = opts.remake
      ? { read: [0, 4], plan: [4, 22], think: [22, 30], write: [30, 99] }
      : { read: [0, 0], plan: [0, 0], think: [0, 10], write: [10, 99] };
    this.el = document.createElement("div");
    this.el.className = "prog";
    this.el.innerHTML = `
      <div class="prog-top"><span class="working"><i></i><span class="lbl"></span></span><b class="pct">0%</b></div>
      <div class="prog-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="Build progress"><i></i></div>
      <div class="prog-meta"><span class="el">0:00</span><span class="eta"></span></div>`;
    host.prepend(this.el);
    this.timer = window.setInterval(() => this.tick(), 1000);
    this.render();
  }

  /** Seconds since the build started. */
  get elapsed() { return (performance.now() - this.start) / 1000; }

  setPhase(phase: Phase, label: string) {
    if (phase !== this.phase) this.phaseStart = performance.now();
    this.phase = phase;
    this.label = label;
    this.eta = "";
    this.bump(this.ranges[phase][0]);
  }

  /** The blueprint has `chars` characters so far. */
  planned(chars: number) {
    const [lo, hi] = this.ranges.plan;
    this.bump(lo + (hi - lo) * Math.min(chars / PLAN_CHARS, 0.97));
  }

  /** The app has `chars` characters so far. `part` > 0 means a long answer is being continued. */
  wrote(chars: number, part = 0) {
    if (this.phase !== "write") {
      this.setPhase("write", "Writing the app…");
      this.writeStart = performance.now();
    }
    if (chars > this.expected * 0.95) this.expected = chars * 1.15;
    const [lo, hi] = this.ranges.write;
    this.bump(lo + (hi - lo) * Math.min(chars / this.expected, 0.98));
    this.label = `Writing… ${Math.round(chars / 1000)}k characters${part ? ` (part ${part + 1})` : ""}`;
    const secs = (performance.now() - this.writeStart) / 1000;
    if (secs > 4 && chars > 2000) this.eta = left((this.expected - chars) / (chars / secs));
    this.render();
  }

  done() {
    window.clearInterval(this.timer);
    this.pct = 100;
    this.label = "Done";
    this.eta = "";
    this.render();
  }

  stop() { window.clearInterval(this.timer); }

  private bump(p: number) { this.pct = Math.max(this.pct, Math.min(p, 99)); this.render(); }

  private tick() {
    // Phases without text to measure creep forward so the bar never looks stuck.
    const t = (performance.now() - this.phaseStart) / 1000;
    const [lo, hi] = this.ranges[this.phase];
    if (this.phase === "think" || this.phase === "read") this.bump(lo + (hi - lo) * (1 - Math.exp(-t / 45)));
    this.render();
  }

  private render() {
    const q = <T extends Element>(s: string) => this.el.querySelector(s) as T;
    q<HTMLElement>(".lbl").textContent = this.label;
    q<HTMLElement>(".pct").textContent = `${Math.floor(this.pct)}%`;
    q<HTMLElement>(".prog-track i").style.width = `${this.pct}%`;
    q<HTMLElement>(".prog-track").setAttribute("aria-valuenow", String(Math.floor(this.pct)));
    q<HTMLElement>(".el").textContent = fmt(this.elapsed);
    q<HTMLElement>(".eta").textContent = this.eta;
  }
}

export const duration = fmt;
