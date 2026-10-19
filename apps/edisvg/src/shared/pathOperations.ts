import { z } from "zod";
import { prepareCubicConversion } from "./cubicConversion";
import type { Contour, Point, Vertex } from "./geometryTypes";
import {
  moveVertex,
  parsePath,
  reverseContour,
  serializePath,
  setVertexType,
} from "./pathGeometry.js";
import { flattenScene } from "./scene.js";
import type { Scene } from "./sceneTypes";

const vertexRef = z.strictObject({
  contour: z.number().int().min(0).max(99999),
  index: z.number().int().min(0).max(99999),
});
const fields = { type: z.literal("path-edit"), targetId: z.string().regex(/^node-[\w-]{1,100}$/) };
const selected = { ...fields, vertices: z.array(vertexRef).min(1).max(100000) };
export const pathEditSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    ...selected,
    operation: z.literal("move"),
    dx: z.number().min(-10000).max(10000),
    dy: z.number().min(-10000).max(10000),
  }),
  z.strictObject({ ...selected, operation: z.literal("delete") }),
  z.strictObject({ ...selected, operation: z.literal("smooth") }),
  z.strictObject({
    ...fields,
    operation: z.literal("cubicize"),
    confirmAppearanceChange: z.literal(true),
  }),
  z.strictObject({ ...fields, operation: z.literal("split"), vertex: vertexRef }),
  z.strictObject({
    ...fields,
    operation: z.literal("join"),
    vertices: z.tuple([vertexRef, vertexRef]),
  }),
  z.strictObject({
    ...fields,
    operation: z.literal("simplify"),
    tolerance: z.number().min(0.01).max(1000),
  }),
]);
export type PathEditCommand = z.infer<typeof pathEditSchema>;
type Command = PathEditCommand;
const vertex = (point: Point): Vertex => ({ ...point, in: null, out: null });
const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function distance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    square = dx * dx + dy * dy,
    t = square
      ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square))
      : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
/** Explicit polygonal approximation. Flatness + RDP + serialization each
 * reserve part of the local-unit tolerance. Work and output are bounded. */
