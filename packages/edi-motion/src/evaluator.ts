import type { Animation, Easing, Property, Track, Transform } from "./model";
import { propertyBounds } from "./model";

export function frameAtSeconds(
  seconds: number,
  animation: Pick<Animation, "fps" | "frames" | "mode">,
): number {
  if (!Number.isFinite(seconds)) throw new Error("Tempo de reprodução inválido.");
  const raw = Math.max(0, seconds) * animation.fps;
  if (!Number.isFinite(raw)) throw new Error("Tempo de reprodução excede o limite numérico.");
  if (animation.mode === "once") return Math.min(animation.frames, raw);
  if (animation.mode === "ping-pong") {
    const phase = raw % (2 * animation.frames);
    return phase <= animation.frames ? phase : 2 * animation.frames - phase;
  }
  return raw % animation.frames;
}

export function ease(progress: number, easing: Easing): number {
  if (!Number.isFinite(progress)) throw new Error("Progresso de interpolação inválido.");
  const p = Math.max(0, Math.min(1, progress));
  if (p === 0 || p === 1 || easing === "linear") return p;
  if (easing === "hold") return 0;
  if (easing.kind === "elastic") {
    const phase = (easing.period / (2 * Math.PI)) * Math.asin(1 / easing.amplitude);
    return (
      1 + easing.amplitude * 2 ** (-10 * p) * Math.sin(((p - phase) * 2 * Math.PI) / easing.period)
    );
  }
  const [x1, y1, x2, y2] = easing.points;
  const cubic = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0,
    high = 1;
  for (let step = 0; step < 40; step++) {
    const t = (low + high) / 2;
    if (cubic(t, x1, x2) < p) low = t;
    else high = t;
  }
  return cubic((low + high) / 2, y1, y2);
}

export function evaluateTrack(track: Track, frame: number): number {
  return evaluateNumericKeys(track.keys, frame, propertyBounds[track.property]);
}

/** Shared interpolation for transform and typed numeric rig channels. */
export function evaluateNumericKeys(
  keys: Track["keys"],
  frame: number,
  bounds: readonly [number, number],
  discrete = false,
): number {
  if (!Number.isFinite(frame)) throw new Error("Quadro inválido.");
  const first = keys[0],
    last = keys.at(-1);
  if (!first || !last) throw new Error("Trilha sem chaves.");
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
  let low = 0,
    high = keys.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    const key = keys[middle];
    if (!key) throw new Error("Índice de chave inválido.");
    if (key.frame <= frame) low = middle;
    else high = middle;
  }
  const a = keys[low],
    b = keys[high];
  if (!a || !b) throw new Error("Intervalo de chaves inválido.");
  const value = discrete
    ? a.value
    : a.value + (b.value - a.value) * ease((frame - a.frame) / (b.frame - a.frame), a.easing);
  // Curves may overshoot. Property limits (especially scale/opacity) apply to
  // the evaluated pose too, identically in editor and runtime.
  const [min, max] = bounds;
  return Math.max(min, Math.min(max, value));
}

export function evaluateAnimation(
  animation: Animation,
  frame: number,
): Map<string, Partial<Transform>> {
  if (!Number.isFinite(frame)) throw new Error("Quadro inválido.");
  const pose = new Map<string, Partial<Record<Property, number>>>();
  for (const track of animation.tracks) {
    let transform = pose.get(track.targetId);
    if (!transform) {
      transform = {};
      pose.set(track.targetId, transform);
    }
    transform[track.property] = evaluateTrack(track, frame);
  }
  return pose;
}
