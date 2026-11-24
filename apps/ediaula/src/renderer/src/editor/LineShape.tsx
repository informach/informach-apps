import type { HeadShape } from "@shared/annotation";
import type { Point } from "@shared/lineGeometry";
import type { ReactNode } from "react";

/**
 * A straight line with its heads as an SVG, in screen pixels: the picture of the line while it is
 * drawn (editor/LinePen.tsx) or while an end is dragged (editor/LineEndsControl.tsx), before the
 * annotation is redrawn. Same shapes as the drawing of lib/annotations.ts, without its outline,
 * curve or shadow.
 */
export function LineShape({
  start,
  end,
  color,
  thickness,
  headSize,
  heads,
}: {
  start: Point;
  end: Point;
  color: string;
  /** Screen pixels. */
  thickness: number;
  headSize: number;
  heads: { start: HeadShape; end: HeadShape };
}): ReactNode {
  const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const d = { x: (end.x - start.x) / len, y: (end.y - start.y) / len };
  const knob = headSize * 0.6;
  const inset = (shape: HeadShape): number =>
    shape === "triangle"
      ? headSize * 0.85
      : shape === "notched"
        ? headSize * 0.5
        : shape === "circle" || shape === "square"
          ? knob / 2
          : 0;
  const a = {
    x: start.x + d.x * inset(heads.start),
    y: start.y + d.y * inset(heads.start),
  };
  const b = { x: end.x - d.x * inset(heads.end), y: end.y - d.y * inset(heads.end) };
  /** The head at `tip`, pointing along `dir`. */
  const head = (shape: HeadShape, tip: Point, dir: Point, key: string): ReactNode => {
    const n = { x: -dir.y, y: dir.x };
    const at = (along: number, across: number): string =>
      `${tip.x + dir.x * along + n.x * across},${tip.y + dir.y * along + n.y * across}`;
    switch (shape) {
      case "none":
        return null;
      case "circle":
        return (
          <circle
            key={key}
            cx={tip.x - (dir.x * knob) / 2}
            cy={tip.y - (dir.y * knob) / 2}
            r={knob / 2}
            fill={color}
          />
        );
      case "square":
        return (
          <polygon
            key={key}
            fill={color}
            points={[
              at(0, knob / 2),
              at(-knob, knob / 2),
              at(-knob, -knob / 2),
              at(0, -knob / 2),
            ].join(" ")}
          />
        );
      case "bar":
        return (
          <polyline
            key={key}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            points={[at(0, headSize * 0.4), at(0, -headSize * 0.4)].join(" ")}
          />
        );
      case "open":
        return (
          <polyline
            key={key}
            fill="none"
            stroke={color}
            strokeWidth={Math.max(thickness, headSize * 0.14)}
            strokeLinejoin="round"
            points={[
              at(-headSize, (headSize * 0.85) / 2),
              at(0, 0),
              at(-headSize, (-headSize * 0.85) / 2),
            ].join(" ")}
          />
        );
      default: {
        const w = shape === "triangle" ? headSize : headSize * 0.85;
        const corners = [at(0, 0), at(-headSize, w / 2)];
        if (shape === "notched") corners.push(at(-headSize * 0.7, 0));
        corners.push(at(-headSize, -w / 2));
        return <polygon key={key} fill={color} points={corners.join(" ")} />;
      }
    }
  };
  return (
    <g className="line-shape">
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
      />
      {head(heads.end, end, d, "end")}
      {head(heads.start, start, { x: -d.x, y: -d.y }, "start")}
    </g>
  );
}
