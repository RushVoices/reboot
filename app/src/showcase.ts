// The hero animation: a 3D phone that shows the whole idea in one loop.
// A paid app's link gets copied, typed into Reboot, planned and built, and
// your own free version appears with its coin. Pauses when off screen; with
// reduced motion it shows the finished app and stays still.

const sleep = (ms: number, signal: { stop: boolean }) =>
  new Promise<void>((resolve, reject) => setTimeout(() => (signal.stop ? reject(new Error("stopped")) : resolve()), ms));

export function startShowcase(root: HTMLElement) {
  const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const screen = q(".screen");
  const scenes = ["store", "next", "build", "done"] as const;
  const show = (name: (typeof scenes)[number]) => {
    for (const s of scenes) q(`.s-${s}`).classList.toggle("on", s === name);
    root.dataset.scene = name;
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) { show("done"); root.classList.add("still"); return; }

  // Tilt toward the pointer.
  const scene = q(".scene");
  root.addEventListener("pointermove", (e) => {
    const r = root.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    scene.style.setProperty("--ry", `${-18 + x * 14}deg`);
    scene.style.setProperty("--rx", `${8 - y * 10}deg`);
  });
  root.addEventListener("pointerleave", () => { scene.style.removeProperty("--ry"); scene.style.removeProperty("--rx"); });

  const tap = q(".tap");
  const tapAt = (target: HTMLElement) => {
    // Offsets, not getBoundingClientRect: the 3D tilt skews screen rectangles.
    let x = target.offsetLeft + target.offsetWidth / 2, y = target.offsetTop + target.offsetHeight / 2;
    for (let el = target.offsetParent as HTMLElement | null; el && el !== screen; el = el.offsetParent as HTMLElement | null) { x += el.offsetLeft; y += el.offsetTop; }
    tap.style.left = `${x}px`;
    tap.style.top = `${y}px`;
    tap.classList.remove("go");
    void tap.offsetWidth;
    tap.classList.add("go");
    target.classList.add("pressed");
    setTimeout(() => target.classList.remove("pressed"), 260);
  };

  const url = q(".typed");
  const pct = q(".b-pct");
  const bar = q<HTMLElement>(".b-bar i");
  const label = q(".b-label");
  const lines = [...root.querySelectorAll<HTMLElement>(".b-lines li")];
  const toast = q(".mini-toast");
  const coin = q(".card-coin");
  const pctCard = q(".card-pct b");

  let run = { stop: false };
  let running = false;

  async function loop(sig: { stop: boolean }) {
    for (;;) {
      // 1. A paid app: tap Share, the link is copied.
      show("store");
      coin.classList.remove("on");
      url.textContent = "";
      await sleep(1100, sig);
      tapAt(q(".share"));
      await sleep(250, sig);
      toast.classList.add("on");
      await sleep(1300, sig);
      toast.classList.remove("on");

      // 2. Reboot: paste the link.
      show("next");
      await sleep(700, sig);
      const text = "notely.pro";
      for (const ch of text) { url.textContent += ch; await sleep(85, sig); }
      await sleep(350, sig);
      tapAt(q(".remake"));
      await sleep(450, sig);

      // 3. Plan and build.
      show("build");
      lines.forEach((l) => l.classList.remove("on"));
      for (let p = 0; p <= 100; p += 2) {
        pct.textContent = `${p}%`;
        pctCard.textContent = `${p}%`;
        bar.style.width = `${p}%`;
        label.textContent = p < 12 ? "Reading notely.pro…" : p < 38 ? "Writing the blueprint…" : p < 100 ? "Writing the app…" : "Done";
        const shown = Math.floor((p / 100) * lines.length);
        lines.forEach((l, i) => l.classList.toggle("on", i < shown));
        await sleep(62, sig);
      }
      await sleep(300, sig);

      // 4. Your own version, free, with its coin.
      show("done");
      await sleep(700, sig);
      coin.classList.add("on");
      await sleep(3600, sig);
    }
  }

  const play = () => {
    if (running) return;
    running = true;
    run = { stop: false };
    loop(run).catch(() => { running = false; });
  };
  const pause = () => { run.stop = true; running = false; };

  new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? play() : pause()), { threshold: 0.2 }).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : root.getBoundingClientRect().top < innerHeight && play()));
}
