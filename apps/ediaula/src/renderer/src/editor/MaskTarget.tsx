import {
  type Crop,
  clipLayout,
  mirrorCrop,
  NO_CROP,
  type Polygon,
  type PolygonPoint,
  polygonMask,
  polygonOnPicture,
  polygonPath,
  type Transform,
  usablePolygon,
} from "@shared/compose";
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
import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import { useApp } from "@/state/app";
import { liveEdit } from "@/state/liveEdit";
import { usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { PolygonPen } from "./PolygonPen";

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * While "Ajustar a máscara na prévia" is on: the whole picture's outline and the mask over it, on the
 * preview. Drag inside to move the mask (the picture stays still), drag a side or a corner to
 * change its size; Shift keeps its proportion, a circle always does. A polygon shows its corners,
 * each one dragged on its own. Enter or Esc ends. One undo step per gesture.
 *
 * With the pen (maskPen) the whole picture shows and each click places a corner of a polygon
 * (editor/PolygonPen.tsx); closing it makes the mask, Esc leaves the mask as it was.
 *
 * Everything here is in the screen's directions: a flipped clip shows its picture mirrored, so
 * the crop (kept in the picture's directions) is mirrored to be drawn and mirrored back to be
 * saved, and the polygon is kept as the screen shows it (shared/compose.ts mirrorCrop).
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
  const pen = useApp((s) => s.maskPen);
  const committed = clip.transform?.crop ?? NO_CROP;
  const committedPolygon =
    clip.transform?.mask === "polygon" ? usablePolygon(clip.transform.polygon) : undefined;
  /** The mask being dragged, in the picture's directions (as saved). */
  const [draft, setDraft] = useState<Crop>(committed);
  const [polygon, setPolygon] = useState<Polygon | undefined>(committedPolygon);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (dragging) return;
    setDraft(committed);
    setPolygon(committedPolygon);
  }, [committed, committedPolygon, dragging]);
  // The pen draws over the whole picture: the clip shows without its mask meanwhile.
  useEffect(() => {
    if (!pen) return;
    liveEdit.show([clip.id], {
      crop: undefined,
      mask: undefined,
      polygon: undefined,
      feather: undefined,
      border: undefined,
    });
    return () => liveEdit.clear();
  }, [pen, clip.id]);
  // Enter or Esc ends the adjusting (the pen takes these keys itself while it is open).
  const onKey = useEffectEvent((e: KeyboardEvent): void => {
    if (pen || (e.key !== "Escape" && e.key !== "Enter")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    useApp.getState().set({ maskEdit: null, maskPen: false });
  });
  useEffect(() => {
    const key = (e: KeyboardEvent): void => onKey(e);
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  if (time < clip.start || time >= clipEnd(clip)) return null;

  const shown = clip.keyframes?.length ? { ...transform, ...transformAt(clip, time) } : transform;
  const flipH = !!shown.flipH;
  const flipV = !!shown.flipV;
  const crop = pen ? NO_CROP : draft;
  const lay = clipLayout({ transform: { ...shown, crop } }, asset, settings);
  const fw = lay.full.w * scale;
  const fh = lay.full.h * scale;
  const v = lay.visible;
  const vw = v.w * scale;
  const vh = v.h * scale;
  const box = cropToEdges(mirrorCrop(crop, flipH, flipV), fw, fh);
  const oval = shown.mask === "ellipse" || shown.mask === "circle";
  const angle = (lay.rotation * Math.PI) / 180;
  /** A screen movement in the picture's own directions, when it is turned. */
  const turned = (sx: number, sy: number): [number, number] => [
    sx * Math.cos(angle) + sy * Math.sin(angle),
    -sx * Math.sin(angle) + sy * Math.cos(angle),
  ];

  const save = (next: Crop, nextPolygon?: Polygon): void => {
    const none = (["left", "top", "right", "bottom"] as const).every((k) => next[k] < 1e-4);
    useProject.getState().commit((p) => ({
      ...p,
      clips: p.clips.map((c) => {
        if (c.id !== clip.id) return c;
        const { crop: _old, ...rest } = c.transform ?? { ...transform };
        const kept = nextPolygon
          ? { ...rest, mask: "polygon" as const, polygon: nextPolygon }
          : rest;
        return { ...c, transform: none && !nextPolygon ? kept : { ...kept, crop: next } };
      }),
    }));
  };

  const drag = (e: React.PointerEvent, handle: MaskHandle): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const start = cropToEdges(mirrorCrop(draft, flipH, flipV), fw, fh);
    const px = e.clientX;
    const py = e.clientY;
    let last = draft;
    setDragging(true);
    const move = (ev: PointerEvent): void => {
      const [dx, dy] = turned(ev.clientX - px, ev.clientY - py);
      const lock = ev.shiftKey || shown.mask === "circle";
      const onScreen = edgesToCrop(dragMask(start, handle, dx, dy, fw, fh, lock), fw, fh);
      last = mirrorCrop(onScreen, flipH, flipV);
      setDraft(last);
      liveEdit.show([clip.id], { crop: last });
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      liveEdit.clear();
      setDragging(false);
      const was = clip.transform?.crop ?? NO_CROP;
      const same = (["left", "top", "right", "bottom"] as const).every(
        (k) => Math.abs(last[k] - was[k]) < 1e-4,
      );
      // A click without moving is no edit (and no step to undo).
      if (!same) save(last);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  /** Drags one corner of the polygon; the mask's rectangle follows the polygon. */
  const dragCorner = (e: React.PointerEvent, shape: number, index: number): void => {
    if (e.button !== 0 || !polygon) return;
    e.stopPropagation();
    e.preventDefault();
    const start = polygonOnPicture(polygon, mirrorCrop(draft, flipH, flipV));
    const px = e.clientX;
    const py = e.clientY;
    let last: { crop: Crop; polygon: Polygon } | null = null;
    setDragging(true);
    const move = (ev: PointerEvent): void => {
      const [dx, dy] = turned(ev.clientX - px, ev.clientY - py);
      const points = start.map((outline, s) =>
        s !== shape
          ? outline
          : outline.map(
              (p, i): PolygonPoint =>
                i === index ? [clamp01(p[0] + dx / fw), clamp01(p[1] + dy / fh)] : p,
            ),
      );
      const made = polygonMask(points);
      const next = { crop: mirrorCrop(made.crop, flipH, flipV), polygon: made.polygon };
      last = next;
      setDraft(next.crop);
      setPolygon(next.polygon);
      liveEdit.show([clip.id], { crop: next.crop, polygon: next.polygon });
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      liveEdit.clear();
      setDragging(false);
      if (last) save(last.crop, last.polygon);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // Everything is drawn around the visible part, turned with it like the clip on the stage; a
  // flipped picture's whole outline lies mirrored around the visible part's center.
  const ox = (lay.full.x - v.x) * scale;
  const oy = (lay.full.y - v.y) * scale;
  const origin = { x: flipH ? vw - ox - fw : ox, y: flipV ? vh - oy - fh : oy };
  const shaped = shown.mask === "polygon" && !!polygon;
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  return (
    <div
      className="mask-target"
      style={{
        left: v.x * scale,
        top: v.y * scale,
        width: vw,
        height: vh,
        ...(lay.rotation ? { transform: `rotate(${lay.rotation}deg)` } : {}),
      }}
    >
      <span
        className="mask-target-picture"
        style={{ left: origin.x, top: origin.y, width: fw, height: fh }}
      />
      {pen ? (
        <PolygonPen
          width={fw}
          height={fh}
          angle={lay.rotation}
          shade
          style={{ position: "absolute", left: origin.x, top: origin.y }}
          label="Caneta da máscara: arraste para um retângulo ou clique para cada canto"
          // The polygon already there, on the whole picture as the screen shows it.
          initial={
            committedPolygon && polygonOnPicture(committedPolygon, mirrorCrop(draft, flipH, flipV))
          }
          onFinish={(drawn) => {
            const made = polygonMask(drawn);
            save(mirrorCrop(made.crop, flipH, flipV), made.polygon);
            useApp.getState().set({ maskPen: false });
          }}
          onCancel={() => useApp.getState().set({ maskPen: false })}
        />
      ) : (
        <div
          className="mask-target-box"
          style={{ left: origin.x + box.x0, top: origin.y + box.y0, width: bw, height: bh }}
          role="application"
          aria-label="Máscara do clipe: arraste para mover, puxe os lados ou os cantos para mudar o tamanho"
          title="Arraste para mover a máscara; os lados e os cantos mudam o tamanho (Shift mantém a proporção). Enter ou Esc termina."
          onPointerDown={(e) => drag(e, "move")}
        >
          {oval && <span className="mask-target-round" />}
          {/* A polygon touches every side of its box: the handles in the middle of the sides
              would sit on its corners, so it keeps only the box's own corners, under its own. */}
          {MASK_HANDLES.filter((h) => !shaped || h.length === 2).map((h) => (
            <span
              key={h}
              className={`mask-handle mask-handle-${h}`}
              onPointerDown={(e) => drag(e, h)}
            />
          ))}
          {shaped && polygon && (
            <svg className="mask-target-shape" width={bw} height={bh} aria-hidden="true">
              <path d={polygonPath(polygon, bw, bh)} />
              {polygon.map((outline, s) =>
                outline.map(([x, y], i) => (
                  <circle
                    // biome-ignore lint/suspicious/noArrayIndexKey: a corner is its place in the polygon
                    key={`${s}:${i}`}
                    cx={x * bw}
                    cy={y * bh}
                    r={6}
                    onPointerDown={(e) => dragCorner(e, s, i)}
                  >
                    <title>Arraste este canto do polígono</title>
                  </circle>
                )),
              )}
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
