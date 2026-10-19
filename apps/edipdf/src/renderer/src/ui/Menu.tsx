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
let returnFocus: HTMLElement | null = null;

export const openMenu = (x: number, y: number, items: MenuItem[]): void => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useMenu.setState({ x, y, items });
};
export const closeMenu = (): void => {
  useMenu.setState({ items: null });
  if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
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
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const close = (e: Event): void => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
      }
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
    <div
      ref={ref}
      className="menu"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      onKeyDown={(event) => {
        const buttons = Array.from(
          ref.current?.querySelectorAll<HTMLButtonElement>(
            'button[role^="menuitem"]:not(:disabled)',
          ) ?? [],
        );
        if (!buttons.length) return;
        const index = buttons.findIndex((button) => button === document.activeElement);
        let next: number | undefined;
        if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
        if (event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = buttons.length - 1;
        if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey) {
          const query = event.key.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
          for (let offset = 1; offset <= buttons.length; offset++) {
            const candidate = (index + offset) % buttons.length;
            if (
              buttons[candidate].textContent
                ?.trim()
                .normalize("NFD")
                .replace(/\p{M}/gu, "")
                .toLowerCase()
                .startsWith(query)
            ) {
              next = candidate;
              break;
            }
          }
        }
        if (next !== undefined) {
          event.preventDefault();
          event.stopPropagation();
          buttons[next].focus();
        }
      }}
    >
      {withRenderKeys(state.items, (item) =>
        item.separator ? "separator" : (item.label ?? ""),
      ).map(({ key, value: it }) =>
        it.separator ? <div key={key} className="menu-sep" /> : <MenuButton key={key} item={it} />,
      )}
    </div>
  );
}

function MenuButton({ item }: { item: MenuItem }): React.ReactElement {
  const props = {
    type: "button" as const,
    className: `menu-item${item.danger ? " danger" : ""}${item.checked ? " checked" : ""}`,
    disabled: item.disabled,
    onClick: () => {
      closeMenu();
      item.run?.();
    },
  };
  const content = (
    <>
      <span className="menu-icon" aria-hidden="true">
        {item.icon}
      </span>
      <span className="menu-label">{item.label}</span>
      {item.hint && <span className="menu-hint">{item.hint}</span>}
    </>
  );
  return item.checked === undefined ? (
    <button {...props} role="menuitem">
      {content}
    </button>
  ) : (
    <button {...props} role="menuitemcheckbox" aria-checked={item.checked}>
      {content}
    </button>
  );
}
