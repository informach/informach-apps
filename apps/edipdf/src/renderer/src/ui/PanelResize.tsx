import { useEffect, useRef } from "react";
import { savePreferences, usePreferences } from "../state/preferences";
import { toast } from "../state/store";

export function PanelResize({ side }: { side: "left" | "right" }): React.ReactElement {
  const key = side === "left" ? "sidebarWidth" : "panelWidth";
  const value = usePreferences((state) => state.value[key]);
  const min = side === "left" ? 160 : 220,
    max = side === "left" ? 400 : 480;
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const set = (width: number) =>
    usePreferences.setState((state) => ({
      value: { ...state.value, [key]: Math.round(Math.max(min, Math.min(max, width))) },
    }));
  const persist = () => {
    void savePreferences(usePreferences.getState().value).catch((failure) =>
      toast(
        failure instanceof Error ? failure.message : "Não foi possível salvar a largura do painel.",
        { tone: "error" },
      ),
    );
  };
  return (
    <hr
      aria-orientation="vertical"
      aria-label={
        side === "left" ? "Largura do painel de páginas" : "Largura do painel de propriedades"
      }
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      className="panel-resize"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        set(
          value +
            (event.key === "ArrowRight" ? 1 : -1) *
              (side === "left" ? 1 : -1) *
              (event.shiftKey ? 20 : 5),
        );
      }}
      onKeyUp={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") persist();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        cleanup.current?.();
        const start = event.clientX,
          width = value;
        const move = (event: PointerEvent) =>
          set(width + (event.clientX - start) * (side === "left" ? 1 : -1));
        const remove = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", cancel);
          cleanup.current = null;
        };
        const end = () => {
          remove();
          persist();
        };
        const cancel = () => {
          remove();
          set(width);
        };
        cleanup.current = remove;
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end, { once: true });
        window.addEventListener("pointercancel", cancel, { once: true });
      }}
    />
  );
}
