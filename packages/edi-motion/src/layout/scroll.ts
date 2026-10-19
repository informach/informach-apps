import type { z } from "zod";
import type { scrollSettingsSchema } from "./model";

export interface ScrollAxis {
  position: number;
  velocity: number;
}
export interface ScrollState {
  x: ScrollAxis;
  y: ScrollAxis;
}
export interface ScrollBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
type Settings = z.infer<typeof scrollSettingsSchema>;
function finite(...values: number[]) {
  if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e7))
    throw new Error("Estado de scroll fora do intervalo permitido.");
}
function spring(
  source: ScrollAxis,
  target: number,
  seconds: number,
  settings: Settings,
): ScrollAxis {
  if (seconds === 0) return { ...source };
  const x = source.position - target,
    v = source.velocity,
    damping = settings.damping / 2,
    difference = damping * damping - settings.spring;
  let offset: number, velocity: number;
  if (Math.abs(difference) < 1e-9) {
    const exponential = Math.exp(-damping * seconds),
      coefficient = v + damping * x;
    offset = exponential * (x + coefficient * seconds);
    velocity = exponential * (v - damping * coefficient * seconds);
  } else if (difference < 0) {
    const omega = Math.sqrt(-difference),
      cosine = Math.cos(omega * seconds),
      sine = Math.sin(omega * seconds),
      exponential = Math.exp(-damping * seconds);
    offset = exponential * (x * cosine + ((v + damping * x) / omega) * sine);
    velocity = exponential * (v * cosine - ((damping * v + settings.spring * x) / omega) * sine);
  } else {
    const root = Math.sqrt(difference),
      a = -damping + root,
      b = -damping - root,
      left = (v - b * x) / (a - b),
      right = x - left;
    offset = left * Math.exp(a * seconds) + right * Math.exp(b * seconds);
    velocity = a * left * Math.exp(a * seconds) + b * right * Math.exp(b * seconds);
  }
  // Re-entering the legal range settles at the boundary rather than creating
  // an unbounded oscillation/second fling. Thresholds are spatial/velocity,
  // never arbitrary delays or frame-count timing.
  if ((x === 0 ? v : x) * offset <= 0 || (Math.abs(offset) < 0.01 && Math.abs(velocity) < 0.01))
    return { position: target, velocity: 0 };
  return { position: target + offset, velocity };
}
function axis(
  source: ScrollAxis,
  min: number,
  max: number,
  seconds: number,
  settings: Settings,
): ScrollAxis {
  finite(source.position, source.velocity, min, max);
  if (min > max) throw new Error("Limites de scroll invertidos.");
  if (source.position < min || source.position > max)
    return settings.bounce
      ? spring(source, Math.max(min, Math.min(max, source.position)), seconds, settings)
      : { position: Math.max(min, Math.min(max, source.position)), velocity: 0 };
  const decay = Math.exp(-settings.friction * seconds),
    position = source.position + (source.velocity / settings.friction) * (1 - decay),
    velocity = source.velocity * decay;
  if (position >= min && position <= max)
    return Math.abs(velocity) < 0.01 ? { position, velocity: 0 } : { position, velocity };
  const boundary = position < min ? min : max;
  if (!settings.bounce) return { position: boundary, velocity: 0 };
  const fraction = 1 - ((boundary - source.position) * settings.friction) / source.velocity;
  if (fraction <= 0 || fraction > 1)
    throw new Error("Cruzamento de scroll numericamente inválido.");
  const crossing = -Math.log(fraction) / settings.friction;
  const result = spring(
    { position: boundary, velocity: source.velocity * Math.exp(-settings.friction * crossing) },
    boundary,
    Math.max(0, seconds - crossing),
    settings,
  );
  return result;
}
export function advanceScroll(
  source: ScrollState,
  bounds: ScrollBounds,
  seconds: number,
  settings: Settings,
): ScrollState {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 10)
    throw new Error("Avanço de scroll requer 0–10 segundos.");
  const next = {
    x:
      settings.axis === "y"
        ? { position: 0, velocity: 0 }
        : axis(source.x, bounds.minX, bounds.maxX, seconds, settings),
    y:
      settings.axis === "x"
        ? { position: 0, velocity: 0 }
        : axis(source.y, bounds.minY, bounds.maxY, seconds, settings),
  };
  finite(next.x.position, next.x.velocity, next.y.position, next.y.velocity);
  return next;
}
export const scrollMoving = (value: ScrollState) =>
  value.x.velocity !== 0 || value.y.velocity !== 0;
