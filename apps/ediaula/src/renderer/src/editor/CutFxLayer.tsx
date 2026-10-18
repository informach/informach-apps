import {
  type CutFx,
  colorFxShapes,
  cutFxWindow,
  exprFn,
  type FxShape,
  glitchShift,
  glitchSlot,
} from "@shared/transitions";
import type { ReactNode } from "react";
import { usePlayback } from "@/state/playback";

/**
 * Effects over the whole frame around a cut, drawn over the preview stage (width × height screen
 * pixels for a frame of `frame` pixels). Color transitions evaluate the export's own expressions;
 * the glitch uses the export's blocks and timing, as color-split stripes over the picture (the
 * export moves the picture's own pixels).
 */
export function CutFxLayer({
  effects,
  width,
  height,
  frame,
}: {
  effects: CutFx[];
  width: number;
  height: number;
  frame: { width: number; height: number };
}): ReactNode {
  const t = usePlayback((s) => s.time);
  const on = effects.filter((fx) => {
    const [a, b] = cutFxWindow(fx);
    return t >= a && t <= b;
  });
  if (!on.length) return null;
  const k = width / frame.width;
  return (
    <div className="stage-cutfx" style={{ width, height }}>
      {on.map((fx) =>
        fx.kind === "glitch" ? (
          <Glitch key={`${fx.kind}:${fx.at}`} fx={fx} t={t} width={width} height={height} />
        ) : (
          // Back shapes first, so the front one is on top.
          [...colorFxShapes(fx, frame.width, frame.height)]
            .reverse()
            .map((s) => (
              <Shape
                key={`${fx.kind}:${fx.at}:${JSON.stringify(s)}`}
                s={s}
                t={t}
                k={k}
                frame={frame}
              />
            ))
        ),
      )}
    </div>
  );
}

function Shape({
  s,
  t,
  k,
  frame,
}: {
  s: FxShape;
  t: number;
  k: number;
  frame: { width: number; height: number };
}): ReactNode {
  const v = (e: string): number => exprFn(e)(t);
  if (s.type === "rect") {
    const x0 = v(s.x0);
    const x1 = v(s.x1);
    const y0 = v(s.y0);
    const y1 = v(s.y1);
    if (x1 <= x0 || y1 <= y0) return null;
    return (
      <span
        className="cutfx-shape"
        style={{
          background: s.color,
          left: x0 * k,
          top: y0 * k,
          width: (x1 - x0) * k,
          height: (y1 - y0) * k,
        }}
      />
    );
  }
  if (s.type === "slab") {
    const w = v(s.width);
    const long = Math.hypot(frame.width, frame.height) * 4;
    return (
      <span
        className="cutfx-shape"
        style={{
          background: s.color,
          width: w * k,
          height: long * k,
          left: (v(s.cx) - w / 2) * k,
          top: (v(s.cy) - long / 2) * k,
          transform: `rotate(${v(s.angle)}rad)`,
        }}
      />
    );
  }
  const rOut = v(s.rOut);
  const rIn = Math.min(v(s.rIn), rOut);
  if (rOut <= rIn) return null;
  return (
    <span
      className="cutfx-shape cutfx-ring"
      style={{
        left: (v(s.cx) - rOut) * k,
        top: (v(s.cy) - rOut) * k,
        width: 2 * rOut * k,
        height: 2 * rOut * k,
        borderWidth: (rOut - rIn) * k,
        borderColor: s.color,
      }}
    />
  );
}

function Glitch({
  fx,
  t,
  width,
  height,
}: {
  fx: CutFx;
  t: number;
  width: number;
  height: number;
}): ReactNode {
  // Slots count from the cut, as in the export, so a glitch looks the same wherever it is.
  const slot = glitchSlot(t - fx.at);
  const amp = Math.max(0, Math.min(1, 1 - Math.abs(t - fx.at) / (fx.duration / 2)));
  const blocks: ReactNode[] = [];
  for (let row = 0; row < 18; row++)
    for (let col = 0; col < 6; col++) {
      const shift = glitchShift(row, col, slot, amp);
      if (!shift) continue;
      blocks.push(
        <span
          key={`${row}-${col}`}
          className="cutfx-block"
          style={{
            left: (col / 6) * width,
            top: (row / 18) * height,
            width: width / 6,
            height: height / 18,
            transform: `translateX(${shift * width}px)`,
          }}
        />,
      );
    }
  return (
    <>
      <span className="cutfx-split" style={{ opacity: 0.25 + 0.5 * amp }} />
      {blocks}
    </>
  );
}
