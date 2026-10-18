import type { GradientPaints } from "@informach/edi-motion/graphics";
import type { SceneNode } from "./sceneTypes";
export function inheritedGradientPaints(chain: readonly SceneNode[]): GradientPaints {
  let result: GradientPaints = {};
  for (const node of chain) result = mergeGradientPaints(result, node);
  return result;
}
/** Own the container, share immutable source gradient records. Solid edits
 * remove only their channel; a typed local gradient has local precedence. */
export function mergeGradientPaints(
  inherited: Readonly<GradientPaints>,
  node: SceneNode,
): GradientPaints {
  const result = { ...inherited };
  for (const channel of ["fill", "stroke"] as const) {
    const gradient = node.gradients?.[channel],
      solid = node.attrs[channel];
    if (gradient) result[channel] = gradient;
    else if (solid !== undefined && !["inherit", "unset"].includes(solid)) delete result[channel];
  }
  return result;
}
/** Explicit solid-paint edits override the gradient on that channel only.
 * Clone the container: compiler copies may still share immutable source data. */
export function applySceneAttributes(node: SceneNode, attrs: Record<string, string>) {
  node.attrs = { ...node.attrs, ...attrs };
  if (!node.gradients) return;
  const gradients = { ...node.gradients };
  for (const key of ["fill", "stroke"] as const)
    if (Object.hasOwn(attrs, key)) delete gradients[key];
  if (gradients.fill || gradients.stroke) node.gradients = gradients;
  else delete node.gradients;
}
