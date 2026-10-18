import { inverse, type Motion, multiply, transformPoint } from "@informach/edi-motion";
import polygonClipping, { type MultiPolygon, type Ring } from "polygon-clipping";
import { orient2d } from "robust-predicates";
import { z } from "zod";
import { nodeMatrix } from "./composition";
import type { Contour } from "./geometryTypes";
import { pathFromNode, serializePath } from "./pathGeometry.js";
import { simplifyContours } from "./pathOperations";
import { flattenScene } from "./scene.js";
import { applySceneBatch } from "./sceneBatch";
import type { Scene } from "./sceneTypes";
export const booleanOperationSchema = z.enum(["union", "intersection", "difference", "xor"]);
export const vectorBooleanSchema = z.strictObject({
  type: z.literal("vector-boolean"),
  operation: booleanOperationSchema,
  targetIds: z
    .array(z.string().regex(/^node-[\w-]{1,100}$/))
    .min(2)
    .max(16),
  tolerance: z.number().min(0.01).max(100),
  approximateCurves: z.boolean(),
  useFirstAppearance: z.literal(true),
});
type Command = z.infer<typeof vectorBooleanSchema>;
const outputBudget = (value: MultiPolygon) => {
  if (
    value.reduce((sum, polygon) => sum + polygon.reduce((sum, ring) => sum + ring.length, 0), 0) >
    10000
  )
    throw new Error("Resultado booleano excede 10000 vértices.");
  return value;
};
const combine = (values: MultiPolygon[]) => {
  const nonempty = values.filter((value) => value.length),
    first = nonempty[0];
  return first ? outputBudget(polygonClipping.union(first, ...nonempty.slice(1))) : [];
};
function crossing(a: Ring[number], b: Ring[number], c: Ring[number], d: Ring[number]) {
  const one = orient2d(...a, ...b, ...c),
    two = orient2d(...a, ...b, ...d),
    three = orient2d(...c, ...d, ...a),
    four = orient2d(...c, ...d, ...b);
  const on = (p: Ring[number], a: Ring[number], b: Ring[number]) =>
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1]);
  return (
    (((one < 0 && two > 0) || (one > 0 && two < 0)) &&
      ((three < 0 && four > 0) || (three > 0 && four < 0))) ||
    (one === 0 && on(c, a, b)) ||
    (two === 0 && on(d, a, b)) ||
    (three === 0 && on(a, c, d)) ||
    (four === 0 && on(b, c, d))
  );
}
function winding(ring: Ring, spend: () => void) {
  if (ring.length < 3) throw new Error("Contorno não tem área preenchida.");
  for (let i = 0; i < ring.length; i++)
    for (let j = i + 1; j < ring.length; j++) {
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
      spend();
      const a = ring[i],
        b = ring[(i + 1) % ring.length],
        c = ring[j],
        d = ring[(j + 1) % ring.length];
      if (!a || !b || !c || !d) throw new Error("Aresta ausente.");
      if (crossing(a, b, c, d))
        throw new Error(
          "Contornos autointersectantes/autoencostados exigem normalização antes da operação booleana.",
        );
    }
  const origin = ring[0];
  if (!origin) throw new Error("Contorno vazio.");
  let area = 0,
    magnitude = 0;
  for (let i = 1; i < ring.length - 1; i++) {
    const a = ring[i],
      b = ring[i + 1];
    if (!a || !b) throw new Error("Vértice ausente.");
    const term = orient2d(...origin, ...a, ...b);
    area += term;
    magnitude += Math.abs(term);
  }
  if (!Number.isFinite(area) || Math.abs(area) <= Number.EPSILON * magnitude * 16)
    throw new Error("Contorno degenerado ou numericamente instável.");
  return Math.sign(area);
}
/** Signed winding regions preserve nonzero holes and overlapping subpaths.
 * Evenodd uses XOR. Simple rings are required; ambiguous geometry is refused. */
