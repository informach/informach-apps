import { clipLayout, rotationOf } from "@shared/compose";
import { transformAt } from "@shared/keyframes";
import { type Handle, shapeResize, shapeSize } from "@shared/shapeResize";
import type { Asset, Clip, Project } from "@shared/types";
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { OVERSAMPLE, renderAnnotation, updateAnnotation } from "@/lib/annotations";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { annotationOnStage } from "./annotationOnStage";

const HANDLES: (Handle & { id: string; label: string })[] = [
  { id: "nw", sx: -1, sy: -1, label: "canto superior esquerdo" },
  { id: "n", sx: 0, sy: -1, label: "borda de cima" },
  { id: "ne", sx: 1, sy: -1, label: "canto superior direito" },
  { id: "e", sx: 1, sy: 0, label: "borda direita" },
  { id: "se", sx: 1, sy: 1, label: "canto inferior direito" },
  { id: "s", sx: 0, sy: 1, label: "borda de baixo" },
  { id: "sw", sx: -1, sy: 1, label: "canto inferior esquerdo" },
  { id: "w", sx: -1, sy: 0, label: "borda esquerda" },
];

interface Box {
  w: number;
  h: number;
  /** Center on the stage, screen pixels. */
  cx: number;
  cy: number;
}

/**
 * Width and height of the Destaque and the shapes, pulled on the stage by the sides and corners
 * of the shape itself (shared/shapeResize.ts): the box changes, not the picture's scale, so the
 * outline keeps its thickness. While pulling, the picture is drawn at the new size on top
 * (the clip's own is hidden); letting go redraws it, the opposite side staying where it was, in
 * one undo step. Alt grows around the center, Shift on a corner keeps the proportion, Esc
 * cancels.
 */
export function ShapeSizeControl({
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
  const [draft, setDraft] = useState<Box | null>(null);
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
  const angle = rotationOf(shown);
  // Screen pixels per 1080p pixel of the box, and per pixel of the frame (the stage's scale,
  // the entrance's size and the zoom layers above).
  const unit = (project.settings.height / 1080) * OVERSAMPLE * on.density;
  const perFrame = on.density / (lay.full.w / asset.width);
  const size = shapeSize(a);
  const rest: Box = {
    ...size,
    cx: on.x + (asset.width * on.density) / 2,
    cy: on.y + (asset.height * on.density) / 2,
  };
  const box = draft ?? rest;

  const begin =
    (handle: Handle) =>
    (e: PointerEvent<HTMLButtonElement>): void => {
      // The stage would deselect the shape, or the frame around it would move it.
      e.stopPropagation();
      if (e.button !== 0 || saving) return;
      e.preventDefault();
      playback.pause();
      const pointer = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      const turn = (angle * Math.PI) / 180;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      let next = rest;
      let moved = false;
      // The picture at the new size: one drawing at a time, the latest size wins.
      let wanted: { w: number; h: number } | null = null;
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
              { ...a, boxWidth: want.w, boxHeight: want.h },
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
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const r = shapeResize(
          size,
          handle,
          { du: (dx * cos + dy * sin) / unit, dv: (dy * cos - dx * sin) / unit },
          { symmetric: ev.altKey, keepRatio: ev.shiftKey },
        );
        next = {
          w: r.w,
          h: r.h,
          cx: rest.cx + (r.shiftX * cos - r.shiftY * sin) * unit,
          cy: rest.cy + (r.shiftX * sin + r.shiftY * cos) * unit,
        };
        setDraft(next);
        onEditing(clip.id);
        if (next.w !== size.w || next.h !== size.h) {
          wanted = { w: next.w, h: next.h };
          void draw();
        }
      };
      const finish = async (apply: boolean): Promise<void> => {
        cleanup.current?.();
        const changed = apply && moved && (next.w !== size.w || next.h !== size.h);
        if (changed) {
          setSaving(true);
          try {
            const frameW = project.settings.width * perFrame;
            const frameH = project.settings.height * perFrame;
            await updateAnnotation(clip.id, { boxWidth: next.w, boxHeight: next.h }, undefined, {
              dx: (next.cx - rest.cx) / frameW,
              dy: (next.cy - rest.cy) / frameH,
            });
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

  const turn = angle ? `rotate(${angle}deg)` : undefined;
  return (
    <>
      {draft && picture && (
        <img
          className="shape-size-preview"
          src={picture.url}
          alt=""
          style={{
            left: draft.cx - (picture.w * on.density) / 2,
            top: draft.cy - (picture.h * on.density) / 2,
            width: picture.w * on.density,
            height: picture.h * on.density,
            transform: turn,
          }}
        />
      )}
      <div
        className={`shape-size ${draft ? "is-sizing" : ""}`}
        style={{
          left: box.cx - (box.w * unit) / 2,
          top: box.cy - (box.h * unit) / 2,
          width: box.w * unit,
          height: box.h * unit,
          transform: turn,
        }}
      >
        {HANDLES.map((h) => (
          <button
            key={h.id}
            type="button"
            className={`shape-size-handle is-${h.id}`}
            style={{ left: `${50 + h.sx * 50}%`, top: `${50 + h.sy * 50}%` }}
            aria-disabled={saving}
            aria-label={`Redimensionar pela ${h.label}`}
            title="Arraste para mudar a largura e a altura. Alt: a partir do centro. Shift: mantém a proporção. Esc cancela."
            onPointerDown={begin(h)}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        ))}
        {draft && (
          <span className="shape-size-label mono">
            {draft.w} × {draft.h}
          </span>
        )}
      </div>
    </>
  );
}
