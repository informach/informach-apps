import { inverse, multiply, transformPoint } from "@informach/edi-motion";
import { type TextPath, textPathSchema } from "@informach/edi-motion/visual";
import { nodeMatrix } from "./composition";
import { PATH_TAGS, pathFromNode, serializePath } from "./pathGeometry.js";
import { flattenScene } from "./scene.js";
import type { Scene } from "./sceneTypes";

/** Shapes a text can follow: visible shapes of the same parent, so both share
 * the parent space and the curve keeps meaning while either is edited. */
export function textPathSources(scene: Scene, textId: string) {
  const entries = flattenScene(scene),
    text = entries.find(({ node }) => node.id === textId);
  if (text?.node.tag !== "text") throw new Error("Selecione um texto.");
  return entries.filter(
    ({ node, parentId }) =>
      parentId === text.parentId && node.id !== textId && PATH_TAGS.has(node.tag),
  );
}
/** Copies a sibling shape's outline into the text's local space (the space
 * its x/y and the generated textPath curve use). The text keeps its own copy:
 * later edits to the shape do not move the text. */
export function textPathFromShape(
  scene: Scene,
  textId: string,
  sourceId: string,
  startOffset: number,
): TextPath {
  const text = flattenScene(scene).find(({ node }) => node.id === textId)?.node,
    source = textPathSources(scene, textId).find(({ node }) => node.id === sourceId)?.node;
  if (!text || !source) throw new Error("Escolha uma forma do mesmo grupo do texto.");
  const matrix = multiply(inverse(nodeMatrix(text)), nodeMatrix(source)),
    move = (point: { x: number; y: number }) => transformPoint(matrix, point.x, point.y);
  return textPathSchema.parse({
    d: serializePath(
      pathFromNode(source).map((contour) => ({
        closed: contour.closed,
        points: contour.points.map((point) => ({
          ...move(point),
          in: point.in ? move(point.in) : null,
          out: point.out ? move(point.out) : null,
        })),
      })),
    ),
    startOffset,
  });
}
