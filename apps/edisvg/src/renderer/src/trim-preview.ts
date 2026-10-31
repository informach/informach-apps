import { geometryPath } from "@informach/edi-motion/geometry";
import { writeShapePath } from "@informach/edi-motion/graphics";
import { type RigTrim, trimGeometry } from "@informach/edi-motion/rig";
import { parsePath } from "../../shared/pathGeometry.js";
import type { SceneNode } from "../../shared/sceneTypes";

/** Design shows the authored trims on the rendered path; the stored `d` stays
 * whole. Each paint row has its own: the trim without a layer cuts the shape,
 * a layer's trim only that copy. An empty list puts the untrimmed paths back.
 * Native arcs never carry a trim. */
export function paintDesignTrims(
  element: Element | undefined,
  node: SceneNode | undefined,
  trims: readonly RigTrim[],
) {
  const shape = element?.firstElementChild,
    d = node?.attrs.d;
  if (shape?.localName !== "path" || typeof d !== "string" || /[aA]/.test(d)) return;
  const source = parsePath(d),
    trimmed = (layerId?: string) => {
      const trim = trims.find((value) => value.layerId === layerId);
      const result = trim && trimGeometry(source, trim, { remaining: 2_000_000 });
      return result?.kind === "geometry" ? geometryPath(result.geometry) : undefined;
    };
  writeShapePath(shape, trimmed() ?? d, (layerId) => trimmed(layerId) ?? d);
}
