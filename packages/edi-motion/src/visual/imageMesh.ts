import { z } from "zod";
import type { Affine } from "../affine";
import type { Geometry, Point } from "../geometry";

/** A regular triangulated grid over a raster image: (columns+1)×(rows+1)
 * vertices, two triangles per cell. Its rest vertices are the image box, so
 * rig skins/morphs deform it like a path's anchors. */
export const imageMeshSchema = z.strictObject({
  columns: z.number().int().min(1).max(16),
  rows: z.number().int().min(1).max(16),
});
export type ImageMesh = z.infer<typeof imageMeshSchema>;
/** Seam allowance: each triangle's clip grows by this many image pixels so
 * neighbours overlap instead of leaving antialiased hairlines between them. */
const SEAM = 0.5;

function box(attrs: Readonly<Record<string, string>>) {
  const number = (name: string, fallback?: number) => {
    const raw = attrs[name];
    if (raw === undefined && fallback !== undefined) return fallback;
    const value = Number(raw?.replace(/px$/, ""));
    if (
      raw === undefined ||
      !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/.test(raw) ||
      !Number.isFinite(value)
    )
      throw new Error("Malha de imagem requer x, y, largura e altura absolutos.");
    return value;
  };
  if (attrs.preserveAspectRatio !== "none")
    throw new Error('Malha de imagem requer preserveAspectRatio="none" (sem recorte de aspecto).');
  const width = number("width"),
    height = number("height");
  if (width <= 0 || height <= 0) throw new Error("Malha de imagem requer área positiva.");
  return { x: number("x", 0), y: number("y", 0), width, height };
}
export const imageMeshVertexCount = (mesh: ImageMesh) => (mesh.columns + 1) * (mesh.rows + 1);
export const imageMeshTriangleCount = (mesh: ImageMesh) => mesh.columns * mesh.rows * 2;
/** SVG cells per mesh: a clipped group and a use per triangle, plus its clip and polygon. */
export const imageMeshCells = (mesh: ImageMesh | undefined) =>
  mesh ? imageMeshTriangleCount(mesh) * 4 : 0;
/** Rest vertices in the image's local space, row-major, as one open contour. */
export function imageMeshRest(mesh: ImageMesh, attrs: Readonly<Record<string, string>>): Geometry {
  const { x, y, width, height } = box(attrs),
    points = [];
  for (let row = 0; row <= mesh.rows; row++)
    for (let column = 0; column <= mesh.columns; column++)
      points.push({
        x: x + (column / mesh.columns) * width,
        y: y + (row / mesh.rows) * height,
        in: null,
        out: null,
      });
  return [{ closed: false, points }];
}
function triangles(mesh: ImageMesh) {
  const result: [number, number, number][] = [],
    at = (column: number, row: number) => row * (mesh.columns + 1) + column;
  for (let row = 0; row < mesh.rows; row++)
    for (let column = 0; column < mesh.columns; column++) {
      const a = at(column, row),
        b = at(column + 1, row),
        c = at(column, row + 1),
        d = at(column + 1, row + 1);
      result.push([a, b, d], [a, d, c]);
    }
  return result;
}
/** Static per-triangle clip polygons in image pixels, grown by the seam. */
export function imageMeshClips(mesh: ImageMesh, image: { width: number; height: number }) {
  const source = (index: number): Point => ({
    x: ((index % (mesh.columns + 1)) / mesh.columns) * image.width,
    y: (Math.floor(index / (mesh.columns + 1)) / mesh.rows) * image.height,
  });
  return triangles(mesh).map((triangle) => {
    const points = triangle.map(source),
      center = {
        x: points.reduce((sum, point) => sum + point.x, 0) / 3,
        y: points.reduce((sum, point) => sum + point.y, 0) / 3,
      },
      [p, q, r] = points as [Point, Point, Point],
      area = Math.abs((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) / 2,
      perimeter =
        Math.hypot(q.x - p.x, q.y - p.y) +
        Math.hypot(r.x - q.x, r.y - q.y) +
        Math.hypot(p.x - r.x, p.y - r.y),
      // Scaling about the centroid by (inradius + seam) / inradius moves every edge out by the seam.
      scale = 1 + SEAM / ((2 * area) / perimeter);
    return points
      .map((point) =>
        [center.x + (point.x - center.x) * scale, center.y + (point.y - center.y) * scale]
          .map((value) => Number(value.toFixed(4)))
          .join(" "),
      )
      .join(" ");
  });
}
/** Affine per triangle mapping image pixels onto the (deformed) vertices. */
export function imageMeshMatrices(
  mesh: ImageMesh,
  image: { width: number; height: number },
  vertices: readonly Point[],
): Affine[] {
  if (vertices.length !== imageMeshVertexCount(mesh))
    throw new Error("Malha de imagem com vértices fora da grade.");
  const columnWidth = image.width / mesh.columns,
    rowHeight = image.height / mesh.rows;
  return triangles(mesh).map(([a, b, c], index) => {
    const pa = vertices[a],
      pb = vertices[b],
      pc = vertices[c];
    if (!pa || !pb || !pc) throw new Error("Vértice de malha ausente.");
    const column = (a % (mesh.columns + 1)) * columnWidth,
      row = Math.floor(a / (mesh.columns + 1)) * rowHeight,
      upper = index % 2 === 0,
      // Source vectors (image px): upper [a→b]=(w,0), [a→c]=(w,h); lower [a→b]=(w,h), [a→c]=(0,h).
      s1 = upper ? { x: columnWidth, y: 0 } : { x: columnWidth, y: rowHeight },
      s2 = upper ? { x: columnWidth, y: rowHeight } : { x: 0, y: rowHeight },
      d1 = { x: pb.x - pa.x, y: pb.y - pa.y },
      d2 = { x: pc.x - pa.x, y: pc.y - pa.y },
      determinant = s1.x * s2.y - s2.x * s1.y,
      // Linear part L = D·S⁻¹ with S = [s1 s2], D = [d1 d2].
      m00 = (d1.x * s2.y - d2.x * s1.y) / determinant,
      m01 = (d2.x * s1.x - d1.x * s2.x) / determinant,
      m10 = (d1.y * s2.y - d2.y * s1.y) / determinant,
      m11 = (d2.y * s1.x - d1.y * s2.x) / determinant;
    return [m00, m10, m01, m11, pa.x - m00 * column - m01 * row, pa.y - m10 * column - m11 * row];
  });
}
export const imageMeshClipId = (objectId: string, triangle: number) =>
  `edi-mesh-${objectId}-${triangle}`;
