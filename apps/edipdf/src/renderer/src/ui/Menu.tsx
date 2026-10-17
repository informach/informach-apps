import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";

export interface MenuItem {
  label?: string;
  icon?: React.ReactNode;
  hint?: string;
  run?: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}

const useMenu = create<{ x: number; y: number; items: MenuItem[] } | { items: null }>(() => ({
  items: null,
}));

export const openMenu = (x: number, y: number, items: MenuItem[]): void => {
  useMenu.setState({ x, y, items });
};
export const closeMenu = (): void => {
  useMenu.setState({ items: null });
};

/** Opens a menu under a button. */
export const openMenuAt = (el: HTMLElement, items: MenuItem[]): void => {
  const r = el.getBoundingClientRect();
  openMenu(r.left, r.bottom + 4, items);
};

export function MenuHost(): React.ReactElement | null {
  const state = useMenu();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!state.items || !ref.current || !("x" in state)) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.min(state.x, window.innerWidth - r.width - 8),
      y: Math.min(state.y, window.innerHeight - r.height - 8),
    });
  }, [state]);
  useEffect(() => {
    if (!state.items) return;
    const close = (e: Event): void => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      closeMenu();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("resize", closeMenu);
    };
  }, [state.items]);
  if (!state.items) return null;
  return (
    <div ref={ref} className="menu" style={{ left: pos.x, top: pos.y }} role="menu">
      {withRenderKeys(state.items, (item) =>
        item.separator ? "separator" : (item.label ?? ""),
      ).map(({ key, value: it }) =>
        it.separator ? (
          <div key={key} className="menu-sep" />
        ) : (
          <button
            type="button"
            key={key}
            role="menuitem"
            className={`menu-item${it.danger ? " danger" : ""}${it.checked ? " checked" : ""}`}
            disabled={it.disabled}
            onClick={() => {
              closeMenu();
              it.run?.();
            }}
          >
            <span className="menu-icon">{it.icon}</span>
            <span className="menu-label">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
