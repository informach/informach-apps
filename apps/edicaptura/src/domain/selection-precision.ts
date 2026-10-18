import type { CaptureRect } from "./capture-geometry.ts";
import type { Precision } from "./capture-preferences.ts";
export type PixelSize = { width: number; height: number };
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
/** Pixel grid belongs to the actual image, independent of CSS zoom or monitor DPR. */
export function constrainSelection(
  rect: CaptureRect,
  size: PixelSize,
  precision: Precision,
  anchor: "width" | "height" = "width",
): CaptureRect {
  let width = clamp(Math.round(rect.width), 2, size.width),
    height = clamp(Math.round(rect.height), 2, size.height);
  if (precision.kind === "fixed") {
    if (precision.width > size.width || precision.height > size.height)
      throw new Error("Tamanho fixo não cabe nesta imagem.");
    width = precision.width;
    height = precision.height;
  } else if (precision.kind === "ratio") {
    const ratio = precision.width / precision.height;
    if (anchor === "height") width = Math.round(height * ratio);
    else height = Math.round(width / ratio);
    const fit = Math.min(1, size.width / width, size.height / height);
    width = Math.max(2, Math.round(width * fit));
    height = Math.max(2, Math.round(height * fit));
  }
  return {
    x: clamp(Math.round(rect.x), 0, size.width - width),
    y: clamp(Math.round(rect.y), 0, size.height - height),
    width,
    height,
  };
}
export function nudgeSelection(
  rect: CaptureRect,
  key: string,
  shift: boolean,
  size: PixelSize,
): CaptureRect {
  const step = shift ? 10 : 1;
  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, size.width - rect.width),
    y: clamp(rect.y + dy, 0, size.height - rect.height),
  };
}
export function pixelToGlobal(rect: CaptureRect, area: CaptureRect, size: PixelSize): CaptureRect {
  return {
    x: area.x + (rect.x * area.width) / size.width,
    y: area.y + (rect.y * area.height) / size.height,
    width: (rect.width * area.width) / size.width,
    height: (rect.height * area.height) / size.height,
  };
}
export function globalToPixel(rect: CaptureRect, area: CaptureRect, size: PixelSize): CaptureRect {
  return {
    x: Math.round(((rect.x - area.x) * size.width) / area.width),
    y: Math.round(((rect.y - area.y) * size.height) / area.height),
    width: Math.round((rect.width * size.width) / area.width),
    height: Math.round((rect.height * size.height) / area.height),
  };
}
/** Window into the original bitmap. Integer source pixels and no interpolation. */
export function magnifierSample(x: number, y: number, size: PixelSize, span = 15) {
  const width = Math.min(span, size.width),
    height = Math.min(span, size.height);
  return {
    x: clamp(Math.floor(x) - Math.floor(width / 2), 0, size.width - width),
    y: clamp(Math.floor(y) - Math.floor(height / 2), 0, size.height - height),
    width,
    height,
  };
}
