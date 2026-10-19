import { type Contour, type Geometry, type Point, parseGeometry, type Vertex } from "./geometry";

const point = (x: number, y: number): Vertex => ({ x, y, in: null, out: null });
const xy = (p: Point): Point => ({ x: p.x, y: p.y });
const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const reflect = (p: Point, center: Point): Point => ({
  x: 2 * p.x - center.x,
  y: 2 * p.y - center.y,
});
const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-8;
function at(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined || !Number.isFinite(value))
    throw new Error("Parâmetros SVG incompletos/inválidos.");
  return value;
}
interface ArcSegment {
  end: Vertex;
  c1?: Point;
  c2?: Point;
}
/** SVG 2 Appendix B: editable Bézier approximation, maximum 90° per segment.
 * Native renderers may retain original A/a syntax separately for exact arcs. */
function arc(start: Point, values: readonly number[]): ArcSegment[] {
  let rx = Math.abs(at(values, 0)),
    ry = Math.abs(at(values, 1));
  const angle = at(values, 2),
    large = at(values, 3),
    sweep = at(values, 4),
    x = at(values, 5),
    y = at(values, 6);
  if (![0, 1].includes(large) || ![0, 1].includes(sweep))
    throw new Error("Flags de arco inválidas.");
  if (same(start, { x, y })) return [];
  if (!rx || !ry) return [{ end: point(x, y) }];
  const phi = (angle * Math.PI) / 180,
    cos = Math.cos(phi),
    sin = Math.sin(phi),
    dx = (start.x - x) / 2,
    dy = (start.y - y) / 2,
    xp = cos * dx + sin * dy,
    yp = -sin * dx + cos * dy,
    scale = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (scale > 1) {
    rx *= Math.sqrt(scale);
    ry *= Math.sqrt(scale);
  }
  const factor =
      (large === sweep ? -1 : 1) *
      Math.sqrt(
        Math.max(
          0,
          (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) /
            (rx * rx * yp * yp + ry * ry * xp * xp),
        ),
      ),
    cxp = (factor * rx * yp) / ry,
    cyp = (-factor * ry * xp) / rx,
    cx = cos * cxp - sin * cyp + (start.x + x) / 2,
    cy = sin * cxp + cos * cyp + (start.y + y) / 2,
    ux = (xp - cxp) / rx,
    uy = (yp - cyp) / ry,
    vx = (-xp - cxp) / rx,
    vy = (-yp - cyp) / ry;
  let theta = Math.atan2(uy, ux),
    delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const count = Math.ceil(Math.abs(delta) / (Math.PI / 2)),
    step = delta / count,
    map = (u: number, v: number): Point => ({
      x: cx + rx * cos * u - ry * sin * v,
      y: cy + rx * sin * u + ry * cos * v,
    }),
    result: ArcSegment[] = [];
  for (let index = 0; index < count; index++) {
    const next = theta + step,
      k = (4 / 3) * Math.tan(step / 4);
    result.push({
      c1: map(Math.cos(theta) - k * Math.sin(theta), Math.sin(theta) + k * Math.cos(theta)),
      c2: map(Math.cos(next) + k * Math.sin(next), Math.sin(next) - k * Math.cos(next)),
      end: { ...point(0, 0), ...map(Math.cos(next), Math.sin(next)) },
    });
    theta = next;
  }
  const last = result.at(-1);
  if (!last) throw new Error("Arco SVG numericamente degenerado.");
  Object.assign(last.end, { x, y });
  return result;
}

