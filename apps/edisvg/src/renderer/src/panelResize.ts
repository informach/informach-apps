interface Widths {
  left: number;
  right: number;
}
export function panelWidths(available: number, left: number, right: number): Widths {
  if (![available, left, right].every(Number.isFinite))
    throw new Error("Dimensões de painel inválidas.");
  const boundedLeft = Math.max(160, Math.min(480, left)),
    boundedRight = Math.max(220, Math.min(520, right)),
    excess = Math.max(0, boundedLeft + boundedRight - available),
    roomLeft = boundedLeft - 160,
    roomRight = boundedRight - 220,
    total = roomLeft + roomRight;
  if (available < 380) throw new Error("Janela estreita demais para três painéis.");
  return {
    left: Math.max(160, boundedLeft - (total ? (excess * roomLeft) / total : 0)),
    right: Math.max(220, boundedRight - (total ? (excess * roomRight) / total : 0)),
  };
}
interface State {
  sessionId: string;
  panelWidths?: Widths;
}
export function bindPanelResize(workspace: HTMLElement, state: State, render: () => void) {
  const sidebar = workspace.querySelector<HTMLElement>(".sidebar"),
    inspector = workspace.querySelector<HTMLElement>(".inspector"),
    rail = workspace.querySelector<HTMLElement>(".rail");
  if (!sidebar || !inspector || !rail) return () => {};
  const originalLeft = workspace.style.getPropertyValue("--edi-sidebar-width"),
    originalRight = workspace.style.getPropertyValue("--edi-inspector-width"),
    defaults = {
      left: sidebar.getBoundingClientRect().width,
      right: inspector.getBoundingClientRect().width,
    },
    session = state.sessionId;
  const controller = new AbortController(),
    { signal } = controller;
  let desired = state.panelWidths ?? defaults,
    preview = desired,
    initialized = false,
    cancelGesture: (() => void) | undefined;
  const handles = (["left", "right"] satisfies (keyof Widths)[]).map((side) => {
    const element = document.createElement("div");
    element.className = "panel-resizer";
    element.dataset.panelResize = side;
    element.tabIndex = 0;
    element.setAttribute("role", "separator");
    element.setAttribute("aria-orientation", "vertical");
    element.setAttribute(
      "aria-label",
      side === "left" ? "Redimensionar hierarquia" : "Redimensionar inspetor",
    );
    element.setAttribute("aria-valuemin", String(side === "left" ? 160 : 220));
    element.setAttribute("aria-valuemax", String(side === "left" ? 480 : 520));
    workspace.append(element);
    return { side, element };
  });
  const update = () => {
    const visible =
        getComputedStyle(inspector).display !== "none" &&
        getComputedStyle(sidebar).display !== "none",
      available =
        workspace.clientWidth -
        rail.getBoundingClientRect().width -
        parseFloat(getComputedStyle(workspace).getPropertyValue("--edi-center-min"));
    for (const { element } of handles) element.hidden = !visible || available < 380;
    if (!visible || available < 380) {
      workspace.style.removeProperty("--edi-sidebar-width");
      workspace.style.removeProperty("--edi-inspector-width");
      return;
    }
    if (!initialized) {
      defaults.left = sidebar.getBoundingClientRect().width;
      defaults.right = inspector.getBoundingClientRect().width;
      desired = state.panelWidths ?? defaults;
      initialized = true;
    }
    preview = panelWidths(available, desired.left, desired.right);
    workspace.style.setProperty("--edi-sidebar-width", `${preview.left}px`);
    workspace.style.setProperty("--edi-inspector-width", `${preview.right}px`);
    for (const { side, element } of handles) {
      element.setAttribute("aria-valuenow", String(Math.round(preview[side])));
    }
  };
  for (const { side, element } of handles) {
    element.addEventListener(
      "keydown",
      (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 50 : 10;
        desired =
          event.key === "Home"
            ? defaults
            : {
                ...preview,
                [side]:
                  preview[side] +
                  (event.key === "ArrowRight" ? 1 : -1) * (side === "left" ? 1 : -1) * step,
              };
        update();
        state.panelWidths = { ...preview };
        render();
        workspace.ownerDocument
          .querySelector<HTMLElement>(`[data-panel-resize="${side}"]`)
          ?.focus();
      },
      { signal },
    );
    element.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        cancelGesture?.();
        const start = { ...preview },
          clientX = event.clientX;
        let finished = false;
        const cleanup = () => {
          cancelGesture = undefined;
          element.onpointermove =
            element.onpointerup =
            element.onpointercancel =
            element.onlostpointercapture =
              null;
          document.removeEventListener("keydown", keyboard, true);
          window.removeEventListener("blur", cancel);
          if (element.hasPointerCapture(event.pointerId))
            element.releasePointerCapture(event.pointerId);
        };
        const cancel = () => {
          if (finished) return;
          finished = true;
          cleanup();
          desired = start;
          update();
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
        element.setPointerCapture(event.pointerId);
        element.onpointermove = (move) => {
          desired = {
            ...start,
            [side]: start[side] + (move.clientX - clientX) * (side === "left" ? 1 : -1),
          };
          update();
        };
        element.onpointerup = (up) => {
          if (finished) return;
          element.onpointermove?.(up);
          finished = true;
          cleanup();
          if (state.sessionId === session) state.panelWidths = { ...preview };
          render();
        };
        element.onpointercancel = element.onlostpointercapture = cancel;
      },
      { signal },
    );
  }
  const observer = new ResizeObserver(update);
  observer.observe(workspace);
  window.addEventListener("resize", update, { signal });
  update();
  return () => {
    cancelGesture?.();
    controller.abort();
    observer.disconnect();
    for (const { element } of handles) element.remove();
    if (originalLeft) workspace.style.setProperty("--edi-sidebar-width", originalLeft);
    else workspace.style.removeProperty("--edi-sidebar-width");
    if (originalRight) workspace.style.setProperty("--edi-inspector-width", originalRight);
    else workspace.style.removeProperty("--edi-inspector-width");
  };
}
