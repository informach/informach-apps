import { GAIN_MAX_DB, type GainPoint, gainDbAt, upsertGain } from "@shared/gain";
import type { Clip } from "@shared/types";
import { type ReactNode, useState } from "react";
import { useProject, waitForDraft } from "@/state/project";

/** dB at the top and at the bottom of the clip (below the bottom it is silence). */
const TOP = GAIN_MAX_DB;
const BOTTOM = -40;

const yOf = (db: number, h: number): number =>
  ((TOP - Math.max(BOTTOM, Math.min(TOP, db))) / (TOP - BOTTOM)) * h;
const dbOf = (y: number, h: number): number => {
  const db = TOP - (Math.max(0, Math.min(h, y)) / h) * (TOP - BOTTOM);
  return db <= BOTTOM + 0.5 ? -60 : Math.round(db * 2) / 2;
};

function setGain(clipId: string, gain: GainPoint[]): void {
  useProject.getState().commit((p) => ({
    ...p,
    clips: p.clips.map((c) => {
      if (c.id !== clipId) return c;
      if (gain.length) return { ...c, gain };
      const { gain: _none, ...rest } = c;
      return rest;
    }),
  }));
}

/** Two clicks on the selected clip: a point of the envelope there, on the line as it is. */
export function addGainPoint(clip: Clip, local: number): void {
  if (waitForDraft("mudar o volume do clipe")) return;
  const t = Math.max(0, Math.min(clip.duration, local));
  setGain(clip.id, upsertGain(clip.gain, t, gainDbAt(clip.gain, t)));
}

/**
 * The volume envelope of a clip, drawn over it (shared/gain.ts): the line in dB from +12 at
 * the top to silence at the bottom. On the selected clip, two clicks on the line add a point,
 * a point is dragged to change when and how loud, and Alt + click removes it. One undo step
 * per gesture.
 */
export function GainEnvelope({
  clip,
  zoom,
  height,
  editable,
}: {
  clip: Clip;
  zoom: number;
  height: number;
  editable: boolean;
}): ReactNode {
  const [drag, setDrag] = useState<{ index: number; point: GainPoint } | null>(null);
  const points = [...(clip.gain ?? [])].sort((a, b) => a.t - b.t);
  const shown = drag
    ? points.map((p, i) => (i === drag.index ? drag.point : p)).sort((a, b) => a.t - b.t)
    : points;
  const w = Math.max(2, clip.duration * zoom);
  const h = Math.max(8, height);
  // The line sampled where it bends: the edges and every point inside the clip.
  const xs = [0, ...shown.map((p) => p.t).filter((t) => t > 0 && t < clip.duration), clip.duration];
  const line = xs.map((t) => `${(t * zoom).toFixed(1)},${yOf(gainDbAt(shown, t), h).toFixed(1)}`);

  const start = (e: React.PointerEvent, index: number): void => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    if (waitForDraft("mudar o volume do clipe")) return;
    if (e.altKey) {
      setGain(
        clip.id,
        points.filter((_, i) => i !== index),
      );
      return;
    }
    const box = (e.currentTarget as SVGElement).ownerSVGElement?.getBoundingClientRect();
    if (!box) return;
    let last: GainPoint = points[index];
    const move = (ev: PointerEvent): void => {
      const t = Math.max(0, Math.min(clip.duration, (ev.clientX - box.left) / zoom));
      last = { t, db: dbOf(ev.clientY - box.top, h) };
      setDrag({ index, point: last });
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      setGain(
        clip.id,
        upsertGain(
          points.filter((_, i) => i !== index),
          last.t,
          last.db,
        ),
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <svg
      className={`gain-envelope ${editable ? "is-editable" : ""}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
    >
      <polyline className="gain-line" points={line.join(" ")} />
      {shown.map((p) =>
        p.t < 0 || p.t > clip.duration ? null : (
          <circle
            key={`${p.t}:${p.db}`}
            className="gain-point"
            cx={p.t * zoom}
            cy={yOf(p.db, h)}
            r={editable ? 4 : 2.5}
            onPointerDown={(e) => {
              const index = points.indexOf(p);
              if (index >= 0) start(e, index);
            }}
          >
            <title>{`${p.db <= -60 ? "mudo" : `${p.db > 0 ? "+" : ""}${p.db} dB`}. Arraste; Alt + clique remove.`}</title>
          </circle>
        ),
      )}
    </svg>
  );
}
