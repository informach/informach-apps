import { frameAtSeconds } from "./evaluator";
import type { AnimationDriver } from "./playback";

/** Child clocks inherit the actual bounded/wrapped parent phase. */
export function driverFrames(time: number, drivers: readonly AnimationDriver[]) {
  if (!Number.isFinite(time)) throw new Error("Relógio de componente inválido.");
  const frames = new Map<string, number>(),
    clocks = new Map<string, number>();
  for (const driver of drivers) {
    const parentTime = driver.parentId === null ? time : clocks.get(driver.parentId);
    if (parentTime === undefined)
      throw new Error("Relógios precisam estar ordenados por dependência.");
    const frame = frameAtSeconds(
      parentTime * driver.speed + driver.offsetSeconds,
      driver.animation,
    );
    clocks.set(driver.id, frame / driver.animation.fps);
    frames.set(driver.id, frame);
  }
  return frames;
}
