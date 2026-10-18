import { useLayoutEffect, useRef } from "react";

/**
 * Where the recorder's own controls are (pill, teleprompter, alerts), sent to the main process
 * whenever one moves or changes size. The cursor helper marks the pointer over them, so clicking
 * "Pausar" does not put a click, a ripple or an automatic zoom in the video (G5).
 */

const rects = new Map<string, DOMRect>();
let scheduled = 0;

function flush(): void {
  scheduled = 0;
  const list = [...rects.values()]
    .filter((r) => r.width > 0 && r.height > 0)
    .slice(0, 32)
    .map((r) => ({ x: r.left, y: r.top, width: r.width, height: r.height }));
  void window.api.recorder
    .uiRects(list)
    .catch((error: unknown) => console.warn("[recorder] áreas dos controles:", error));
}

/** Sends the current rectangles again (a new take only knows what it is told after it starts). */
export function resendUiRects(): void {
  if (!scheduled) scheduled = requestAnimationFrame(flush);
}

const same = (a: DOMRect, b: DOMRect): boolean =>
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.top - b.top) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

/**
 * Reports the element's rectangle while it is mounted and `active`. It is looked at every frame,
 * not only when it changes size: a control that only moves (the region dragged, the toolbar that
 * follows it, a window resized) must not leave its old place marked and the new one unmarked.
 * Only a rectangle that changed goes to the main process.
 */
export function useUiRect<T extends Element>(id: string, active = true) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    let frame = 0;
    const watch = (): void => {
      const now = el.getBoundingClientRect();
      const before = rects.get(id);
      if (!before || !same(before, now)) {
        rects.set(id, now);
        resendUiRects();
      }
      frame = requestAnimationFrame(watch);
    };
    watch();
    return () => {
      cancelAnimationFrame(frame);
      rects.delete(id);
      resendUiRects();
    };
  }, [id, active]);
  return ref;
}
