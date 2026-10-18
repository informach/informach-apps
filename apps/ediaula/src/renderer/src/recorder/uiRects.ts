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

/** Reports the element's rectangle while it is mounted and `active`. */
export function useUiRect<T extends Element>(id: string, active = true) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const measure = (): void => {
      rects.set(id, el.getBoundingClientRect());
      resendUiRects();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      rects.delete(id);
      resendUiRects();
    };
  }, [id, active]);
  return ref;
}
