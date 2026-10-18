import { z } from "zod";
import type { Track } from "./model";

export const keyRetimingSchema = z.strictObject({
  deltaFrames: z.number().min(-360000).max(360000),
  scale: z.number().min(0.01).max(100),
  anchorFrame: z.number().min(0).max(360000),
});
export type KeyRetiming = z.infer<typeof keyRetimingSchema>;

/** Same numeric operation for validated TRS and rig channels. No mutations or
 * shared returned keys/easing. Callers own cross-track selection/budget checks. */
export function retimeKeyframes(
  keys: readonly Track["keys"][number][],
  selected: ReadonlySet<string>,
  frames: number,
  input: KeyRetiming,
  copy: boolean,
): Track["keys"] {
  const options = keyRetimingSchema.parse(input);
  if (!Number.isInteger(frames) || frames < 1 || frames > 360000)
    throw new Error("Duração inválida para reposicionamento de chaves.");
  const changes = keys.filter((key) => selected.has(key.id));
  if (keys.length > 10000 || keys.length + (copy ? changes.length : 0) > 10000)
    throw new Error("Orçamento de chaves por canal excedido.");
  function frame(value: number) {
    const next =
      options.anchorFrame + (value - options.anchorFrame) * options.scale + options.deltaFrames;
    if (!Number.isFinite(next) || next < 0 || next > frames)
      throw new Error("Reposicionamento sai da duração da animação.");
    return next;
  }
  const result = keys.map((key) => ({
    ...structuredClone(key),
    frame: !copy && selected.has(key.id) ? frame(key.frame) : key.frame,
  }));
  if (copy)
    result.push(
      ...changes.map((key) => ({
        ...structuredClone(key),
        id: `key-${crypto.randomUUID()}`,
        frame: frame(key.frame),
      })),
    );
  result.sort((a, b) => a.frame - b.frame);
  for (let index = 1; index < result.length; index++)
    if (result[index - 1]?.frame === result[index]?.frame)
      throw new Error("Reposicionamento causa colisão de chaves.");
  return result;
}
