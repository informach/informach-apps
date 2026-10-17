// Canonical editable geometry: absolute anchors with absolute incoming/outgoing handles.
// SVG arcs are approximated by cubic segments of at most 90 degrees (SVG 2 Appendix B).
export const PATH_TAGS = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
]);
const MAX_POINTS = 4000;
const point = (x, y) => ({ x, y, in: null, out: null });
const xy = (p) => ({ x: p.x, y: p.y });
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const reflect = (p, c) => ({ x: 2 * p.x - c.x, y: 2 * p.y - c.y });
const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-8;

export function validatePath(contours) {
  if (!Array.isArray(contours) || !contours.length) throw new Error("Caminho vazio.");
  let count = 0;
  for (const contour of contours) {
    if (
      !Array.isArray(contour.points) ||
      !contour.points.length ||
      typeof contour.closed !== "boolean"
    )
      throw new Error("Contorno inválido.");
    for (const p of contour.points) {
      if (++count > MAX_POINTS) throw new Error("O caminho excede 4000 vértices.");
      for (const v of [p, p.in, p.out].filter(Boolean))
        if (
          !Number.isFinite(v.x) ||
          !Number.isFinite(v.y) ||
          Math.abs(v.x) > 1e7 ||
          Math.abs(v.y) > 1e7
        )
          throw new Error("Coordenada inválida no caminho.");
    }
  }
  return contours;
}

function arc(start, values) {
  let [rx, ry, angle, large, sweep, x, y] = values;
  if (![0, 1].includes(large) || ![0, 1].includes(sweep))
    throw new Error("Flags de arco inválidas.");
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (same(start, { x, y })) return [];
  if (!rx || !ry) return [{ end: point(x, y) }];
  const phi = (angle * Math.PI) / 180,
    cos = Math.cos(phi),
    sin = Math.sin(phi);
  const dx = (start.x - x) / 2,
    dy = (start.y - y) / 2;
  const xp = cos * dx + sin * dy,
    yp = -sin * dx + cos * dy;
  const scale = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
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
    );
  const cxp = (factor * rx * yp) / ry,
    cyp = (-factor * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (start.x + x) / 2,
    cy = sin * cxp + cos * cyp + (start.y + y) / 2;
  const ux = (xp - cxp) / rx,
    uy = (yp - cyp) / ry,
    vx = (-xp - cxp) / rx,
    vy = (-yp - cyp) / ry;
  let theta = Math.atan2(uy, ux),
    delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const count = Math.ceil(Math.abs(delta) / (Math.PI / 2)),
    step = delta / count;
  const map = (u, v) => ({
    x: cx + rx * cos * u - ry * sin * v,
    y: cy + rx * sin * u + ry * cos * v,
  });
  const result = [];
  for (let i = 0; i < count; i++) {
    const next = theta + step,
      k = (4 / 3) * Math.tan(step / 4);
    result.push({
      c1: map(Math.cos(theta) - k * Math.sin(theta), Math.sin(theta) + k * Math.cos(theta)),
      c2: map(Math.cos(next) + k * Math.sin(next), Math.sin(next) - k * Math.cos(next)),
      end: { ...point(0, 0), ...map(Math.cos(next), Math.sin(next)) },
    });
    theta = next;
  }
  Object.assign(result.at(-1).end, { x, y });
  return result;
}