function filled(rings: Ring[], rule: string, spend: () => void): MultiPolygon {
  if (rule !== "nonzero" && rule !== "evenodd")
    throw new Error("Regra de preenchimento não suportada.");
  let regions = new Map<number, MultiPolygon>();
  for (const ring of rings) {
    const sign = winding(ring, spend),
      shape = outputBudget(polygonClipping.union([ring]));
    if (rule === "evenodd") {
      regions.set(1, outputBudget(polygonClipping.xor(regions.get(1) ?? [], shape)));
      continue;
    }
    const previous = combine([...regions.values()]),
      next = new Map<number, MultiPolygon>();
    const add = (weight: number, value: MultiPolygon) => {
      if (!weight || !value.length) return;
      next.set(weight, combine([next.get(weight) ?? [], value]));
    };
    add(sign, outputBudget(polygonClipping.difference(shape, previous)));
    for (const [weight, value] of regions) {
      add(weight, outputBudget(polygonClipping.difference(value, shape)));
      add(weight + sign, outputBudget(polygonClipping.intersection(value, shape)));
    }
    regions = next;
  }
  return combine([...regions.values()]);
}
export function applyVectorBoolean(scene: Scene, motion: Motion, command: Command): string | null {
  const entries = flattenScene(scene),
    byId = new Map(entries.map((entry) => [entry.node.id, entry])),
    selected = command.targetIds.map((id) => {
      const entry = byId.get(id);
      if (!entry) throw new Error("Objeto ausente.");
      return entry;
    }),
    first = selected[0];
  if (!first || new Set(command.targetIds).size !== command.targetIds.length)
    throw new Error("Seleção booleana inválida.");
  if (selected.some((entry) => entry.node.effects))
    throw new Error(
      "Booleanas operam na geometria de origem; remova recortes/máscaras dos operandos explicitamente.",
    );
  if (
    selected.some(
      (entry) =>
        entry.locked ||
        !entry.visible ||
        entry.parentId !== first.parentId ||
        entry.node.instance ||
        entry.node.tag === "g" ||
        entry.node.tag === "text" ||
        entry.node.children.length,
    )
  )
    throw new Error(
      "Use formas visíveis/desbloqueadas do mesmo grupo; grupos, componentes e texto não são operandos.",
    );
  const firstInverse = inverse(nodeMatrix(first.node));
  let vertices = 0,
    rings = 0,
    work = 0;
  const spend = () => {
    if (++work > 2000000) throw new Error("Operação booleana excede o orçamento de verificação.");
  };
  const shapes = selected.map((entry) => {
    const matrix = multiply(firstInverse, nodeMatrix(entry.node));
    let contours: Contour[] = pathFromNode(entry.node).map((contour) => ({
      closed: contour.closed,
      points: contour.points.map((point) => ({
        ...transformPoint(matrix, point.x, point.y),
        in: point.in ? transformPoint(matrix, point.in.x, point.in.y) : null,
        out: point.out ? transformPoint(matrix, point.out.x, point.out.y) : null,
      })),
    }));
    for (const contour of contours) {
      if (!contour.closed) {
        if (contour.points.length < 3)
          throw new Error("Linhas sem área não participam de booleanas de preenchimento.");
        contour.closed = true;
        const start = contour.points[0],
          end = contour.points.at(-1);
        if (start) start.in = null;
        if (end) end.out = null;
      }
    }
    if (contours.some((contour) => contour.points.some((point) => point.in || point.out))) {
      if (!command.approximateCurves)
        throw new Error("Confirme explicitamente a aproximação poligonal de curvas.");
      contours = simplifyContours(contours, command.tolerance);
    }
    const polygons = contours.map((contour) => {
      vertices += contour.points.length;
      if (vertices > 2000 || ++rings > 32)
        throw new Error("Perfil booleano excede 2000 vértices/32 contornos de entrada.");
      return contour.points.map((point) => {
        if (
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          Math.abs(point.x) > 1e7 ||
          Math.abs(point.y) > 1e7
        )
          throw new Error("Coordenadas booleanas fora do limite.");
        return [point.x, point.y] satisfies [number, number];
      });
    });
    let owner: typeof entry | undefined = entry,
      rule = "nonzero";
    while (owner) {
      const value = owner.node.attrs["fill-rule"];
      if (value && value !== "inherit" && value !== "unset") {
        rule = value === "initial" ? "nonzero" : value;
        break;
      }
      owner = owner.parentId ? byId.get(owner.parentId) : undefined;
    }
    return filled(polygons, rule, spend);
  });
  const subject = shapes[0];
  if (!subject) throw new Error("Operando ausente.");
  const result = outputBudget(polygonClipping[command.operation](subject, ...shapes.slice(1)));
  if (!result.length) {
    applySceneBatch(scene, motion, {
      type: "scene-batch",
      operation: "delete",
      targetIds: command.targetIds,
    });
    return null;
  }
  const geometry: Contour[] = result.flatMap((polygon) =>
    polygon.map((ring) => ({
      closed: true,
      points: ring.slice(0, -1).map(([x, y]) => ({ x, y, in: null, out: null })),
    })),
  );
  const geometric = new Set([
    "d",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "width",
    "height",
    "rx",
    "ry",
    "cx",
    "cy",
    "r",
    "points",
  ]);
  first.node.attrs = {
    ...Object.fromEntries(Object.entries(first.node.attrs).filter(([key]) => !geometric.has(key))),
    d: serializePath(geometry),
    "fill-rule": "nonzero",
  };
  first.node.tag = "path";
  applySceneBatch(scene, motion, {
    type: "scene-batch",
    operation: "delete",
    targetIds: command.targetIds.slice(1),
  });
  return first.node.id;
}
