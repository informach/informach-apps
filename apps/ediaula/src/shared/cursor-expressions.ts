import { clipSpeed } from "./timeline.ts";
import type { Clip, CursorSprite } from "./types.ts";

type PositionChange = { frame: number; value: number };

/** Immutable per-frame coordinates: framesync may read either input ahead. */
export function cursorOverlayExpressions(
  cursor: CursorSprite,
  clip: Pick<Clip, "in" | "duration" | "speed">,
  fps: number,
): { x: string; y: string } {
  const total = cursor.positions.length / 2;
  if (!Number.isInteger(total) || total < 1) throw new Error("Cursor positions are missing");
  const changes: [PositionChange[], PositionChange[]] = [[], []];
  const frames = Math.max(1, Math.ceil(clip.duration * fps));
  for (let frame = 0; frame < frames; frame++) {
    const sourceFrame = Math.min(
      total - 1,
      Math.max(0, Math.round((clip.in + (frame / fps) * clipSpeed(clip)) * cursor.fps)),
    );
    for (const axis of [0, 1] as const) {
      const value = cursor.positions[sourceFrame * 2 + axis];
      if (!Number.isFinite(value)) throw new Error("Cursor position is not finite");
      if (changes[axis].at(-1)?.value !== value) changes[axis].push({ frame, value });
    }
  }
  // Round the overlay's timestamp to its output frame, avoiding decimal time
  // boundaries such as 0.9667 that do not coincide with 29/30 seconds.
  const frame = `floor(t*${fps}+0.5)`;
  function expression(values: PositionChange[], start = 0, end = values.length): string {
    if (end - start === 1) return String(values[start].value);
    const middle = Math.floor((start + end) / 2);
    // A balanced lookup keeps AVExpr parser/evaluation depth logarithmic even
    // for recordings with hundreds of thousands of position changes.
    return `if(lt(${frame},${values[middle].frame}),${expression(values, start, middle)},${expression(values, middle, end)})`;
  }
  return { x: expression(changes[0]), y: expression(changes[1]) };
}
