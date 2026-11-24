import type { EditorCommand } from "./command-palette";

/** A menu row: a command (disabled while it has a `reason`) or a separator line. */
export type MenuItem = EditorCommand | { separator: true };

export interface MenuRequest {
  /** What the menu belongs to: a top bar menu's action ("object") or "context". */
  key: string;
  label: string;
  items: MenuItem[];
  /** The top bar button it hangs from; without it the menu opens at `point`. */
  anchor?: HTMLElement;
  point?: { x: number; y: number };
  select(id: string): void;
}

const isCommand = (item: MenuItem): item is EditorCommand => !("separator" in item);
const isLastCommand = (items: MenuItem[]) => {
  const last = items.at(-1);
  return last !== undefined && isCommand(last);
};

/** Separators only between commands: none leading, trailing or doubled after filtering. */
export function tidyMenu(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items)
    if (isCommand(item)) out.push(item);
    else if (isLastCommand(out)) out.push(item);
  if (out.length && !isLastCommand(out)) out.pop();
  return out;
}

/** Where a menu of this size goes so it stays inside the window, 4px from its edges. */
export function placeMenu(
  at: { x: number; y: number },
  size: { width: number; height: number },
  view: { width: number; height: number },
) {
  const margin = 4;
  return {
    x: Math.max(margin, Math.min(at.x, view.width - size.width - margin)),
    y: Math.max(margin, Math.min(at.y, view.height - size.height - margin)),
  };
}

/** The next enabled row from `index` going `step` (wraps around); -1 when none is enabled. */
export function nextEnabled(enabled: boolean[], index: number, step: 1 | -1) {
  const count = enabled.length;
  for (let offset = 1; offset <= count; offset++) {
    const next = (((index + step * offset) % count) + count) % count;
    if (enabled[next]) return next;
  }
  return -1;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );

let current: {
  key: string;
  element: HTMLElement;
  opener: Element | null;
  dispose(): void;
} | null = null;

/** The key of the open menu, so the top bar can mark its button (aria-expanded). */
export const openMenuKey = () => current?.key ?? null;

export function closeMenu({ restoreFocus = true } = {}) {
  if (!current) return;
  const { element, opener, dispose, key } = current;
  current = null;
  dispose();
  element.remove();
  for (const button of document.querySelectorAll(`[data-menu="${key}"]`))
    button.setAttribute("aria-expanded", "false");
  if (restoreFocus && opener instanceof HTMLElement && opener.isConnected) opener.focus();
}

/**
 * A desktop menu (Arquivo, Objeto, Animação, Exibir, the right click on an object): opens under
 * its top bar button or at the pointer, runs one command and closes. It lives on `document.body`
 * because every render rebuilds the top bar. Clicking its button again, Escape, or a click
 * anywhere else closes it; with a top bar menu open, pointing at another top bar menu or pressing
 * ArrowLeft/ArrowRight moves to it.
 */
export function openMenu(request: MenuRequest) {
  const opener = request.anchor ?? current?.opener ?? document.activeElement;
  // Opened from the keyboard (its button shows focus): the first command takes focus, so the
  // arrows and Enter work at once. Opened with the mouse, nothing is highlighted until pointed.
  const byKeyboard = request.anchor?.matches(":focus-visible") ?? false;
  if (current?.key === request.key && request.anchor) {
    closeMenu();
    return;
  }
  closeMenu({ restoreFocus: false });
  const items = tidyMenu(request.items);
  const menu = document.createElement("div");
  menu.className = "edi-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", request.label);
  menu.setAttribute("popover", "manual");
  menu.tabIndex = -1;
  menu.innerHTML = items
    .map((item) =>
      isCommand(item)
        ? `<button type="button" role="menuitem" tabindex="-1" data-menu-item="${escapeHtml(item.id)}"${item.reason ? ` aria-disabled="true" title="${escapeHtml(item.reason)}"` : ""}><span>${escapeHtml(item.label)}</span><kbd>${escapeHtml(item.shortcut ?? "")}</kbd></button>`
        : '<hr role="separator">',
    )
    .join("");
  document.body.append(menu);
  menu.showPopover();
  const rows = [...menu.querySelectorAll<HTMLButtonElement>("[data-menu-item]")];
  const enabled = rows.map((row) => row.getAttribute("aria-disabled") !== "true");
  const box = request.anchor?.getBoundingClientRect();
  const place = placeMenu(
    box ? { x: box.left, y: box.bottom + 2 } : (request.point ?? { x: 0, y: 0 }),
    { width: menu.offsetWidth, height: menu.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  );
  menu.style.left = `${place.x}px`;
  menu.style.top = `${place.y}px`;

  const run = (row: HTMLButtonElement) => {
    if (row.getAttribute("aria-disabled") === "true") return;
    const id = row.dataset.menuItem;
    closeMenu();
    if (id) request.select(id);
  };
  const focusRow = (index: number) => {
    if (index >= 0) rows[index]?.focus();
  };
  const moveToSibling = (step: 1 | -1) => {
    const buttons = [...document.querySelectorAll<HTMLElement>("[data-menu]")].filter(
      (button) => button.offsetParent !== null,
    );
    const index = buttons.findIndex((button) => button.dataset.menu === request.key);
    if (index < 0 || buttons.length < 2) return;
    const next = buttons[(index + step + buttons.length) % buttons.length];
    if (!next) return;
    next.focus();
    next.click();
  };
  menu.addEventListener("click", (event) => {
    const row = (event.target as Element).closest<HTMLButtonElement>("[data-menu-item]");
    if (row) run(row);
  });
  menu.addEventListener("pointermove", (event) => {
    const row = (event.target as Element).closest<HTMLButtonElement>("[data-menu-item]");
    if (row && row !== document.activeElement && row.getAttribute("aria-disabled") !== "true")
      row.focus({ preventScroll: true });
  });
  // Keys stay in the menu: the editor's shortcuts (Delete, the arrows) must not act behind it.
  menu.addEventListener("keydown", (event) => {
    event.stopPropagation();
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(
        nextEnabled(
          enabled,
          index < 0 && event.key === "ArrowUp" ? 0 : index,
          event.key === "ArrowDown" ? 1 : -1,
        ),
      );
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusRow(
        event.key === "Home" ? nextEnabled(enabled, -1, 1) : nextEnabled(enabled, rows.length, -1),
      );
    } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && request.anchor) {
      event.preventDefault();
      moveToSibling(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const row = rows[index];
      if (row) run(row);
    } else if (event.key === "Tab") {
      event.preventDefault();
      closeMenu();
    }
  });
  // A press outside closes it. On a top bar menu button the click decides instead: the same
  // button closes it, another one opens its own menu.
  const outside = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target && (menu.contains(target) || (request.anchor && target.closest("[data-menu]"))))
      return;
    closeMenu({ restoreFocus: false });
  };
  // Pointing at another top bar menu while this one is open switches to it.
  const hover = (event: PointerEvent) => {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-menu]") : null;
    if (target && request.anchor && target.dataset.menu !== request.key) target.click();
  };
  const dismiss = () => closeMenu({ restoreFocus: false });
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("pointerover", hover);
  window.addEventListener("blur", dismiss);
  window.addEventListener("resize", dismiss);
  current = {
    key: request.key,
    element: menu,
    opener: opener,
    dispose() {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("pointerover", hover);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
    },
  };
  for (const button of document.querySelectorAll(`[data-menu="${request.key}"]`))
    button.setAttribute("aria-expanded", "true");
  const first = nextEnabled(enabled, -1, 1);
  if (byKeyboard && first >= 0) focusRow(first);
  else menu.focus({ preventScroll: true });
}
