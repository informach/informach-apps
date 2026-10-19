import type { Bounds } from "./model";
export function nineSlice(
  source: { width: number; height: number },
  target: { width: number; height: number },
  insets: { top: number; right: number; bottom: number; left: number },
): { source: Bounds; target: Bounds }[] {
  if (
    [...Object.values(source), ...Object.values(target), ...Object.values(insets)].some(
      (value) => !Number.isFinite(value) || value < 0 || value > 100000,
    ) ||
    source.width <= 0 ||
    source.height <= 0 ||
    insets.left + insets.right > source.width ||
    insets.top + insets.bottom > source.height
  )
    throw new Error("Dimensões/insets de nine-slice inválidos.");
  const horizontal =
      insets.left + insets.right === 0
        ? 1
        : Math.min(1, target.width / (insets.left + insets.right)),
    vertical =
      insets.top + insets.bottom === 0
        ? 1
        : Math.min(1, target.height / (insets.top + insets.bottom));
  const sx = [0, insets.left, source.width - insets.right, source.width],
    sy = [0, insets.top, source.height - insets.bottom, source.height],
    tx = [0, insets.left * horizontal, target.width - insets.right * horizontal, target.width],
    ty = [0, insets.top * vertical, target.height - insets.bottom * vertical, target.height];
  const result: { source: Bounds; target: Bounds }[] = [];
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 3; column++) {
      const x = sx[column],
        x2 = sx[column + 1],
        y = sy[row],
        y2 = sy[row + 1],
        dx = tx[column],
        dx2 = tx[column + 1],
        dy = ty[row],
        dy2 = ty[row + 1];
      if (
        x === undefined ||
        x2 === undefined ||
        y === undefined ||
        y2 === undefined ||
        dx === undefined ||
        dx2 === undefined ||
        dy === undefined ||
        dy2 === undefined
      )
        throw new Error("Índice de nine-slice inválido.");
      result.push({
        source: { x, y, width: Math.max(0, x2 - x), height: Math.max(0, y2 - y) },
        target: { x: dx, y: dy, width: Math.max(0, dx2 - dx), height: Math.max(0, dy2 - dy) },
      });
    }
  return result;
}
