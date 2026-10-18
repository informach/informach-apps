import {
  buildTrack,
  type CursorFx,
  cursorAt,
  cursorScale,
  DEFAULT_CURSOR_FX,
  ripplesAt,
} from "@shared/cursor";
import { type CursorData, normalizeCursorData } from "@shared/cursorData";
import type { Asset } from "@shared/types";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { drawPointer, drawRipples } from "@/lib/cursorDraw";
import { mediaUrl } from "@/lib/media";

const cache = new Map<string, Promise<CursorData>>();
/** A recording's cursor.json, whatever its version, as version 2 (shared/cursorData.ts). */
export function loadCursorData(path: string): Promise<CursorData> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(mediaUrl(path)).then(async (r) => {
      if (!r.ok) throw new Error("Não consegui ler os dados do cursor.");
      return normalizeCursorData(await r.json());
    });
    // A file that could not be read is read again next time (it may have been reconnected).
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

export function useCursorData(path: string | undefined): CursorData | null {
  const [data, setData] = useState<CursorData | null>(null);
  useEffect(() => {
    if (!path) return setData(null);
    let alive = true;
    // Without readable data there is no pointer to draw (the library shows the file as missing).
    void loadCursorData(path).then(
      (d) => alive && setData(d),
      () => alive && setData(null),
    );
    return () => {
      alive = false;
    };
  }, [path]);
  return data;
}

export const cursorFxOf = (a: Asset): CursorFx => ({ ...DEFAULT_CURSOR_FX, ...a.cursorFx });

/**
 * The recorded pointer, drawn over its screen recording in the preview. It reads the time from
 * the video element itself, so it stays on the exact frame while playing, scrubbing or paused.
 */
export function CursorLayer({
  asset,
  getVideo,
  width,
  height,
}: {
  asset: Asset;
  getVideo: () => HTMLVideoElement | undefined;
  width: number;
  height: number;
}): ReactNode {
  const data = useCursorData(asset.cursor);
  const fx = useMemo(() => cursorFxOf(asset), [asset]);
  const track = useMemo(
    () => (data ? buildTrack(data, fx, asset.duration) : null),
    [data, fx, asset.duration],
  );
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !data || !track) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.max(1, Math.round(width * dpr));
    el.height = Math.max(1, Math.round(height * dpr));
    const ctx = el.getContext("2d")!;
    const k = (width / data.width) * dpr;
    const unit = cursorScale(data, fx) * 1.1 * k;
    let raf = 0;
    let last = -1;
    const frame = (): void => {
      const v = getVideo();
      const t = v ? v.currentTime : 0;
      if (t !== last) {
        last = t;
        ctx.clearRect(0, 0, el.width, el.height);
        if (!fx.hidden) {
          ctx.save();
          ctx.scale(k, k);
          if (fx.clicks) drawRipples(ctx, ripplesAt(data, t, fx), 0, 0, unit / k);
          ctx.restore();
          const s = cursorAt(track, t);
          drawPointer(ctx, s, s.x * k, s.y * k, unit, fx);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [data, track, width, height, fx, getVideo]);

  return <canvas ref={canvas} className="stage-cursor" style={{ width, height }} />;
}
