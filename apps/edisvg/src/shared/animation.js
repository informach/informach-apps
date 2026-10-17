export const animations = {
  Parado: { frames: 120, mode: "loop" },
  Acenar: { frames: 72, mode: "ping-pong" },
  Pular: { frames: 48, mode: "once" },
};
export function frameAt(elapsed, frames, mode) {
  const raw = Math.max(0, elapsed * 60);
  if (mode === "once") return Math.min(frames, raw);
  if (mode === "ping-pong") {
    const p = raw % (frames * 2);
    return p <= frames ? p : frames * 2 - p;
  }
  return raw % frames;
}
export function poseAt(name, frame, frames) {
  const phase = Math.PI * Math.max(0, Math.min(1, frame / frames));
  return {
    y: name === "Pular" ? -70 * Math.sin(phase) : name === "Parado" ? -3 * Math.sin(phase * 2) : 0,
    rotation: name === "Acenar" ? Math.sin(phase * 2) * 7 : 0,
    scale: name === "Parado" ? 1 + 0.012 * Math.sin(phase * 2) : 1,
  };
}
export function transition(current, event, waving = false) {
  if (event === "click") return "Pular";
  if (current === "Pular" && event !== "finish") return current;
  if (event === "enter") return "Acenar";
  if (event === "leave") return "Parado";
  if (event === "finish") return waving ? "Acenar" : "Parado";
  return current;
}
