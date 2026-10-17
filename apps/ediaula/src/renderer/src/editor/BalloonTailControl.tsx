import { balloonPath, defaultOutline, freeBalloonTip } from "@shared/annotation";
import { animAt, clipLayout } from "@shared/compose";
import { transformAt } from "@shared/keyframes";
import { clipEnd } from "@shared/timeline";
import type { Asset, Clip, Project } from "@shared/types";
import { zoomAffine, zoomsOver } from "@shared/zoomLayer";
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { updateAnnotation } from "@/lib/annotations";
import { mediaUrl } from "@/lib/media";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";

export function BalloonTailControl({
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
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      cleanup.current?.();
      onEditing(null);
    },
    [onEditing],
  );
  const a = clip.annotation!;
  const g = a.balloonGeometry;
  const trackIndex = project.tracks.findIndex((t) => t.id === clip.trackId);
  const lay = clipLayout({ transform: transformAt(clip, time) }, asset, project.settings);
  const w = project.settings.width * scale;
  const h = project.settings.height * scale;
  const motion = animAt(clip, time);
  const z = zoomAffine(zoomsOver(project, trackIndex, time), w, h);
  const density = (lay.full.w / asset.width) * scale * motion.scale * z.s;
  const pivotX = (lay.visible.x + lay.visible.w / 2) * scale;
  const pivotY = (lay.visible.y + lay.visible.h / 2) * scale;
  const x = z.s * (pivotX + motion.dx * w + (lay.full.x * scale - pivotX) * motion.scale) + z.tx;
  const y = z.s * (pivotY + motion.dy * h + (lay.full.y * scale - pivotY) * motion.scale) + z.ty;
  if (
    time < clip.start ||
    time >= clipEnd(clip) ||
    project.tracks[trackIndex]?.hidden ||
    project.tracks[trackIndex]?.locked ||
    motion.opacity < 0.1 ||
    density < 0.001
  )
    return null;
  const refresh = async (): Promise<void> => {
    setSaving(true);
    try {
      await updateAnnotation(clip.id, {});
    } catch (e) {
      useApp.getState().toast(String(e), "error");
    } finally {
      setSaving(false);
    }
  };
  if (!g)
    return (
      <button
        type="button"
        className="balloon-tail-enable btn btn-secondary btn-sm"
        style={{ left: x, top: y }}
        disabled={saving}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => void refresh()}
      >
        Editar ponta do balão
      </button>
    );
  if (a.tail === "none") return null;
  const tip = draft ?? { x: (g.tipX - g.x) / g.w, y: (g.tipY - g.y) / g.h };
  const body = { x: x + g.x * density, y: y + g.y * density, w: g.w * density, h: g.h * density };
  const tx = body.x + tip.x * body.w;
  const ty = body.y + tip.y * body.h;
  const unit = (project.settings.height / 1080) * 2 * density;
  const begin = (e: PointerEvent<HTMLButtonElement>): void => {
    if (e.button !== 0 || saving) return;
    e.preventDefault();
    e.stopPropagation();
    playback.pause();
    const stage = e.currentTarget.parentElement!.getBoundingClientRect();
    const pointer = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    let next = tip;
    let moved = false;
    const move = (ev: globalThis.PointerEvent): void => {
      if (ev.pointerId !== pointer) return;
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
      moved = true;
      next = freeBalloonTip({
        x: (Math.max(0, Math.min(w, ev.clientX - stage.left)) - body.x) / body.w,
        y: (Math.max(0, Math.min(h, ev.clientY - stage.top)) - body.y) / body.h,
      }).point;
      setDraft(next);
      onEditing(clip.id);
    };
    const finish = async (apply: boolean): Promise<void> => {
      cleanup.current?.();
      if (apply && moved) {
        setSaving(true);
        try {
          await updateAnnotation(clip.id, { tailPoint: next, tail: freeBalloonTip(next).tail });
        } catch (error) {
          useApp.getState().toast(String(error), "error");
        } finally {
          setSaving(false);
        }
      }
      setDraft(null);
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
  const outline = a.outline ?? defaultOutline(a);
  const clipId = `balloon-body-${clip.id}`;
  return (
    <>
      {draft && (
        <svg className="balloon-tail-preview" width={w} height={h}>
          <title>Prévia do apontador do balão</title>
          <defs>
            <clipPath id={clipId}>
              <rect
                x={body.x + 1}
                y={body.y + 1}
                width={Math.max(0, body.w - 2)}
                height={Math.max(0, body.h - 2)}
                rx={16 * unit}
              />
            </clipPath>
          </defs>
          <path
            d={balloonPath(
              body.x,
              body.y,
              body.w,
              body.h,
              16 * unit,
              26 * unit,
              freeBalloonTip(draft).tail,
              { x: tx, y: ty },
            )}
            fill={a.fill ?? "#FFFFFF"}
            stroke={outline.color}
            strokeWidth={outline.width * unit}
            strokeLinejoin="round"
          />
          <image
            href={mediaUrl(asset.path)}
            x={x}
            y={y}
            width={asset.width * density}
            height={asset.height * density}
            clipPath={`url(#${clipId})`}
          />
        </svg>
      )}
      <button
        type="button"
        className="balloon-tail-handle"
        style={{ left: tx, top: ty }}
        disabled={saving}
        title="Arraste a ponta para mudar a direção e o comprimento. Esc cancela."
        aria-label="Mover ponta do balão"
        onPointerDown={begin}
        onDoubleClick={(e) => e.stopPropagation()}
      />
    </>
  );
}
