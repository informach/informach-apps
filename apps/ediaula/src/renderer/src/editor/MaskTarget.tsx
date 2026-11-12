import { type Crop, clipLayout, NO_CROP, type Transform } from "@shared/compose";
import { transformAt } from "@shared/keyframes";
import {
  cropToEdges,
  dragMask,
  edgesToCrop,
  MASK_HANDLES,
  type MaskHandle,
} from "@shared/maskDrag";
import { clipEnd } from "@shared/timeline";
import type { Asset, Clip, ProjectSettings } from "@shared/types";
import { type ReactNode, useEffect, useState } from "react";
import { useApp } from "@/state/app";
import { liveEdit } from "@/state/liveEdit";
import { usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";

/**
 * While "Ajustar a máscara na prévia" is on: the whole picture's outline and the mask over it, on the
 * preview. Drag inside to move the mask (the picture stays still), drag a side or a corner to
 * change its size; Shift keeps its proportion, a circle always does. Enter or Esc ends. One undo
 * step per gesture.
 */
export function MaskTarget({
  clip,
  asset,
  transform,
  settings,
  scale,
}: {
  clip: Clip;
  asset: Asset;
  transform: Transform;
  settings: Pick<ProjectSettings, "width" | "height">;
  scale: number;
}): ReactNode {
  const time = usePlayback((s) => s.time);
  const committed = clip.transform?.crop ?? NO_CROP;
  const [draft, setDraft] = useState<Crop>(committed);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) setDraft(committed);
  }, [committed, dragging]);
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        useApp.getState().set({ maskEdit: null });
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  if (time < clip.start || time >= clipEnd(clip)) return null;

  const shown = clip.keyframes?.length ? { ...transform, ...transformAt(clip, time) } : transform;
  const lay = clipLayout({ transform: { ...shown, crop: draft } }, asset, settings);
  const fw = lay.full.w * scale;
  const fh = lay.full.h * scale;
  const v = lay.visible;
  const box = cropToEdges(draft, fw, fh);
  const oval = shown.mask === "ellipse" || shown.mask === "circle";
  const angle = (lay.rotation * Math.PI) / 180;

  const drag = (e: React.PointerEvent, handle: MaskHandle): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const start = cropToEdges(draft, fw, fh);
    const px = e.clientX;
    const py = e.clientY;
    let last = draft;
    setDragging(true);
    const move = (ev: PointerEvent): void => {
      // Into the picture's own directions when it is turned.
      const sx = ev.clientX - px;
      const sy = ev.clientY - py;
      const dx = sx * Math.cos(angle) + sy * Math.sin(angle);
      const dy = -sx * Math.sin(angle) + sy * Math.cos(angle);
      const lock = ev.shiftKey || shown.mask === "circle";
      last = edgesToCrop(dragMask(start, handle, dx, dy, fw, fh, lock), fw, fh);
      setDraft(last);
      liveEdit.show([clip.id], { crop: last });
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      liveEdit.clear();
      setDragging(false);
      const was = clip.transform?.crop ?? NO_CROP;
      const same = (["left", "top", "right", "bottom"] as const).every(
        (k) => Math.abs(last[k] - was[k]) < 1e-4,
      );
      // A click without moving is no edit (and no step to undo).
      if (same) return;
      const none = (["left", "top", "right", "bottom"] as const).every((k) => last[k] < 1e-4);
      useProject.getState().commit((p) => ({
        ...p,
        clips: p.clips.map((c) => {
          if (c.id !== clip.id) return c;
          const { crop: _old, ...rest } = c.transform ?? { ...transform };
          return { ...c, transform: none ? rest : { ...rest, crop: last } };
        }),
      }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Everything is drawn around the visible part, turned with it like the clip on the stage.
  const origin = { x: (lay.full.x - v.x) * scale, y: (lay.full.y - v.y) * scale };
  return (
    <div
      className="mask-target"
      style={{
        left: v.x * scale,
        top: v.y * scale,
        width: v.w * scale,
        height: v.h * scale,
        ...(lay.rotation ? { transform: `rotate(${lay.rotation}deg)` } : {}),
      }}
    >
      <span
        className="mask-target-picture"
        style={{ left: origin.x, top: origin.y, width: fw, height: fh }}
      />
      <div
        className="mask-target-box"
        style={{
          left: origin.x + box.x0,
          top: origin.y + box.y0,
          width: box.x1 - box.x0,
          height: box.y1 - box.y0,
        }}
        role="application"
        aria-label="Máscara do clipe: arraste para mover, puxe os lados ou os cantos para mudar o tamanho"
        title="Arraste para mover a máscara; os lados e os cantos mudam o tamanho (Shift mantém a proporção). Enter ou Esc termina."
        onPointerDown={(e) => drag(e, "move")}
      >
        {oval && <span className="mask-target-round" />}
        {MASK_HANDLES.map((h) => (
          <span
            key={h}
            className={`mask-handle mask-handle-${h}`}
            onPointerDown={(e) => drag(e, h)}
          />
        ))}
      </div>
    </div>
  );
}
