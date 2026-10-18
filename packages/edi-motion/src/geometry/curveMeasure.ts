import type { RigEvaluationBudget } from "../rig/kinematics";
import { type Cubic, sliceCubic, splitCubic } from "./cubic";

interface CurveLeaf {
  curve: Cubic;
  t0: number;
  t1: number;
  start: number;
  length: number;
}
interface PendingLeaf {
  curve: Cubic;
  t0: number;
  t1: number;
  depth: number;
  lower: number;
  upper: number;
  error: number;
}
export interface CurveMeasurement {
  length: number;
  lower: number;
  upper: number;
  error: number;
  leaves: readonly CurveLeaf[];
}
function precision(tolerance: number) {
  if (!Number.isFinite(tolerance) || tolerance < 1e-14 || tolerance > 100)
    throw new Error("Tolerância de medição fora do perfil numérico.");
}
function spend(budget: RigEvaluationBudget) {
  if (--budget.remaining < 0) throw new Error("Medição de curva excede orçamento de trabalho.");
}
const distance = (a: Cubic[0], b: Cubic[0]) => Math.hypot(b.x - a.x, b.y - a.y);

/** Chord/control-polygon brackets, refining the largest global uncertainty.
 * error. Coordinates are translated before subdivision to reduce cancellation.
 * This is a calculation artifact, not authored/polyline replacement geometry. */
export function measureCubic(
  curve: Cubic,
  tolerance: number,
  budget: RigEvaluationBudget,
  maxLeaves = 16384,
): CurveMeasurement {
  precision(tolerance);
  if (!Number.isInteger(budget.remaining) || budget.remaining < 0 || budget.remaining > 2_000_000)
    throw new Error("Orçamento de medição inválido.");
  if (!Number.isInteger(maxLeaves) || maxLeaves < 1 || maxLeaves > 16384)
    throw new Error("Orçamento de folhas de medição inválido.");
  const a = curve[0],
    relative: Cubic = [
      { x: 0, y: 0 },
      { x: curve[1].x - a.x, y: curve[1].y - a.y },
      { x: curve[2].x - a.x, y: curve[2].y - a.y },
      { x: curve[3].x - a.x, y: curve[3].y - a.y },
    ],
    leaves: CurveLeaf[] = [],
    pending: PendingLeaf[] = [];
  let length = 0,
    lower = 0,
    upper = 0;
  function part(curve: Cubic, t0: number, t1: number, depth: number): PendingLeaf {
    spend(budget);
    const chord = distance(curve[0], curve[3]),
      polygon = Math.max(
        chord,
        distance(curve[0], curve[1]) + distance(curve[1], curve[2]) + distance(curve[2], curve[3]),
      );
    if (!Number.isFinite(polygon)) throw new Error("Comprimento de curva não finito.");
    return { curve, t0, t1, depth, lower: chord, upper: polygon, error: (polygon - chord) / 2 };
  }
  const before = (a: PendingLeaf, b: PendingLeaf) =>
    a.error > b.error || (a.error === b.error && a.t0 < b.t0);
  function push(node: PendingLeaf) {
    spend(budget);
    if (pending.length >= maxLeaves) throw new Error("Medição excede orçamento de folhas.");
    let index = pending.length;
    pending.push(node);
    while (index > 0) {
      spend(budget);
      const parentIndex = Math.floor((index - 1) / 2),
        parent = pending[parentIndex];
      if (!parent) throw new Error("Fila de medição inconsistente.");
      if (!before(node, parent)) break;
      pending[index] = parent;
      index = parentIndex;
    }
    pending[index] = node;
  }
  function pop() {
    spend(budget);
    const first = pending[0],
      last = pending.pop();
    if (!first || !last) throw new Error("Fila de medição vazia.");
    if (pending.length) {
      let index = 0;
      while (index * 2 + 1 < pending.length) {
        spend(budget);
        let childIndex = index * 2 + 1;
        const left = pending[childIndex],
          right = pending[childIndex + 1];
        if (!left) throw new Error("Fila de medição inconsistente.");
        const child = right && before(right, left) ? right : left;
        if (child === right) childIndex++;
        if (!before(child, last)) break;
        pending[index] = child;
        index = childIndex;
      }
      pending[index] = last;
    }
    return first;
  }
  const root = part(relative, 0, 1, 0);
  push(root);
  let uncertainty = root.error;
  while (true) {
    if (uncertainty <= tolerance) {
      // Recompute positive residuals before accepting; subtracting large
      // parent bounds must not hide a small final error through cancellation.
      uncertainty = 0;
      for (const node of pending) {
        spend(budget);
        uncertainty += node.error;
      }
      if (uncertainty <= tolerance) break;
    }
    const node = pop();
    if (node.depth >= 20)
      throw new Error("Curva não atingiu a precisão de comprimento solicitada.");
    const split = splitCubic(node.curve, 0.5),
      middle = (node.t0 + node.t1) / 2,
      left = part(split.left, node.t0, middle, node.depth + 1),
      right = part(split.right, middle, node.t1, node.depth + 1);
    uncertainty += left.error + right.error - node.error;
    push(left);
    push(right);
  }
  pending.sort((a, b) => {
    spend(budget);
    return a.t0 - b.t0;
  });
  for (const node of pending) {
    spend(budget);
    const measured = (node.lower + node.upper) / 2;
    leaves.push({ curve: node.curve, t0: node.t0, t1: node.t1, start: length, length: measured });
    length += measured;
    lower += node.lower;
    upper += node.upper;
  }
  const error = Math.max(uncertainty, (upper - lower) / 2);
  if (error > tolerance) throw new Error("Precisão acumulada excede a tolerância de medição.");
  return { length, lower, upper, error, leaves };
}

/** Invert distance on the actual cubic, not a linear interpolation of t in
 * a flat chord. Even a straight cubic can have nonlinear parameter speed. */
export function curveParameterAtLength(
  measured: CurveMeasurement,
  distance: number,
  tolerance: number,
  budget: RigEvaluationBudget,
) {
  precision(tolerance);
  if (tolerance < 8e-14)
    throw new Error("Tolerância de inversão insuficiente para medir seus intervalos.");
  if (
    !Number.isFinite(distance) ||
    distance < 0 ||
    distance > measured.length ||
    !(measured.length > 0)
  )
    throw new Error("Distância de curva fora do intervalo medido.");
  if (distance === 0) return 0;
  if (distance === measured.length) return 1;
  let low = 0,
    high = measured.leaves.length - 1;
  while (low < high) {
    spend(budget);
    const middle = Math.floor((low + high) / 2),
      leaf = measured.leaves[middle];
    if (!leaf) throw new Error("Folha de medição ausente.");
    if (leaf.start + leaf.length < distance) low = middle + 1;
    else high = middle;
  }
  const leaf = measured.leaves[low];
  if (!leaf) throw new Error("Folha de medição ausente.");
  const target = Math.max(0, Math.min(leaf.length, distance - leaf.start));
  let start = 0,
    end = 1;
  for (let iteration = 0; iteration < 64; iteration++) {
    spend(budget);
    const t = (start + end) / 2,
      prefix = measureCubic(sliceCubic(leaf.curve, 0, t), tolerance / 8, budget);
    if (Math.abs(prefix.length - target) + prefix.error <= tolerance / 2)
      return leaf.t0 + (leaf.t1 - leaf.t0) * t;
    if (prefix.length < target) start = t;
    else end = t;
  }
  throw new Error("Inversão de comprimento não atingiu a precisão solicitada.");
}
