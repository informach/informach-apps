import type { CaptureRect } from "./capture-geometry.ts";
import { captureRectSchema } from "./capture-geometry.ts";

/** Bounds already mapped from Windows physical coordinates to output pixels by the caller.
 * Two background renders preserve colored alpha and monochrome AND/XOR cursor semantics.
 * Windows screenToDipRect belongs at the main boundary; physical origins cannot be inferred.
 */
export function paintCaptureCursor(
  output: Uint8Array,
  width: number,
  height: number,
  cursor: {
    width: number;
    height: number;
    black: Uint8Array;
    white: Uint8Array;
    destination: CaptureRect;
  },
): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 100_000_000 ||
    output.byteLength !== width * height * 4
  )
    throw new Error("Bitmap de destino inválido.");
  if (
    !Number.isSafeInteger(cursor.width) ||
    !Number.isSafeInteger(cursor.height) ||
    cursor.width < 1 ||
    cursor.height < 1 ||
    cursor.width > 512 ||
    cursor.height > 512 ||
    cursor.black.byteLength !== cursor.width * cursor.height * 4 ||
    cursor.white.byteLength !== cursor.black.byteLength
  )
    throw new Error("Bitmap de cursor inválido.");
  const d = captureRectSchema.parse(cursor.destination);
  for (let y = Math.max(0, Math.round(d.y)); y < Math.min(height, Math.round(d.y + d.height)); y++)
    for (
      let x = Math.max(0, Math.round(d.x));
      x < Math.min(width, Math.round(d.x + d.width));
      x++
    ) {
      const cx = Math.max(
        0,
        Math.min(cursor.width - 1, Math.floor(((x + 0.5 - d.x) * cursor.width) / d.width)),
      );
      const cy = Math.max(
        0,
        Math.min(cursor.height - 1, Math.floor(((y + 0.5 - d.y) * cursor.height) / d.height)),
      );
      const source = (cy * cursor.width + cx) * 4,
        target = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const black = cursor.black[source + channel],
          white = cursor.white[source + channel],
          background = output[target + channel];
        if (black === undefined || white === undefined || background === undefined)
          throw new Error("Bitmap de cursor truncado.");
        output[target + channel] = Math.round(black + ((white - black) * background) / 255);
      }
    }
}
