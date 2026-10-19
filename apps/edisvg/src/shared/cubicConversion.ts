import { parsePath, serializePath } from "./pathGeometry.js";

/** An authored representation change, never an export-time repair. Existing
 * arc approximation and six-decimal serialization are the editor's contract. */
export function prepareCubicConversion(source: string) {
  if (typeof source !== "string" || source.length > 500000)
    throw new Error("Conversão exige um caminho de até 500.000 caracteres.");
  const contours = parsePath(source);
  let addedHandles = 0,
    segments = 0,
    minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const contour of contours) {
    const count = contour.points.length < 2 ? 0 : contour.points.length - (contour.closed ? 0 : 1);
    for (let index = 0; index < count; index++) {
      const a = contour.points[index],
        b = contour.points[(index + 1) % contour.points.length];
      if (!a || !b) throw new Error("Segmento ausente.");
      segments++;
      if (!a.out) {
        a.out = { x: a.x, y: a.y };
        addedHandles++;
      }
      if (!b.in) {
        b.in = { x: b.x, y: b.y };
        addedHandles++;
      }
    }
    for (const point of contour.points)
      for (const value of [point, point.in, point.out]) {
        if (!value) continue;
        minX = Math.min(minX, value.x);
        minY = Math.min(minY, value.y);
        maxX = Math.max(maxX, value.x);
        maxY = Math.max(maxY, value.y);
      }
  }
  if (!segments) throw new Error("O caminho não possui segmentos para converter.");
  const pathData = serializePath(contours);
  if (pathData.length > 500000)
    throw new Error("Resultado excede 500.000 caracteres; reduza o caminho.");
  // Control hull, not a claim of painted/world bounds. A shared padded box
  // keeps straight horizontal/vertical paths visible in both miniatures.
  const padding = Math.max(1, Math.max(maxX - minX, maxY - minY) * 0.05),
    width = maxX - minX + 2 * padding,
    height = maxY - minY + 2 * padding;
  return {
    contours,
    pathData,
    segments,
    addedHandles,
    changed: pathData !== source,
    preview: {
      viewBox: `${minX - padding} ${minY - padding} ${width} ${height}`,
      strokeWidth: Math.max(width, height) / 100,
    },
  };
}
