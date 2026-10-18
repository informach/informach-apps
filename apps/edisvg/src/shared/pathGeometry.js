import { svgPrimitiveFromAttributes, svgPrimitivePathData } from "@informach/edi-motion/geometry";
import { parseSvgPath as parsePath } from "@informach/edi-motion/svg-path";

export { parsePath };
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
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const reflect = (p, c) => ({ x: 2 * p.x - c.x, y: 2 * p.y - c.y });

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
  return parsePath(pathDataFromNode(node));
}
/** Native SVG syntax, shared with importers that must not replace elliptic
 * paths by the editor's cubic approximation merely to reference a silhouette.
 * @param {import('./sceneTypes').SceneNode} node
 * @returns {string}
 */
export function pathDataFromNode(node) {
  if (!PATH_TAGS.has(node.tag)) throw new Error("Selecione uma forma ou caminho.");
  if (node.tag === "path") {
    if (typeof node.attrs.d !== "string") throw new Error("Dados de caminho ausentes.");
    return node.attrs.d;
  }
  const shape = svgPrimitiveFromAttributes(node.tag, node.attrs);
  if (
    (shape.kind === "rect" && (!shape.width || !shape.height)) ||
    (shape.kind === "circle" && !shape.r) ||
    (shape.kind === "ellipse" && (!shape.rx || !shape.ry))
  )
    throw new Error("Conversão editável requer dimensões positivas.");
  return svgPrimitivePathData(shape);
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
