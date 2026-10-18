/** A fixed coordinate range throughout capture avoids moving the axis under a
 * dragged handle. Cancel restores only the dialog draft, not document state. */
export function bindCurveHandles(
  svg: SVGSVGElement,
  range: { min: number; max: number },
  read: () => number[],
  write: (points: number[]) => void,
  surface: SVGSVGElement | HTMLElement = svg,
) {
  let cancelGesture: (() => void) | undefined;
  surface.onpointerdown = (event) => {
    const target =
      event.target instanceof Element ? event.target.closest("[data-curve-handle]") : null;
    if (!target || event.button !== 0) return;
    const index = Number(target.getAttribute("data-curve-handle"));
    if (index !== 0 && index !== 1) return;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    event.preventDefault();
    event.stopPropagation();
    if (target instanceof HTMLElement) target.focus();
    const original = read(),
      inverse = matrix.inverse();
    let finished = false;
    const cleanup = () => {
      cancelGesture = undefined;
      surface.onpointermove =
        surface.onpointerup =
        surface.onpointercancel =
        surface.onlostpointercapture =
          null;
      document.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      if (surface.hasPointerCapture(event.pointerId))
        surface.releasePointerCapture(event.pointerId);
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      cleanup();
      write(original);
    };
    const keyboard = (key: KeyboardEvent) => {
      if (key.key === "Escape") {
        key.preventDefault();
        key.stopImmediatePropagation();
        cancel();
      }
    };
    cancelGesture = cancel;
    document.addEventListener("keydown", keyboard, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    surface.setPointerCapture(event.pointerId);
    surface.onpointermove = (move) => {
      const point = new DOMPoint(move.clientX, move.clientY).matrixTransform(inverse);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      const points = read();
      points[index * 2] = Math.max(0, Math.min(1, (point.x - 12) / 236));
      points[index * 2 + 1] = Math.max(
        -10,
        Math.min(10, range.min + ((118 - point.y) / 106) * (range.max - range.min)),
      );
      write(points);
    };
    surface.onpointerup = (up) => {
      if (finished) return;
      surface.onpointermove?.(up);
      finished = true;
      cleanup();
    };
    surface.onpointercancel = surface.onlostpointercapture = cancel;
  };
  return () => {
    cancelGesture?.();
    surface.onpointerdown = null;
  };
}
