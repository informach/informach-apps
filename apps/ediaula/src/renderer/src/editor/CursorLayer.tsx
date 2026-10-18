import {
  buildTrack,
  CURSOR_EFFECT_DEFAULTS,
  type CursorFx,
  clickSoundTimes,
  DEFAULT_CURSOR_FX,
} from "@shared/cursor";
import { type CursorData, normalizeCursorData } from "@shared/cursorData";
import type { Asset } from "@shared/types";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { drawCursorScene } from "@/lib/cursorDraw";
import { type CursorImages, loadCursorImages } from "@/lib/cursorImages";
import { mediaUrl } from "@/lib/media";

const cache = new Map<string, Promise<CursorData>>();
/** A recording's cursor.json, whatever its version, as version 2 (shared/cursorData.ts). */
export function loadCursorData(path: string): Promise<CursorData> {
  let p = cache.get(path);
  if (!p) {
    // A file that is gone (moved, not reconnected yet) is not requested at all: the request
    // would only fail, and the library already shows "Cursor sumiu".
    p = window.api
      .exists([path])
      .then(([there]) => {
        if (!there) throw new Error("Os dados do cursor não estão mais onde estavam.");
        return fetch(mediaUrl(path));
      })
      .then(async (r) => {
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
 * The recorded pointer, drawn over its screen recording in the preview with the same drawing as
 * the export (lib/cursorDraw.ts): the spotlight, the magnifier (from the video on screen), the
 * click rings and the pointer, as the cursor effects of each moment say. While playing, each
 * press sounds the click when the click sound is on and the pointer shows then (`playClick`
 * says where it goes: the preview's mix, with its limiter, and only when the clip's track is
 * heard, as in the export). It reads the time from the video element itself, so it stays on the
 * exact frame while playing, scrubbing or paused.
 */
export function CursorLayer({
  asset,
  getVideo,
  width,
  height,
  playClick,
}: {
  asset: Asset;
  getVideo: () => HTMLVideoElement | undefined;
  width: number;
  height: number;
  playClick: (volume: number) => void;
}): ReactNode {
  const data = useCursorData(asset.cursor);
  const fx = useMemo(() => cursorFxOf(asset), [asset]);
  const track = useMemo(
    () => (data ? buildTrack(data, fx, asset.duration) : null),
    [data, fx, asset.duration],
  );
  const [images, setImages] = useState<CursorImages | undefined>(undefined);
  useEffect(() => {
    setImages(undefined);
    if (!data || !asset.cursor) return;
    let alive = true;
    void loadCursorImages(asset.cursor, data).then(
      (loaded) => alive && setImages(loaded),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [data, asset.cursor]);
  const canvas = useRef<HTMLCanvasElement>(null);
  // The newest one, without drawing the layer again when the preview hands a new function.
  const click = useRef(playClick);
  click.current = playClick;

  useEffect(() => {
    const el = canvas.current;
    if (!el || !data || !track) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.max(1, Math.round(width * dpr));
    el.height = Math.max(1, Math.round(height * dpr));
    const ctx = el.getContext("2d")!;
    const k = (width / data.width) * dpr;
    const sounds = clickSoundTimes(data, fx);
    const volume = fx.clickVolume ?? CURSOR_EFFECT_DEFAULTS.clickVolume;
    let raf = 0;
    let last = -1;
    const frame = (): void => {
      const v = getVideo();
      const t = v ? v.currentTime : 0;
      if (t !== last) {
        // A press passed while playing (not a jump of the playhead) sounds once.
        if (v && !v.paused && last >= 0 && t > last && t - last < 0.25 && volume > 0)
          for (const at of sounds) if (at > last && at <= t) click.current(volume);
        last = t;
        ctx.clearRect(0, 0, el.width, el.height);
        drawCursorScene(ctx, {
          data,
          track,
          fx,
          t,
          k,
          images,
          ...(v && v.videoWidth > 0
            ? { source: { image: v, width: v.videoWidth, height: v.videoHeight } }
            : {}),
        });
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [data, track, width, height, fx, getVideo, images]);

  return <canvas ref={canvas} className="stage-cursor" style={{ width, height }} />;
}
