import { inverse, multiply, transformPoint } from "@informach/edi-motion";
import { z } from "zod";
import { selectionRoots } from "../../shared/sceneBatch";
import type { Scene } from "../../shared/sceneTypes";
import { objectPose } from "./clipPose";
import type { TransformUpdate } from "./selectionGestures";

type PoseState = Parameters<typeof objectPose>[0] & { scene: Scene };
export type AlignOperation =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom"
  | "distribute-x"
  | "distribute-y";
export const alignmentOperation = (value: string) =>
  z
    .enum([
      "left",
      "center-x",
      "right",
      "top",
      "center-y",
      "bottom",
      "distribute-x",
      "distribute-y",
    ])
    .parse(value);
function affine(matrix: DOMMatrix | null) {
  if (!matrix) throw new Error("Coordenadas indisponíveis.");
  return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f] satisfies [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
}
export function measureSelection(svg: SVGSVGElement, state: PoseState, ids: string[]) {
  const root = affine(svg.getScreenCTM()),
    rootInverse = inverse(root);
  return selectionRoots(state.scene, ids).map((entry) => {
    const element = svg.querySelector(`[data-object="${entry.node.id}"]`);
    if (
      !(element instanceof SVGGraphicsElement) ||
      !(element.parentElement instanceof SVGGraphicsElement)
    )
      throw new Error("Objeto não está renderizado.");
    const matrix = multiply(rootInverse, affine(element.getScreenCTM())),
      box = entry.node.instance
        ? { x: 0, y: 0, width: entry.node.instance.width, height: entry.node.instance.height }
        : element.getBBox();
    const corners = [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x + box.width, box.y + box.height],
      [box.x, box.y + box.height],
    ].map((point) => transformPoint(matrix, point[0] ?? 0, point[1] ?? 0));
    return {
      entry,
      pose: objectPose(state, entry.node),
      toParent: multiply(inverse(affine(element.parentElement.getScreenCTM())), root),
      left: Math.min(...corners.map((p) => p.x)),
      right: Math.max(...corners.map((p) => p.x)),
      top: Math.min(...corners.map((p) => p.y)),
      bottom: Math.max(...corners.map((p) => p.y)),
      matrix,
    };
  });
}
export function alignSelection(
  svg: SVGSVGElement,
  state: PoseState,
  ids: string[],
  operation: AlignOperation,
): TransformUpdate[] {
  const items = measureSelection(svg, state, ids);
  if (items.length < 2) throw new Error("Selecione ao menos dois objetos.");
  if (items.some((item) => item.entry.locked)) throw new Error("Desbloqueie toda a seleção.");
  const horizontal =
    operation === "left" ||
    operation === "right" ||
    operation === "center-x" ||
    operation === "distribute-x";
  const minimum = Math.min(...items.map((item) => (horizontal ? item.left : item.top))),
    maximum = Math.max(...items.map((item) => (horizontal ? item.right : item.bottom)));
  const offsets = new Map<string, number>();
  if (operation.startsWith("distribute")) {
    if (items.length < 3) throw new Error("Distribuição exige ao menos três objetos.");
    const sorted = [...items].sort(
      (a, b) => (horizontal ? a.left : a.top) - (horizontal ? b.left : b.top),
    );
    const used = items.reduce(
        (sum, item) => sum + (horizontal ? item.right - item.left : item.bottom - item.top),
        0,
      ),
      gap = (maximum - minimum - used) / (items.length - 1);
    let cursor = minimum;
    for (const item of sorted) {
      offsets.set(item.entry.node.id, cursor - (horizontal ? item.left : item.top));
      cursor += (horizontal ? item.right - item.left : item.bottom - item.top) + gap;
    }
  } else
    for (const item of items) {
      const start = horizontal ? item.left : item.top,
        end = horizontal ? item.right : item.bottom;
      offsets.set(
        item.entry.node.id,
        operation === "left" || operation === "top"
          ? minimum - start
          : operation === "right" || operation === "bottom"
            ? maximum - end
            : (minimum + maximum - start - end) / 2,
      );
    }
  return items.map((item) => {
    const distance = offsets.get(item.entry.node.id) ?? 0,
      dx = horizontal ? distance : 0,
      dy = horizontal ? 0 : distance,
      m = item.toParent;
    return {
      targetId: item.entry.node.id,
      transform: { x: item.pose.x + m[0] * dx + m[2] * dy, y: item.pose.y + m[1] * dx + m[3] * dy },
    };
  });
}
