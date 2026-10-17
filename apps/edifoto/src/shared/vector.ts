import type { Anchor, Point, Transform, VectorStyle } from "./doc.ts";

export const SHAPE_LABELS = {
  rectangle: "Retângulo",
  ellipse: "Elipse",
  triangle: "Triângulo",
  polygon: "Polígono",
  star: "Estrela",
  line: "Linha",
  path: "Traçado",
};

export function pathData(points: Anchor[], closed: boolean): string {
  if (!points.length) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  const count = points.length + (closed ? 1 : 0);
  for (let i = 1; i < count; i++) {
    const a = points[(i - 1) % points.length],
      b = points[i % points.length];
    if (a.outgoing || b.incoming) {
      const c = a.outgoing ?? a,
        e = b.incoming ?? b;
      d += ` C ${c.x} ${c.y} ${e.x} ${e.y} ${b.x} ${b.y}`;
    } else d += ` L ${b.x} ${b.y}`;
  }
  return d + (closed ? " Z" : "");
}

export function shapePath(v: VectorStyle): string {
  const w = v.width,
    h = v.height;
  if (v.shape === "path") return pathData(v.points, v.closed);
  if (v.shape === "ellipse")
    return `M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`;
  if (v.shape === "line") return `M 0 0 L ${w} ${h}`;
  if (v.shape === "rectangle") {
    const r = Math.max(0, Math.min(v.radius, w / 2, h / 2));
    return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  }
  const sides = v.shape === "triangle" ? 3 : Math.max(3, Math.round(v.sides));
  const n = v.shape === "star" ? sides * 2 : sides;
  return pathData(
    Array.from({ length: n }, (_, i) => {
      const a = (i * Math.PI * 2) / n - Math.PI / 2;
      const r = v.shape === "star" && i % 2 ? v.innerRadius : 1;
      return { x: w / 2 + ((Math.cos(a) * w) / 2) * r, y: h / 2 + ((Math.sin(a) * h) / 2) * r };
    }),
    true,
  );
}

export function localToDoc(p: Point, t: Transform, width: number, height: number): Point {
  const x = (p.x - width / 2) * t.scale * (t.flipX ? -1 : 1);
  const y = (p.y - height / 2) * t.scale * (t.flipY ? -1 : 1);
  const r = (t.rotation * Math.PI) / 180;
  return { x: t.x + x * Math.cos(r) - y * Math.sin(r), y: t.y + x * Math.sin(r) + y * Math.cos(r) };
}

export function docToLocal(p: Point, t: Transform, width: number, height: number): Point {
  const r = (-t.rotation * Math.PI) / 180,
    x = p.x - t.x,
    y = p.y - t.y;
  return {
    x: ((x * Math.cos(r) - y * Math.sin(r)) / t.scale) * (t.flipX ? -1 : 1) + width / 2,
    y: ((x * Math.sin(r) + y * Math.cos(r)) / t.scale) * (t.flipY ? -1 : 1) + height / 2,
  };
}

export function dragRect(
  a: Point,
  b: Point,
  square = false,
  center = false,
): { x: number; y: number; width: number; height: number } {
  let dx = b.x - a.x,
    dy = b.y - a.y;
  if (square) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * size;
    dy = (dy < 0 ? -1 : 1) * size;
  }
  return {
    x: center ? a.x : a.x + dx / 2,
    y: center ? a.y : a.y + dy / 2,
    width: Math.max(1, Math.abs(dx) * (center ? 2 : 1)),
    height: Math.max(1, Math.abs(dy) * (center ? 2 : 1)),
  };
}
