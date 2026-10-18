import type { Box } from "./model.ts";

/** The PDF widget's counterclockwise MK/R is composed with the clockwise page viewport. */
export function widgetControlGeometry(
  box: Box,
  pageRotation: number,
  widgetRotation = 0,
): {
  box: Box;
  rotation: number;
} {
  if (![pageRotation, widgetRotation].every((angle) => Number.isInteger(angle) && angle % 90 === 0))
    throw new Error("A rotação do campo precisa ser múltipla de 90 graus.");
  const rotation = (((pageRotation - widgetRotation) % 360) + 360) % 360,
    swap = rotation % 180 !== 0,
    width = swap ? box.h : box.w,
    height = swap ? box.w : box.h;
  return {
    rotation,
    box: { x: box.x + (box.w - width) / 2, y: box.y + (box.h - height) / 2, w: width, h: height },
  };
}
