import type { Geometry } from "../geometry";
import type { VisualElement } from "./describe";
import {
  type ImageMesh,
  imageMeshClipId,
  imageMeshClips,
  imageMeshMatrices,
  imageMeshRest,
} from "./imageMesh";

export type { ImageMesh } from "./imageMesh";

const BOX = new Set(["x", "y", "width", "height", "preserveAspectRatio", "overflow"]);
/** One clipped copy of the image per triangle, mapped onto its vertices. The
 * box becomes the rest vertices; the rest of the attributes stay on the group. */
export function imageMeshElement(
  objectId: string,
  image: { id: string; width: number; height: number },
  attrs: Readonly<Record<string, string>>,
  mesh: ImageMesh,
  geometry: Geometry | undefined,
): VisualElement {
  // The rest box is validated even when a deformed geometry is supplied.
  const rest = imageMeshRest(mesh, attrs),
    vertices = (geometry ?? rest).flatMap((contour) => contour.points);
  return {
    tag: "g",
    attrs: {
      ...Object.fromEntries(Object.entries(attrs).filter(([name]) => !BOX.has(name))),
      "data-edi-image": image.id,
      "data-edi-mesh": `${mesh.columns}x${mesh.rows}`,
    },
    children: imageMeshMatrices(mesh, image, vertices).map((matrix, index) => ({
      tag: "g",
      attrs: {
        transform: `matrix(${matrix.join(" ")})`,
        "clip-path": `url(#${imageMeshClipId(objectId, index)})`,
      },
      children: [{ tag: "use", attrs: { href: `#edi-${image.id}` }, children: [] }],
    })),
  };
}
/** Static clips in image pixels: only the per-triangle transforms animate. */
export function imageMeshClipElements(
  objectId: string,
  image: { width: number; height: number },
  mesh: ImageMesh,
): VisualElement[] {
  return imageMeshClips(mesh, image).map((points, index) => ({
    tag: "clipPath",
    attrs: { id: imageMeshClipId(objectId, index), clipPathUnits: "userSpaceOnUse" },
    children: [{ tag: "polygon", attrs: { points }, children: [] }],
  }));
}