/** DOM-free grammar shared by authoring and portable document validation. */
export function parseSvgPath(d: string): Geometry {
  if (typeof d !== "string" || d.length > 500000) throw new Error("Dados de caminho inválidos.");
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  if (d.replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]/g, ""))
    throw new Error("Sintaxe SVG inválida.");
  const sizes: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 },
    contours: Contour[] = [];
  let contour: Contour | undefined,
    current: Vertex = point(0, 0),
    command = "",
    previous = "",
    quadratic: Point | null = null,
    index = 0,
    total = 0;
  const spend = () => {
    if (++total > 4000) throw new Error("O caminho excede 4000 vértices.");
  };
  const add = (end: Vertex, c1: Point | null = null, c2: Point | null = null) => {
    if (!contour) throw new Error("O segmento precisa iniciar com M.");
    if (contour.closed) {
      spend();
      contour = { closed: false, points: [point(current.x, current.y)] };
      contours.push(contour);
    }
    spend();
    const last = contour.points.at(-1);
    if (!last) throw new Error("Contorno SVG vazio.");
    if (c1) last.out = c1;
    end.in = c2;
    contour.points.push(end);
    current = end;
  };
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) throw new Error("Comando SVG ausente.");
    if (/^[a-z]$/i.test(token)) {
      command = token;
      index++;
    }
    if (!command) throw new Error("Comando SVG ausente.");
    const upper = command.toUpperCase(),
      relative = command !== upper;
    if (upper === "Z") {
      if (!contour || contour.closed) throw new Error("Fechamento inválido.");
      const first = contour.points[0],
        last = contour.points.at(-1);
      if (!first || !last) throw new Error("Contorno SVG vazio.");
      if (contour.points.length > 1 && same(first, last)) {
        first.in = last.in;
        contour.points.pop();
      }
      contour.closed = true;
      current = first;
      command = "";
      previous = "Z";
      quadratic = null;
      continue;
    }
    const size = sizes[upper];
    if (!size) throw new Error(`Comando SVG não suportado: ${command}`);
    const values: number[] = [];
    for (let part = 0; part < size; part++) {
      const value = tokens[index];
      if (value === undefined || /^[a-z]$/i.test(value))
        throw new Error("Parâmetros SVG incompletos.");
      if (
        upper === "A" &&
        (part === 3 || part === 4) &&
        value.length > 1 &&
        /^[01]\d/.test(value)
      ) {
        values.push(Number(value[0]));
        tokens[index] = value.slice(1);
        continue;
      }
      const number = Number(value);
      index++;
      if (!Number.isFinite(number)) throw new Error("Número SVG inválido.");
      values.push(number);
    }
    const absolute = (x: number, y: number): Point => ({
        x: x + (relative ? current.x : 0),
        y: y + (relative ? current.y : 0),
      }),
      end = (x: number, y: number): Vertex => ({ ...point(0, 0), ...absolute(x, y) }),
      value = (atIndex: number) => at(values, atIndex);
    if (upper === "M") {
      spend();
      current = end(value(0), value(1));
      contour = { closed: false, points: [current] };
      contours.push(contour);
      command = relative ? "l" : "L";
    } else if (upper === "L") add(end(value(0), value(1)));
    else if (upper === "H") add(point(value(0) + (relative ? current.x : 0), current.y));
    else if (upper === "V") add(point(current.x, value(0) + (relative ? current.y : 0)));
    else if (upper === "C")
      add(end(value(4), value(5)), absolute(value(0), value(1)), absolute(value(2), value(3)));
    else if (upper === "S")
      add(
        end(value(2), value(3)),
        ["C", "S"].includes(previous) && current.in ? reflect(current, current.in) : xy(current),
        absolute(value(0), value(1)),
      );
    else if (upper === "Q" || upper === "T") {
      const control: Point =
          upper === "Q"
            ? absolute(value(0), value(1))
            : ["Q", "T"].includes(previous) && quadratic
              ? reflect(current, quadratic)
              : xy(current),
        next = upper === "Q" ? end(value(2), value(3)) : end(value(0), value(1));
      add(next, mix(current, control, 2 / 3), mix(next, control, 2 / 3));
      quadratic = control;
    } else if (upper === "A") {
      const target = absolute(value(5), value(6));
      for (const segment of arc(current, [...values.slice(0, 5), target.x, target.y]))
        add(segment.end, segment.c1 ?? null, segment.c2 ?? null);
    }
    if (!["Q", "T"].includes(upper)) quadratic = null;
    previous = upper;
  }
  if (!contours.length) throw new Error("Caminho vazio.");
  return parseGeometry(contours);
}
