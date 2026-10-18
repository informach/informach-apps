type Mode = "loop" | "ping-pong" | "once";
type Pose = { y: number; rotation: number; scale: number };
type Transform = {
  x: number;
  y: number;
  rotation: number;
  sx: number;
  sy: number;
  opacity: number;
};
export interface PresetPlayerConfig {
  name: string;
  frames: number;
  mode: Mode;
  t: Transform;
  presets: Record<string, { frames: number; mode: Mode }>;
  reduced: boolean;
  offscreen: boolean;
  interactive: boolean;
}

/** DOM adapter, bundled into standalone exports after TS compilation.
 * Evaluators are explicit arguments, never a second implementation in a template. */
export function mountPresetPlayer(
  data: PresetPlayerConfig,
  frameAt: (elapsed: number, frames: number, mode: Mode) => number,
  poseAt: (name: string, frame: number, frames: number) => Pose,
  transition: (current: string, event: string, waving?: boolean) => string,
) {
  const motionElement = document.querySelector(".motion");
  const buttonElement = document.querySelector("#play-toggle");
  const artworkElement = document.querySelector(".artwork");
  if (
    !(motionElement instanceof SVGElement) ||
    !(buttonElement instanceof HTMLButtonElement) ||
    !(artworkElement instanceof HTMLElement)
  )
    throw new Error("A estrutura do player EdiSVG é inválida.");
  const motion = motionElement,
    button = buttonElement,
    artwork = artworkElement;
  motion.style.animation = "none";
  const reduced = data.reduced ? matchMedia("(prefers-reduced-motion:reduce)") : null;
  let elapsed = 0,
    last = 0,
    playing = true,
    visible = true,
    hovering = false,
    destroyed = false;
  let pending: number | null = null;
  function paint() {
    const p = poseAt(data.name, frameAt(elapsed, data.frames, data.mode), data.frames),
      t = data.t;
    motion.style.transform = `translate(${t.x}px,${t.y + p.y}px) rotate(${t.rotation + p.rotation}deg) scale(${t.sx * p.scale},${t.sy * p.scale})`;
    button.textContent = playing ? "Pausar" : "Reproduzir";
  }
  function canRun() {
    return !destroyed && playing && visible && !document.hidden && !reduced?.matches;
  }
  function wake() {
    if (pending !== null) cancelAnimationFrame(pending);
    pending = null;
    last = performance.now();
    paint();
    if (canRun()) pending = requestAnimationFrame(tick);
  }
  function change(name: string, once = false) {
    const preset = data.presets[name];
    if (!preset) throw new Error("Animação predefinida desconhecida.");
    data.name = name;
    data.frames = preset.frames;
    data.mode = once ? "once" : preset.mode;
    elapsed = 0;
    playing = true;
    wake();
  }
  function tick(now: number) {
    pending = null;
    if (canRun()) {
      elapsed += Math.max(0, now - last) / 1000;
      if (data.mode === "once" && elapsed >= data.frames / 60) {
        elapsed = data.frames / 60;
        if (data.interactive && data.name === "Pular") {
          change(transition(data.name, "finish", hovering));
          return;
        }
        playing = false;
      }
    }
    last = now;
    paint();
    if (canRun()) pending = requestAnimationFrame(tick);
  }
  function toggle() {
    if (!playing && data.mode === "once" && elapsed >= data.frames / 60) elapsed = 0;
    playing = !playing;
    wake();
  }
  function enter() {
    hovering = true;
    const next = transition(data.name, "enter");
    if (next !== data.name) change(next);
  }
  function leave() {
    hovering = false;
    const next = transition(data.name, "leave");
    if (next !== data.name) change(next);
  }
  function click() {
    if (data.name !== "Pular" || data.mode !== "once") change(transition(data.name, "click"), true);
  }
  const observer = data.offscreen
    ? new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        wake();
      })
    : null;
  observer?.observe(artwork);
  document.addEventListener("visibilitychange", wake);
  reduced?.addEventListener("change", wake);
  button.addEventListener("click", toggle);
  if (data.interactive) {
    artwork.addEventListener("mouseenter", enter);
    artwork.addEventListener("mouseleave", leave);
    artwork.addEventListener("click", click);
  }
  wake();
  return {
    destroy() {
      destroyed = true;
      if (pending !== null) cancelAnimationFrame(pending);
      pending = null;
      observer?.disconnect();
      document.removeEventListener("visibilitychange", wake);
      reduced?.removeEventListener("change", wake);
      button.removeEventListener("click", toggle);
      artwork.removeEventListener("mouseenter", enter);
      artwork.removeEventListener("mouseleave", leave);
      artwork.removeEventListener("click", click);
    },
  };
}
