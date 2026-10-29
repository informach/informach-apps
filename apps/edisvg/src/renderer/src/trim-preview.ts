import { geometryPath } from "@informach/edi-motion/geometry";
import { type RigTrim, trimGeometry } from "@informach/edi-motion/rig";
import { parsePath } from "../../shared/pathGeometry.js";
import type { SceneNode } from "../../shared/sceneTypes";

/** Design shows the authored trim on the rendered path; the stored `d` stays
 * whole. `null` puts the untrimmed path back. Native arcs never carry a trim. */
export function paintDesignTrim(
  element: Element | undefined,
  node: SceneNode | undefined,
  trim: RigTrim | null,
) {
  const shape = element?.firstElementChild,
    d = node?.attrs.d;
  if (shape?.localName !== "path" || typeof d !== "string" || /[aA]/.test(d)) return;
  const result = trim ? trimGeometry(parsePath(d), trim, { remaining: 2_000_000 }) : null;
  shape.setAttribute("d", result?.kind === "geometry" ? geometryPath(result.geometry) : d);
}
