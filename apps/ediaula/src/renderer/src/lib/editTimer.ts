import { useEffect } from "react";
import { useProject } from "@/state/project";

const TICK_S = 15;
const IDLE_AFTER_MS = 60_000;

/** Measures active editing time per project, to know how long a lesson really takes. */
export function useEditTimer(): void {
  useEffect(() => {
    let last = Date.now();
    const touch = (): void => {
      last = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel"] as const;
    events.forEach((e) => {
      window.addEventListener(e, touch, { passive: true });
    });
    const timer = setInterval(() => {
      if (!document.hasFocus() || Date.now() - last > IDLE_AFTER_MS) return;
      useProject
        .getState()
        .patch((p) => ({ ...p, stats: { editSeconds: (p.stats?.editSeconds ?? 0) + TICK_S } }));
    }, TICK_S * 1000);
    return () => {
      clearInterval(timer);
      events.forEach((e) => {
        window.removeEventListener(e, touch);
      });
    };
  }, []);
}

export function formatEditTime(seconds = 0): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
