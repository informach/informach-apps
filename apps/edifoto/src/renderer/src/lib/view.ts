import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";

/** Pan/zoom of the canvas. Pan is the screen position (CSS px) of the image's top-left corner. */

const size = { w: 1, h: 1 };
const ZOOMS = [
  0.02, 0.03, 0.05, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16,
  24, 32,
];

export function setViewportSize(w: number, h: number): void {
  size.w = w;
  size.h = h;
}

export function fitView(): void {
  const doc = useDoc.getState().doc;
  if (!doc) return;
  const pad = 48;
  const zoom = Math.min(1, (size.w - pad * 2) / doc.width, (size.h - pad * 2 - 60) / doc.height);
  const z = Math.max(0.01, zoom);
  useUi.setState({
    fitMode: true,
    view: {
      zoom: z,
      panX: (size.w - doc.width * z) / 2,
      panY: (size.h - 60 - doc.height * z) / 2 + 10,
    },
  });
}

/** Zooms keeping the point (sx, sy) on screen fixed (defaults to the center). */
export function zoomTo(zoom: number, sx = size.w / 2, sy = size.h / 2): void {
  const v = useUi.getState().view;
  const z = Math.min(32, Math.max(0.01, zoom));
  const dx = (sx - v.panX) / v.zoom;
  const dy = (sy - v.panY) / v.zoom;
  useUi.setState({ fitMode: false, view: { zoom: z, panX: sx - dx * z, panY: sy - dy * z } });
}

export function zoomStep(dir: 1 | -1, sx?: number, sy?: number): void {
  const z = useUi.getState().view.zoom;
  const next =
    dir > 0
      ? (ZOOMS.find((v) => v > z * 1.001) ?? 32)
      : ([...ZOOMS].reverse().find((v) => v < z * 0.999) ?? 0.01);
  zoomTo(next, sx, sy);
}

export function panBy(dx: number, dy: number): void {
  const v = useUi.getState().view;
  useUi.setState({ fitMode: false, view: { ...v, panX: v.panX + dx, panY: v.panY + dy } });
}

/** Screen (CSS px relative to the viewport) → document pixels. */
export function toDoc(sx: number, sy: number): [number, number] {
  const v = useUi.getState().view;
  return [(sx - v.panX) / v.zoom, (sy - v.panY) / v.zoom];
}

export function toScreen(x: number, y: number): [number, number] {
  const v = useUi.getState().view;
  return [x * v.zoom + v.panX, y * v.zoom + v.panY];
}
