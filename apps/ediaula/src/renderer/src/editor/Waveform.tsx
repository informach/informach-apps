import { type ReactNode, useEffect, useRef, useState } from "react";
import { loadWaveform, type Waveform as WaveData } from "@/lib/media";

interface Props {
  path: string;
  /** Source in-point and length of the clip, seconds. */
  sourceIn: number;
  duration: number;
  /** Clip speed: each timeline second covers this many source seconds. */
  speed?: number;
  zoom: number;
  /** Clip's left edge in timeline pixels, and the visible viewport in timeline pixels. */
  clipLeft: number;
  viewLeft: number;
  viewWidth: number;
  color: string;
}

/** Draws only the part of the waveform that is on screen, so hour-long clips stay cheap. */
export function Waveform({
  path,
  sourceIn,
  duration,
  speed = 1,
  zoom,
  clipLeft,
  viewLeft,
  viewWidth,
  color,
}: Props): ReactNode {
  const [data, setData] = useState<WaveData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    loadWaveform(path)
      .then((d) => alive && setData(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path]);

  const clipWidth = duration * zoom;
  const x0 = Math.max(0, Math.floor(viewLeft - clipLeft));
  const x1 = Math.min(clipWidth, Math.ceil(viewLeft + viewWidth - clipLeft));
  const width = Math.max(0, x1 - x0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const h = canvas.clientHeight;
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(h * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, h);
    ctx.fillStyle = color;
    const pps = data.peaksPerSecond;
    const peaks = data.peaks;
    const mid = h / 2;
    for (let px = 0; px < width; px += 2) {
      const s0 = sourceIn + ((x0 + px) / zoom) * speed;
      const s1 = sourceIn + ((x0 + px + 2) / zoom) * speed;
      const i0 = Math.floor(s0 * pps);
      const i1 = Math.max(i0 + 1, Math.ceil(s1 * pps));
      let peak = 0;
      for (let i = i0; i < i1 && i < peaks.length; i++) if (peaks[i] > peak) peak = peaks[i];
      const bar = Math.max(1, peak * (h - 2));
      ctx.fillRect(px, mid - bar / 2, 1.4, bar);
    }
  }, [data, width, x0, sourceIn, speed, zoom, color]);

  if (width <= 0) return null;
  return <canvas ref={canvasRef} className="waveform" style={{ left: x0, width }} />;
}