export function parsePath(d) {
  if (typeof d !== "string" || d.length > 500000) throw new Error("Dados de caminho inválidos.");
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
  if (d.replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]/g, ""))
    throw new Error("Sintaxe SVG inválida.");
  const sizes = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
  const contours = [];
  let contour,
    current = { x: 0, y: 0 },
    command = "",
    previous = "",
    quadratic = null,
    i = 0,
    total = 0;
  const add = (end, c1 = null, c2 = null) => {
    if (!contour || contour.closed) throw new Error("O segmento precisa iniciar com M.");
    if (++total > MAX_POINTS) throw new Error("O caminho excede 4000 vértices.");
    if (c1) contour.points.at(-1).out = c1;
    end.in = c2;
    contour.points.push(end);
    current = end;
  };
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
    if (!command) throw new Error("Comando SVG ausente.");
    const upper = command.toUpperCase(),
      relative = command !== upper;
    if (upper === "Z") {
      if (!contour || contour.closed) throw new Error("Fechamento inválido.");
      const first = contour.points[0],
        last = contour.points.at(-1);
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
    const values = [];
    for (let j = 0; j < size; j++) {
      // Arc flags may be adjacent, e.g. A10 10 0 0110 20.
      if (
        upper === "A" &&
        (j === 3 || j === 4) &&
        tokens[i]?.length > 1 &&
        /^[01]\d/.test(tokens[i])
      ) {
        values.push(Number(tokens[i][0]));
        tokens[i] = tokens[i].slice(1);
        continue;
      }
      if (i >= tokens.length || /^[a-z]$/i.test(tokens[i]))
        throw new Error("Parâmetros SVG incompletos.");
      const n = Number(tokens[i++]);
      if (!Number.isFinite(n)) throw new Error("Número SVG inválido.");
      values.push(n);
    }
    const absolute = (x, y) => ({
      x: x + (relative ? current.x : 0),
      y: y + (relative ? current.y : 0),
    });
    const end = (x, y) => ({ ...point(0, 0), ...absolute(x, y) });
    if (upper === "M") {
      current = end(values[0], values[1]);
      contour = { closed: false, points: [current] };
      contours.push(contour);
      total++;
      command = relative ? "l" : "L";
    } else if (upper === "L") add(end(...values));
    else if (upper === "H") add(point(values[0] + (relative ? current.x : 0), current.y));
    else if (upper === "V") add(point(current.x, values[0] + (relative ? current.y : 0)));
    else if (upper === "C")
      add(
        end(values[4], values[5]),
        absolute(values[0], values[1]),
        absolute(values[2], values[3]),
      );
    else if (upper === "S")
      add(
        end(values[2], values[3]),
        ["C", "S"].includes(previous) && current.in ? reflect(current, current.in) : xy(current),
        absolute(values[0], values[1]),
      );
    else if (upper === "Q" || upper === "T") {
      const control =
        upper === "Q"
          ? absolute(values[0], values[1])
          : ["Q", "T"].includes(previous) && quadratic
            ? reflect(current, quadratic)
            : xy(current);
      const next = upper === "Q" ? end(values[2], values[3]) : end(values[0], values[1]);
      add(next, mix(current, control, 2 / 3), mix(next, control, 2 / 3));
      quadratic = control;
    } else if (upper === "A") {
      const target = absolute(values[5], values[6]);
      for (const segment of arc(current, [...values.slice(0, 5), target.x, target.y]))
        add(segment.end, segment.c1, segment.c2);
    }
    if (!["Q", "T"].includes(upper)) quadratic = null;
    previous = upper;
  }
  return validatePath(contours);
}

export function serializePath(contours) {
  validatePath(contours);
  const n = (v) => String(Number(v.toFixed(6))),
    p = (v) => `${n(v.x)} ${n(v.y)}`;
  return contours
    .map(({ points, closed }) => {
      const commands = [`M${p(points[0])}`],
        count = points.length + (closed ? 1 : 0);
      for (let i = 1; i < count; i++) {
        const a = points[i - 1],
          b = points[i % points.length];
        if (a.out || b.in) commands.push(`C${p(a.out || a)} ${p(b.in || b)} ${p(b)}`);
        else if (i < points.length) commands.push(`L${p(b)}`);
      }
      if (closed) commands.push("Z");
      return commands.join(" ");
    })
    .join(" ");
}

export function pathFromNode(node) {
  if (!PATH_TAGS.has(node.tag)) throw new Error("Selecione uma forma ou caminho.");
  const a = node.attrs,
    n = (key, fallback = 0) => {
      const v = Number(a[key] ?? fallback);
      if (!Number.isFinite(v)) throw new Error("Dimensão SVG inválida.");
      return v;
    };
  if (node.tag === "path") return parsePath(a.d);
  if (node.tag === "line") return parsePath(`M${n("x1")} ${n("y1")}L${n("x2")} ${n("y2")}`);
  if (["polyline", "polygon"].includes(node.tag)) {
    const raw = (a.points || "").trim();
    if (!raw || raw.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?|[\s,]/gi, ""))
      throw new Error("Lista de pontos inválida.");
    const v = raw.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi).map(Number);
    if (v.length < 4 || v.length % 2) throw new Error("Lista de pontos incompleta.");
    return parsePath(
      v.map((x, i) => (i % 2 ? "" : `${i ? "L" : "M"}${x} ${v[i + 1]}`)).join(" ") +
        (node.tag === "polygon" ? "Z" : ""),
    );
  }
  if (node.tag === "rect") {
    const x = n("x"),
      y = n("y"),
      w = n("width"),
      h = n("height");
    if (w <= 0 || h <= 0) throw new Error("O retângulo precisa ter dimensões positivas.");
    const rx = Math.min(w / 2, Math.max(0, n("rx", a.ry ?? 0))),
      ry = Math.min(h / 2, Math.max(0, n("ry", a.rx ?? 0)));
    return parsePath(
      rx && ry
        ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
        : `M${x} ${y}H${x + w}V${y + h}H${x}Z`,
    );
  }
  const x = n("cx"),
    y = n("cy"),
    rx = node.tag === "circle" ? n("r") : n("rx"),
    ry = node.tag === "circle" ? n("r") : n("ry");
  if (rx <= 0 || ry <= 0) throw new Error("A elipse precisa ter raios positivos.");
  return parsePath(
    `M${x + rx} ${y}A${rx} ${ry} 0 0 1 ${x - rx} ${y}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`,
  );
}

