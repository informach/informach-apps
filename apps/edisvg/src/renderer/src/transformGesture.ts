import { inverse, type Transform, transformAttribute, transformPoint } from "@informach/edi-motion";

export function gestureTransform(
  pose: Transform,
  kind: "rotate" | "scale",
  start: { x: number; y: number },
  point: { x: number; y: number },
  uniform: boolean,
): Partial<Transform> {
  if (kind === "rotate") {
    const pivot = { x: pose.x + (pose.px ?? 0), y: pose.y + (pose.py ?? 0) };
    const a = Math.atan2(start.y - pivot.y, start.x - pivot.x),
      b = Math.atan2(point.y - pivot.y, point.x - pivot.x);
    const delta = (Math.atan2(Math.sin(b - a), Math.cos(b - a)) * 180) / Math.PI;
    const angle = pose.rotation + delta;
    return { rotation: uniform ? Math.round(angle / 15) * 15 : angle };
  }
  const px = pose.px ?? 0,
    py = pose.py ?? 0,
    x = start.x - px,
    y = start.y - py;
  if (Math.abs(x) < 1e-8 || Math.abs(y) < 1e-8)
    throw new Error("O pivô coincide com um eixo da alça; use outra alça ou ajuste px/py.");
  let sx = (point.x - px) / x,
    sy = (point.y - py) / y;
  if (uniform) sx = sy = Math.abs(sx) > Math.abs(sy) ? sx : sy;
  return { sx: pose.sx * sx, sy: pose.sy * sy };
}
export function bindTransformGesture(
  svg: SVGSVGElement,
  element: SVGGraphicsElement,
  pose: Transform,
  kind: "rotate" | "scale",
  event: PointerEvent,
  actions: {
    preview(): void;
    commit(patch: Partial<Transform>): void;
    finish(): void;
    report(message: string): void;
  },
) {
  const matrix =
    kind === "scale"
      ? element.getScreenCTM()
      : element.parentElement instanceof SVGGraphicsElement
        ? element.parentElement.getScreenCTM()
        : null;
  if (!matrix) throw new Error("Espaço de transformação indisponível.");
  const inv = inverse([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]);
  const start = transformPoint(inv, event.clientX, event.clientY),
    attribute = element.getAttribute("transform");
  let patch: Partial<Transform> = {},
    moved = false,
    finished = false;
  const cleanup = () => {
    svg.onpointermove = svg.onpointerup = svg.onpointercancel = svg.onlostpointercapture = null;
    document.removeEventListener("keydown", keyboard, true);
    window.removeEventListener("blur", cancel);
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (attribute === null) element.removeAttribute("transform");
    else element.setAttribute("transform", attribute);
  };
  const cancel = () => {
    if (finished) return;
    finished = true;
    cleanup();
    actions.preview();
  };
  const keyboard = (key: KeyboardEvent) => {
    if (key.key === "Escape") {
      key.preventDefault();
      key.stopImmediatePropagation();
      cancel();
      actions.finish();
    }
  };
  document.addEventListener("keydown", keyboard, true);
  window.addEventListener("blur", cancel);
  svg.setPointerCapture(event.pointerId);
  svg.onpointermove = (move) => {
    if (Math.hypot(move.clientX - event.clientX, move.clientY - event.clientY) < 3) return;
    moved = true;
    try {
      patch = gestureTransform(
        pose,
        kind,
        start,
        transformPoint(inv, move.clientX, move.clientY),
        move.shiftKey,
      );
      element.setAttribute("transform", transformAttribute({ ...pose, ...patch }));
      actions.preview();
    } catch (error) {
      cancel();
      actions.report(error instanceof Error ? error.message : "Não foi possível transformar.");
    }
  };
  svg.onpointerup = (up) => {
    if (finished) return;
    svg.onpointermove?.(up);
    if (finished) return;
    finished = true;
    cleanup();
    try {
      if (moved) actions.commit(patch);
    } catch (error) {
      actions.report(error instanceof Error ? error.message : "Não foi possível transformar.");
    }
    actions.finish();
  };
  svg.onpointercancel = svg.onlostpointercapture = () => {
    cancel();
    actions.finish();
  };
  return cancel;
}
