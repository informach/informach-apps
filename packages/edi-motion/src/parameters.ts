import { driverFrames } from "./driverClocks";
import { evaluateNumericKeys } from "./evaluator";
import type { Animation, Track } from "./model";
import type { AnimationDriver } from "./playback";
export function parameterKey(instancePath: readonly string[], targetId: string, property: string) {
  return JSON.stringify([instancePath, targetId, property]);
}

export interface ParameterDefinition {
  initial: number;
  bounds: readonly [number, number];
  discrete: boolean;
  ownerIds: readonly string[];
}
export interface ParameterTrack {
  key: string;
  /** undefined denotes a static component, null the root clock. */
  clockId: string | null | undefined;
  keys: Track["keys"];
}
export interface ParameterContext {
  definitions: ReadonlyMap<string, ParameterDefinition>;
  clips: ReadonlyMap<string, readonly ParameterTrack[]>;
}
export function parameterValue(definition: ParameterDefinition, value: number) {
  if (!Number.isFinite(value)) throw new Error("Parâmetro calculado fora do intervalo numérico.");
  const bounded = Math.max(definition.bounds[0], Math.min(definition.bounds[1], value));
  return definition.discrete ? Math.round(bounded) : bounded;
}
/** Samples the same ordered component clocks as transforms, never a second timer. */
export function evaluateParameters(
  context: ParameterContext | undefined,
  animation: Animation | undefined,
  frame: number,
  seconds: number,
  drivers: readonly AnimationDriver[],
) {
  const values = new Map<string, number>();
  if (!context) return values;
  function sample(clip: Animation, time: number, clockId: string | null) {
    for (const track of context?.clips.get(clip.id) ?? []) {
      if (track.clockId !== clockId) continue;
      const definition = context?.definitions.get(track.key);
      if (!definition) throw new Error("Canal de parâmetro órfão.");
      values.set(
        track.key,
        evaluateNumericKeys(track.keys, time, definition.bounds, definition.discrete),
      );
    }
  }
  if (animation) sample(animation, frame, null);
  const frames = driverFrames(seconds, drivers);
  for (const driver of drivers) {
    const time = frames.get(driver.id);
    if (time === undefined) throw new Error("Relógio de parâmetro órfão.");
    sample(driver.animation, time, driver.id);
  }
  return values;
}