export function moveVertex(p, x, y) {
  const dx = x - p.x,
    dy = y - p.y;
  for (const h of [p.in, p.out].filter(Boolean)) {
    h.x += dx;
    h.y += dy;
  }
  p.x = x;
  p.y = y;
}
export function moveHandle(p, side, x, y, mode = "detached") {
  if (!["in", "out"].includes(side)) throw new Error("Alça inválida.");
  const opposite = side === "in" ? "out" : "in",
    length = p[opposite]
      ? Math.hypot(p[opposite].x - p.x, p[opposite].y - p.y)
      : Math.hypot(x - p.x, y - p.y);
  p[side] = { x, y };
  if (mode === "mirrored") p[opposite] = reflect(p, p[side]);
  if (mode === "asymmetric") {
    const size = Math.hypot(x - p.x, y - p.y);
    if (size > 1e-9)
      p[opposite] = { x: p.x - ((x - p.x) * length) / size, y: p.y - ((y - p.y) * length) / size };
  }
}
export function setVertexType(contour, index, mode) {
  const p = contour.points[index];
  if (!p) throw new Error("Vértice ausente.");
  if (mode === "straight") {
    p.in = p.out = null;
    return;
  }
  if (!["mirrored", "asymmetric", "detached"].includes(mode))
    throw new Error("Tipo de vértice inválido.");
  if (!p.out && !p.in) {
    const previous = contour.points[(index - 1 + contour.points.length) % contour.points.length],
      next = contour.points[(index + 1) % contour.points.length];
    let dx = next.x - previous.x,
      dy = next.y - previous.y;
    if (Math.hypot(dx, dy) < 1e-9) {
      dx = next.x - p.x;
      dy = next.y - p.y;
    }
    const size = Math.hypot(dx, dy) || 1,
      length = Math.max(
        1,
        Math.min(
          Math.hypot(p.x - previous.x, p.y - previous.y),
          Math.hypot(next.x - p.x, next.y - p.y),
        ) / 3,
      );
    p.out = { x: p.x + (dx / size) * length, y: p.y + (dy / size) * length };
    p.in = reflect(p, p.out);
  }
  const side = p.out ? "out" : "in";
  moveHandle(p, side, p[side].x, p[side].y, mode);
}
export function segmentPoints(contour, index) {
  const a = contour.points[index],
    b = contour.points[(index + 1) % contour.points.length];
  if (!a || !b || (!contour.closed && index === contour.points.length - 1))
    throw new Error("Segmento ausente.");
  return [a, a.out || a, b.in || b, b];
}
export function pointOnSegment(contour, index, t) {
  const [a, b, c, d] = segmentPoints(contour, index),
    u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}
export function splitSegment(contour, index, t = 0.5) {
  if (!(t > 0 && t < 1)) throw new Error("Posição de inserção inválida.");
  const [a, b, c, d] = segmentPoints(contour, index),
    ab = mix(a, b, t),
    bc = mix(b, c, t),
    cd = mix(c, d, t),
    abc = mix(ab, bc, t),
    bcd = mix(bc, cd, t),
    center = mix(abc, bcd, t);
  const p = point(center.x, center.y);
  if (a.out || d.in) {
    a.out = ab;
    d.in = cd;
    p.in = abc;
    p.out = bcd;
  }
  contour.points.splice(index + 1, 0, p);
  return index + 1;
}
export function deleteVertex(contour, index) {
  if (contour.points.length <= (contour.closed ? 3 : 2))
    throw new Error("Mantenha pelo menos três pontos no contorno fechado ou dois no aberto.");
  if (!contour.points[index]) throw new Error("Vértice ausente.");
  contour.points.splice(index, 1);
}
export function reverseContour(contour) {
  contour.points.reverse();
  for (const p of contour.points) [p.in, p.out] = [p.out, p.in];
}
