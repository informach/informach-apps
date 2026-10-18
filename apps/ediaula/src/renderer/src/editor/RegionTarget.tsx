import type { Rect, RegionFx } from "@shared/look";
import type { Clip } from "@shared/types";
import { type ReactNode, useEffect, useState } from "react";
import { useProject } from "@/state/project";

const MIN = 0.02;

function setRect(clipId: string, rect: Rect): void {
  useProject.getState().commit((p) => ({
    ...p,
    clips: p.clips.map((c) =>
      c.id === clipId && c.regionFx ? { ...c, regionFx: { ...c.regionFx, rect } } : c,
    ),
  }));
}

/**
 * While a region effect is selected: its rectangle over the preview. Drag inside to move it,
 * drag the corner to change its size; one undo step per gesture.
 */
export function RegionTarget({
  clip,
  width,
  height,
}: {
  clip: Clip;
  width: number;
  height: number;
}): ReactNode {
  const fx = clip.regionFx as RegionFx;
  const [draft, setDraft] = useState<Rect>(fx.rect);
  useEffect(() => setDraft(fx.rect), [fx.rect]);
  const drag = (e: React.PointerEvent, mode: "move" | "size"): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, ...draft };
    let last = draft;
    const move = (ev: PointerEvent): void => {
      const dx = (ev.clientX - start.px) / width;
      const dy = (ev.clientY - start.py) / height;
      last =
        mode === "move"
          ? {
              ...start,
              x: Math.min(1 - start.w, Math.max(0, start.x + dx)),
              y: Math.min(1 - start.h, Math.max(0, start.y + dy)),
            }
          : {
              x: start.x,
              y: start.y,
              w: Math.min(1 - start.x, Math.max(MIN, start.w + dx)),
              h: Math.min(1 - start.y, Math.max(MIN, start.h + dy)),
            };
      setDraft(last);
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const round = (v: number): number => Math.round(v * 10000) / 10000;
      setRect(clip.id, { x: round(last.x), y: round(last.y), w: round(last.w), h: round(last.h) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      className="region-target"
      style={{
        left: draft.x * width,
        top: draft.y * height,
        width: draft.w * width,
        height: draft.h * height,
      }}
      onPointerDown={(e) => drag(e, "move")}
      title="Arraste para mover; o canto muda o tamanho"
    >
      <span
        className="region-target-corner"
        onPointerDown={(e) => drag(e, "size")}
        title="Arraste para mudar o tamanho da região"
      />
    </div>
  );
}
