import { parseTransformList } from "@informach/edi-motion";
import type { RigObject } from "@informach/edi-motion/rig";
import { imageMeshRest } from "@informach/edi-motion/visual";
import { pathFromNode } from "./pathGeometry.js";
import { flattenScene } from "./scene.js";
import type { Scene } from "./sceneTypes";

export function rigObjects(scene: Scene): Map<string, RigObject> {
  return new Map(
    flattenScene(scene).map(({ node, parentId }) => [
      node.id,
      {
        tag: node.tag,
        parentId,
        transform: node.transform,
        basis: node.basis,
        attributeMatrix: parseTransformList(node.attrs.transform ?? ""),
        isComponent: !!node.instance,
        ...(node.tag === "path" ? { geometry: pathFromNode(node) } : {}),
        // A meshed image deforms through its grid vertices.
        ...(node.tag === "image" && node.imageMesh
          ? { geometry: imageMeshRest(node.imageMesh, node.attrs) }
          : {}),
      },
    ]),
  );
}
