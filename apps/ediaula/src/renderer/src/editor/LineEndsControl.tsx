import { clipLayout, rotationOf } from "@shared/compose";
import { transformAt } from "@shared/keyframes";
import { lineEnds, lineThrough, type Point, snapEnd } from "@shared/lineGeometry";
import type { Asset, Clip, Project } from "@shared/types";
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { OVERSAMPLE, renderAnnotation, updateAnnotation } from "@/lib/annotations";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { annotationOnStage } from "./annotationOnStage";

type End = "start" | "end";

/**
 * The two ends of a selected line or arrow, dragged on the stage as in a drawing program: the
 * end that is pulled goes where the pointer is and the other one stays put (its angle and length
 * change, and its center moves halfway). While pulling, the line is drawn at its new place on top
 * (the clip's own picture is hidden); letting go redraws it in one undo step. Shift keeps it
 * straight, diagonal or level; Esc cancels.
 */
export function LineEndsControl({
  clip,
  asset,
  project,
  scale,
  onEditing,
}: {
  clip: Clip;
  asset: Asset;
  project: Project;
  scale: number;
  onEditing: (id: string | null) => void;
}): ReactNode {
  const time = usePlayback((s) => s.time);
  const [draft, setDraft] = useState<{ start: Point; end: Point } | null>(null);
  const [picture, setPicture] = useState<{ url: string; w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      cleanup.current?.();
      onEditing(null);
    },
    [onEditing],
  );
  useEffect(() => () => (picture ? URL.revokeObjectURL(picture.url) : undefined), [picture]);
  const a = clip.annotation;
  if (!a) return null;
  const on = annotationOnStage(clip, asset, project, scale, time);
  if (!on.editable) return null;
  const shown = transformAt(clip, time);
  const lay = clipLayout({ transform: shown }, asset, project.settings);
  const turn = { rotation: rotationOf(shown), flipH: shown.flipH, flipV: shown.flipV };
  // Screen pixels per 1080p pixel of the line, and per pixel of the frame.
  const unit = (project.settings.height / 1080) * OVERSAMPLE * on.density;
  const perFrame = on.density / (lay.full.w / asset.width);
  const center = {
    x: on.x + (asset.width * on.density) / 2,
    y: on.y + (asset.height * on.density) / 2,
  };
  const rest = lineEnds(center, a.angle ?? 0, a.length ?? 200, unit, turn);
  const ends = draft ?? rest;

  const begin =
    (which: End) =>
    (e: PointerEvent<HTMLButtonElement>): void => {
      // The stage would deselect the line, or the frame around it would move it.
      e.stopPropagation();
      if (e.button !== 0 || saving) return;
      e.preventDefault();
      playback.pause();
      const stage = e.currentTarget.parentElement!.getBoundingClientRect();
      const pointer = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      const fixed = which === "start" ? rest.end : rest.start;
      let next = rest;
      let moved = false;
      // The line at its new place: one drawing at a time, the latest wins.
      let wanted: { angle: number; length: number } | null = null;
      let drawing = false;
      let over = false;
      const draw = async (): Promise<void> => {
        if (drawing) return;
        drawing = true;
        try {
          while (wanted && !over) {
            const want = wanted;
            wanted = null;
            const r = await renderAnnotation(
              { ...a, ...want },
              project.settings.height,
              project.settings.width,
            );
            if (over) break;
            const url = URL.createObjectURL(
              new Blob([new Uint8Array(r.bytes)], { type: "image/png" }),
            );
            setPicture({ url, w: r.width, h: r.height });
          }
        } finally {
          drawing = false;
        }
      };
      const move = (ev: globalThis.PointerEvent): void => {
        if (ev.pointerId !== pointer) return;
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
        moved = true;
        const raw = { x: ev.clientX - stage.left, y: ev.clientY - stage.top };
        const pulled = ev.shiftKey ? snapEnd(fixed, raw) : raw;
        next = which === "start" ? { start: pulled, end: fixed } : { start: fixed, end: pulled };
        setDraft(next);
        onEditing(clip.id);
        const line = lineThrough(next.start, next.end, center, unit, turn);
        if (line.length * unit >= 2) {
          wanted = { angle: line.angle, length: line.length };
          void draw();
        }
      };
      const finish = async (apply: boolean): Promise<void> => {
        cleanup.current?.();
        const line = lineThrough(next.start, next.end, center, unit, turn);
        if (apply && moved && line.length * unit >= 2) {
          setSaving(true);
          try {
            await updateAnnotation(
              clip.id,
              { angle: Math.round(line.angle * 10) / 10, length: Math.round(line.length) },
              undefined,
              {
                dx: line.shift.x / (project.settings.width * perFrame),
                dy: line.shift.y / (project.settings.height * perFrame),
              },
            );
          } catch (error) {
            useApp.getState().toast(String(error), "error");
          } finally {
            setSaving(false);
          }
        }
        over = true;
        setDraft(null);
        setPicture(null);
        onEditing(null);
      };
      const up = (ev: globalThis.PointerEvent): void => {
        if (ev.pointerId === pointer) void finish(true);
      };
      const cancel = (): void => {
        void finish(false);
      };
      const key = (ev: KeyboardEvent): void => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          cancel();
        }
      };
      cleanup.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("blur", cancel);
        window.removeEventListener("keydown", key, true);
        cleanup.current = null;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("blur", cancel);
      window.addEventListener("keydown", key, true);
    };

  const middle = { x: (ends.start.x + ends.end.x) / 2, y: (ends.start.y + ends.end.y) / 2 };
  const rotate = turn.rotation ? `rotate(${turn.rotation}deg)` : undefined;
  const mirror = `${turn.flipH ? "scaleX(-1)" : ""}${turn.flipV ? " scaleY(-1)" : ""}`.trim();
  return (
    <>
      {draft && picture && (
        <img
          className="shape-size-preview"
          src={picture.url}
          alt=""
          style={{
            left: middle.x - (picture.w * on.density) / 2,
            top: middle.y - (picture.h * on.density) / 2,
            width: picture.w * on.density,
            height: picture.h * on.density,
            transform: [rotate, mirror].filter(Boolean).join(" ") || undefined,
          }}
        />
      )}
      {draft && (
        <svg className="line-ends-guide" aria-hidden="true">
          <line x1={ends.start.x} y1={ends.start.y} x2={ends.end.x} y2={ends.end.y} />
        </svg>
      )}
      {(["start", "end"] as const).map((which) => (
        <button
          key={which}
          type="button"
          className={`line-end-handle is-${which}`}
          style={{ left: ends[which].x, top: ends[which].y }}
          aria-disabled={saving}
          aria-label={which === "start" ? "Mover o início da linha" : "Mover o fim da linha"}
          title={`Arraste ${which === "start" ? "o início" : "o fim"}: o outro lado fica onde está. Shift deixa reta ou a 45°. Esc cancela.`}
          onPointerDown={begin(which)}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      ))}
    </>
  );
}