export function simplifyContours(contours: Contour[], tolerance: number): Contour[] {
  tolerance = z.number().min(0.01).max(1000).parse(tolerance);
  let output = 0,
    work = 0;
  const spend = () => {
    if (++work > 2000000)
      throw new Error(
        "Simplificação excede o orçamento de trabalho; aumente a tolerância ou reduza o caminho.",
      );
  };
  return contours.map((contour) => {
    const first = contour.points[0];
    if (!first) throw new Error("Contorno vazio.");
    const points: Point[] = [{ x: first.x, y: first.y }];
    const append = (p: Point) => {
      if (++output > 100000) throw new Error("Simplificação excede o orçamento de vértices.");
      points.push({ x: p.x, y: p.y });
    };
    function flatten(a: Point, b: Point, c: Point, d: Point, depth: number) {
      spend();
      if (Math.max(distance(b, a, d), distance(c, a, d)) <= tolerance / 3) {
        append(d);
        return;
      }
      if (depth >= 20) throw new Error("Precisão de simplificação insuficiente para esta curva.");
      const ab = middle(a, b),
        bc = middle(b, c),
        cd = middle(c, d),
        abc = middle(ab, bc),
        bcd = middle(bc, cd),
        m = middle(abc, bcd);
      flatten(a, ab, abc, m, depth + 1);
      flatten(m, bcd, cd, d, depth + 1);
    }
    const count = contour.points.length - (contour.closed ? 0 : 1);
    for (let i = 0; i < count; i++) {
      const a = contour.points[i],
        b = contour.points[(i + 1) % contour.points.length];
      if (!a || !b) throw new Error("Segmento ausente.");
      flatten(a, a.out ?? a, b.in ?? b, b, 0);
    }
    const keep = new Set([0, points.length - 1]),
      pending: [number, number][] = [[0, points.length - 1]];
    while (pending.length) {
      const interval = pending.pop();
      if (!interval) break;
      const [start, end] = interval,
        a = points[start],
        b = points[end];
      if (!a || !b) throw new Error("Intervalo inválido.");
      let max = tolerance / 3,
        index = -1;
      for (let i = start + 1; i < end; i++) {
        spend();
        const p = points[i];
        if (!p) throw new Error("Ponto ausente.");
        const error = distance(p, a, b);
        if (error > max) {
          max = error;
          index = i;
        }
      }
      if (index >= 0) {
        keep.add(index);
        pending.push([start, index], [index, end]);
      }
    }
    const reduced = points.filter((_, index) => keep.has(index));
    if (contour.closed) reduced.pop();
    if (reduced.length < (contour.closed ? 3 : 2))
      throw new Error("A tolerância colapsaria o contorno; reduza-a.");
    return { closed: contour.closed, points: reduced.map(vertex) };
  });
}
export function applyPathEdit(scene: Scene, command: Command) {
  const entry = flattenScene(scene).find((item) => item.node.id === command.targetId);
  if (!entry || entry.node.tag !== "path" || entry.node.instance)
    throw new Error("Selecione um caminho vetorial.");
  if (entry.locked) throw new Error("Desbloqueie o caminho e seus grupos.");
  let contours = parsePath(entry.node.attrs.d ?? "");
  const at = (ref: { contour: number; index: number }) => {
    const contour = contours[ref.contour],
      point = contour?.points[ref.index];
    if (!contour || !point) throw new Error("Vértice inexistente.");
    return { contour, point };
  };
  if (command.operation === "cubicize")
    contours = prepareCubicConversion(entry.node.attrs.d ?? "").contours;
  else if (command.operation === "simplify")
    contours = simplifyContours(contours, command.tolerance);
  else if (command.operation === "split") {
    const { contour } = at(command.vertex),
      index = command.vertex.index;
    if (contour.closed) {
      const points = [...contour.points.slice(index), ...contour.points.slice(0, index)],
        first = points[0];
      if (!first) throw new Error("Contorno vazio.");
      const end = structuredClone(first);
      first.in = null;
      end.out = null;
      points.push(end);
      contours[command.vertex.contour] = { closed: false, points };
    } else {
      if (index === 0 || index === contour.points.length - 1)
        throw new Error("Escolha um vértice interno para separar.");
      const left = structuredClone(contour.points.slice(0, index + 1)),
        right = structuredClone(contour.points.slice(index));
      const end = left.at(-1),
        start = right[0];
      if (!end || !start) throw new Error("Separação inválida.");
      end.out = null;
      start.in = null;
      contours.splice(
        command.vertex.contour,
        1,
        { closed: false, points: left },
        { closed: false, points: right },
      );
    }
  } else if (command.operation === "join") {
    const [a, b] = command.vertices,
      { contour: first } = at(a),
      { contour: second } = at(b);
    if (a.contour === b.contour || first.closed || second.closed)
      throw new Error("Escolha extremidades de dois contornos abertos diferentes.");
    if (
      (a.index !== 0 && a.index !== first.points.length - 1) ||
      (b.index !== 0 && b.index !== second.points.length - 1)
    )
      throw new Error("A união exige extremidades.");
    if (a.index === 0) reverseContour(first);
    if (b.index !== 0) reverseContour(second);
    const end = first.points.at(-1),
      start = second.points[0];
    if (!end || !start) throw new Error("Extremidade ausente.");
    if (Math.hypot(end.x - start.x, end.y - start.y) < 1e-9) {
      end.out = start.out;
      first.points = first.points.concat(second.points.slice(1));
    } else {
      end.out = null;
      start.in = null;
      first.points = first.points.concat(second.points);
    }
    contours = contours.filter((_, index) => index !== b.contour);
  } else {
    const refs = command.vertices,
      ids = new Set(refs.map((ref) => `${ref.contour}:${ref.index}`));
    if (ids.size !== refs.length) throw new Error("Vértices repetidos.");
    for (const ref of refs) at(ref);
    if (command.operation === "delete") {
      const selections = new Map<number, Set<number>>();
      for (const ref of refs) {
        let indices = selections.get(ref.contour);
        if (!indices) {
          indices = new Set();
          selections.set(ref.contour, indices);
        }
        indices.add(ref.index);
      }
      for (const [ci, indices] of selections) {
        const contour = contours[ci];
        if (!contour) throw new Error("Contorno ausente.");
        if (contour.points.length - indices.size < (contour.closed ? 3 : 2))
          throw new Error("Exclusão deixaria um contorno inválido.");
        contour.points = contour.points.filter((_, index) => !indices.has(index));
      }
    } else
      for (const ref of refs) {
        const { contour, point } = at(ref);
        if (command.operation === "move")
          moveVertex(point, point.x + command.dx, point.y + command.dy);
        else setVertexType(contour, ref.index, "asymmetric");
      }
  }
  entry.node.attrs.d = serializePath(contours);
  return entry.node.id;
}
