import type { Geometry } from "../geometry";
import {
  type ImageMesh,
  imageMeshMatrices,
  imageMeshTriangleCount,
  imageMeshVertexCount,
} from "./imageMesh";

/** Reads the grid a rendered meshed image declares (data-edi-mesh="CxR"). */
export function renderedImageMesh(shape: Element): ImageMesh | undefined {
  const match = /^(\d{1,2})x(\d{1,2})$/.exec(shape.getAttribute("data-edi-mesh") ?? "");
  return match ? { columns: Number(match[1]), rows: Number(match[2]) } : undefined;
}
/** Moves the triangles of a rendered meshed image onto evaluated vertices; the
 * clips are static, so a frame writes one transform per changed triangle. */
export function createImageMeshBinding(
  shape: Element,
  mesh: ImageMesh,
  image: { width: number; height: number },
  rest: Geometry,
) {
  const triangles = [...shape.children],
    declared = renderedImageMesh(shape);
  if (
    declared?.columns !== mesh.columns ||
    declared.rows !== mesh.rows ||
    triangles.length !== imageMeshTriangleCount(mesh) ||
    rest.reduce((sum, contour) => sum + contour.points.length, 0) !== imageMeshVertexCount(mesh)
  )
    throw new Error("SVG não corresponde à malha raster tipada.");
  return {
    paint(geometry: Geometry | undefined) {
      const matrices = imageMeshMatrices(
        mesh,
        image,
        (geometry ?? rest).flatMap((contour) => contour.points),
      );
      for (const [index, matrix] of matrices.entries()) {
        const value = `matrix(${matrix.join(" ")})`,
          triangle = triangles[index];
        if (triangle && triangle.getAttribute("transform") !== value)
          triangle.setAttribute("transform", value);
      }
    },
  };
}
