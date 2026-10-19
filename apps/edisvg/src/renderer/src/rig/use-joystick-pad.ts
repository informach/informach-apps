import { type RigJoystick, resolveJoystickAxes } from "@informach/edi-motion/rig";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface JoystickPoint {
  x: number;
  y: number;
}
export type JoystickPreview = (value: (JoystickPoint & { id: string }) | null) => void;
type Gesture = { surface: string; element: HTMLButtonElement } & (
  | { kind: "pointer"; id: number; element: HTMLButtonElement; point: JoystickPoint }
  | { kind: "keyboard"; point: JoystickPoint }
);

function surfaceKey(element: HTMLButtonElement) {
  const rect = element.getBoundingClientRect();
  return JSON.stringify([
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    window.innerWidth,
    window.innerHeight,
  ]);
}

function fieldPoint(fields: JoystickPoint | { x: string; y: string }): JoystickPoint | null {
  if (String(fields.x).trim() === "" || String(fields.y).trim() === "") return null;
  const x = Number(fields.x),
    y = Number(fields.y);
  return [x, y].every((value) => Number.isFinite(value) && Math.abs(value) <= 1) ? { x, y } : null;
}
function pointerPoint(event: PointerEvent<HTMLButtonElement>, limit: RigJoystick["limit"]) {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) throw new Error("Pad sem superfície de interação.");
  const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2.4,
    y = ((event.clientY - rect.top) / rect.height - 0.5) * 2.4,
    divisor = limit === "circle" ? Math.max(1, Math.hypot(x, y)) : 1;
  return resolveJoystickAxes(
    Math.max(-1, Math.min(1, x / divisor)),
    Math.max(-1, Math.min(1, y / divisor)),
    limit,
  );
}

/** The gesture owns only a local draft/capture. The document receives one final
 * transaction; external lifecycle loss cancels, never commits a partial pose. */
export function useJoystickPad({
  value,
  preview,
  commit,
  report,
}: {
  value: RigJoystick;
  preview: JoystickPreview;
  commit(point: JoystickPoint, restore: "pad" | "x" | "y"): void;
  report(error: unknown): void;
}) {
  const [fields, setFields] = useState<{ x: string; y: string } | null>(null),
    gesture = useRef<Gesture | null>(null),
    point = fieldPoint(fields ?? value),
    effective = point ? resolveJoystickAxes(point.x, point.y, value.limit) : null,
    dirty = fields !== null;
  const release = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.kind === "pointer" && active.element.hasPointerCapture(active.id))
      active.element.releasePointerCapture(active.id);
  }, []);
  const cancel = useCallback(() => {
    release();
    preview(null);
    setFields(null);
  }, [preview, release]);
  function show(next: JoystickPoint) {
    try {
      preview({ id: value.id, ...next });
      setFields({ x: String(next.x), y: String(next.y) });
      return true;
    } catch (error) {
      cancel();
      report(error);
      return false;
    }
  }
  function finish(next: JoystickPoint, restore: "pad" | "x" | "y") {
    release();
    preview(null);
    setFields(null);
    if (next.x === value.x && next.y === value.y) return;
    try {
      commit(next, restore);
    } catch (error) {
      report(error);
    }
  }
  useEffect(() => {
    function abort() {
      cancel();
    }
    function hidden() {
      if (document.hidden) abort();
    }
    window.addEventListener("blur", abort);
    window.addEventListener("resize", abort);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      release();
      preview(null);
      window.removeEventListener("blur", abort);
      window.removeEventListener("resize", abort);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [cancel, preview, release]);
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (gesture.current?.kind === "pointer") return;
    if (gesture.current && gesture.current.surface !== surfaceKey(event.currentTarget)) {
      cancel();
      return;
    }
    const current = gesture.current?.point ?? effective;
    if (!current) return;
    const step = event.shiftKey ? 0.01 : 0.1,
      next =
        event.key === "Home"
          ? { x: 0, y: 0 }
          : resolveJoystickAxes(
              Math.max(
                -1,
                Math.min(
                  1,
                  current.x +
                    (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
                ),
              ),
              Math.max(
                -1,
                Math.min(
                  1,
                  current.y +
                    (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
                ),
              ),
              value.limit,
            );
    if (show(next))
      gesture.current = {
        kind: "keyboard",
        point: next,
        element: event.currentTarget,
        surface: surfaceKey(event.currentTarget),
      };
  }
  return {
    fields: fields ?? { x: String(value.x), y: String(value.y) },
    point,
    effective,
    dirty,
    cancel,
    edit(axis: "x" | "y", text: string) {
      release();
      const next = { ...(fields ?? { x: String(value.x), y: String(value.y) }), [axis]: text },
        parsed = fieldPoint(next);
      try {
        preview(parsed ? { id: value.id, ...parsed } : null);
        setFields(next);
      } catch (error) {
        cancel();
        report(error);
      }
    },
    apply(restore: "x" | "y" = "x") {
      if (point) finish(point, restore);
    },
    pad: {
      onKeyDown: keyDown,
      onKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key))
          return;
        event.preventDefault();
        event.stopPropagation();
        const active = gesture.current;
        if (active?.kind === "keyboard") {
          if (active.surface !== surfaceKey(active.element)) cancel();
          else finish(active.point, "pad");
        }
      },
      onBlur() {
        if (gesture.current) cancel();
      },
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0 || !event.isPrimary || gesture.current) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus();
        try {
          const next = pointerPoint(event, value.limit);
          if (!show(next)) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = {
            kind: "pointer",
            id: event.pointerId,
            element: event.currentTarget,
            point: next,
            surface: surfaceKey(event.currentTarget),
          };
        } catch (error) {
          cancel();
          report(error);
        }
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const active = gesture.current;
        if (active?.kind !== "pointer" || active.id !== event.pointerId) return;
        if (active.surface !== surfaceKey(active.element)) {
          cancel();
          return;
        }
        try {
          const next = pointerPoint(event, value.limit);
          if (show(next)) active.point = next;
        } catch (error) {
          cancel();
          report(error);
        }
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        const active = gesture.current;
        if (active?.kind === "pointer" && active.id === event.pointerId) {
          if (active.surface !== surfaceKey(active.element)) cancel();
          else {
            try {
              finish(pointerPoint(event, value.limit), "pad");
            } catch (error) {
              cancel();
              report(error);
            }
          }
        }
      },
      onPointerCancel() {
        cancel();
      },
      onLostPointerCapture() {
        if (gesture.current?.kind === "pointer") cancel();
      },
      onClick(event: MouseEvent<HTMLButtonElement>) {
        event.preventDefault();
      },
    },
  };
}
