import type { Guide } from "../../shared/guides";

interface State {
  scene: unknown;
  artboards: { id: string; guides?: Guide[] }[];
  activeArtboardId: string | null;
  /** Editor preferences, kept in the workspace; both default to shown. */
  rulers?: boolean;
  guides?: boolean;
}
interface Actions {
  execute(guides: Guide[]): void;
  notify(message: string): void;
}
export const RULER_SIZE = 20;
const SNAP_PIXELS = 6;
export const rulersShown = (state: Pick<State, "rulers">) => state.rulers !== false;
export const guidesShown = (state: Pick<State, "guides">) => state.guides !== false;
export const boardGuides = (state: State) =>
  state.artboards.find((board) => board.id === state.activeArtboardId)?.guides ?? [];
/** Guides that position and snap objects: none while they are hidden. */
export const activeGuides = (state: State) => (guidesShown(state) ? boardGuides(state) : []);
const formatPosition = (value: number) => String(Math.round(value * 100) / 100);
const guideName = (guide: Pick<Guide, "axis" | "position">) =>
  `Guia ${guide.axis === "x" ? "vertical" : "horizontal"} em ${formatPosition(guide.position)}`;

/** Rulers and guides sit over the stage, outside the artboard: they follow its
 * pan and zoom but never enter the scene or an export. */
export function rulerMarkup(state: State) {
  const guides = guidesShown(state)
    ? `<div class="guide-layer" data-guide-layer>${boardGuides(state)
        .map(
          (guide) =>
            `<div class="canvas-guide" data-guide="${guide.id}" data-axis="${guide.axis}" data-position="${guide.position}" role="separator" tabindex="0" aria-orientation="${guide.axis === "x" ? "vertical" : "horizontal"}" aria-label="${guideName(guide)}" title="Arraste para mover · arraste até a régua ou Delete para remover"><span class="guide-label"></span></div>`,
        )
        .join("")}</div>`
    : "";
  return rulersShown(state)
    ? `${guides}<canvas class="ruler" data-ruler="x" title="Arraste para criar uma guia horizontal"></canvas><canvas class="ruler" data-ruler="y" title="Arraste para criar uma guia vertical"></canvas><span class="ruler-corner" aria-hidden="true"></span>`
    : guides;
}

/** Artboard units → stage pixels on each axis. The rulers assume an unrotated
 * board; a rotated editor view keeps them on its axis-aligned projection. */
function stageMapping(stage: HTMLElement) {
  const svg = stage.querySelector<SVGSVGElement>(".scene-artwork>svg"),
    matrix = svg?.getScreenCTM();
  if (!matrix || !matrix.a || !matrix.d) return null;
  const box = stage.getBoundingClientRect(),
    left = box.left + stage.clientLeft,
    top = box.top + stage.clientTop;
  return {
    x: (value: number) => matrix.a * value + matrix.e - left,
    y: (value: number) => matrix.d * value + matrix.f - top,
    fromClient: (axis: Guide["axis"], client: number) =>
      axis === "x" ? (client - matrix.e) / matrix.a : (client - matrix.f) / matrix.d,
    scale: { x: matrix.a, y: matrix.d },
    left,
    top,
  };
}
/** 1, 2 or 5 × 10ⁿ artboard units, so that labelled ticks stay ≥ 50px apart. */
export function rulerStep(scale: number) {
  const target = 50 / Math.max(1e-6, Math.abs(scale)),
    power = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((factor) => factor * power).find((step) => step >= target) ?? target;
}
function drawRuler(
  canvas: HTMLCanvasElement,
  axis: Guide["axis"],
  map: (value: number) => number,
  scale: number,
  inverse: (pixel: number) => number,
) {
  const ratio = window.devicePixelRatio || 1,
    length = axis === "x" ? canvas.clientWidth : canvas.clientHeight;
  canvas.width = Math.round((axis === "x" ? length : RULER_SIZE) * ratio);
  canvas.height = Math.round((axis === "x" ? RULER_SIZE : length) * ratio);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  const style = getComputedStyle(canvas);
  context.strokeStyle = context.fillStyle = style.color;
  context.font = `9px ${style.fontFamily}`;
  context.lineWidth = 1;
  const step = rulerStep(scale),
    minor = step / 5,
    first = Math.min(inverse(RULER_SIZE), inverse(length)),
    last = Math.max(inverse(RULER_SIZE), inverse(length));
  context.beginPath();
  for (let index = Math.ceil(first / minor); index * minor <= last; index++) {
    const value = index * minor,
      pixel = Math.round(map(value)) + 0.5,
      major = index % 5 === 0,
      size = major ? RULER_SIZE : RULER_SIZE / 4;
    if (axis === "x") {
      context.moveTo(pixel, RULER_SIZE);
      context.lineTo(pixel, RULER_SIZE - size);
    } else {
      context.moveTo(RULER_SIZE, pixel);
      context.lineTo(RULER_SIZE - size, pixel);
    }
    if (!major) continue;
    const label = formatPosition(value);
    if (axis === "x") context.fillText(label, pixel + 3, 9);
    else {
      context.save();
      context.translate(9, pixel - 3);
      context.rotate(-Math.PI / 2);
      context.fillText(label, 0, 0);
      context.restore();
    }
  }
  context.stroke();
}
/** Redraws the rulers and places the guides; cheap enough for every pan step. */
export function layoutRulers() {
  const stage = document.querySelector<HTMLElement>(".stage"),
    map = stage && stageMapping(stage);
  if (!stage || !map) return;
  // The top ruler (x) measures x and the left ruler (y) measures y.
  for (const canvas of stage.querySelectorAll<HTMLCanvasElement>("canvas[data-ruler]"))
    if (canvas.dataset.ruler === "x")
      drawRuler(canvas, "x", map.x, map.scale.x, (pixel) => map.fromClient("x", pixel + map.left));
    else
      drawRuler(canvas, "y", map.y, map.scale.y, (pixel) => map.fromClient("y", pixel + map.top));
  for (const element of stage.querySelectorAll<HTMLElement>("[data-guide]")) {
    const position = Number(element.dataset.position ?? Number.NaN);
    placeGuide(element, map, Number.isFinite(position) ? position : null);
  }
}
function placeGuide(
  element: HTMLElement,
  map: NonNullable<ReturnType<typeof stageMapping>>,
  position: number | null,
) {
  const axis = element.dataset.axis === "x" ? "x" : "y";
  if (position === null) return;
  // Whole pixels keep the 1px line crisp at any zoom.
  const pixel = Math.round(axis === "x" ? map.x(position) : map.y(position));
  element.style.setProperty(axis === "x" ? "left" : "top", `${pixel}px`);
  const label = element.querySelector(".guide-label");
  if (label) label.textContent = formatPosition(position);
  element.setAttribute("aria-label", guideName({ axis, position }));
}
export function markSnappedGuides(ids: readonly string[]) {
  const snapped = new Set(ids);
  for (const element of document.querySelectorAll<HTMLElement>("[data-guide]"))
    element.classList.toggle("is-snapped", snapped.has(element.dataset.guide ?? ""));
}
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Moves a dragged box onto the nearest guide within `tolerance` (artboard
 * units): its edges and centre snap, on each axis that is moving. */
export function snapToGuides(
  bounds: Bounds,
  dx: number,
  dy: number,
  guides: readonly Guide[],
  tolerance: { x: number; y: number },
) {
  const snapped: string[] = [];
  function axis(name: Guide["axis"], delta: number) {
    if (!delta) return delta;
    const start = name === "x" ? bounds.x : bounds.y,
      size = name === "x" ? bounds.width : bounds.height;
    let best: { offset: number; id: string } | null = null;
    for (const guide of guides) {
      if (guide.axis !== name) continue;
      for (const edge of [start, start + size / 2, start + size]) {
        const offset = guide.position - (edge + delta);
        if (
          Math.abs(offset) <= tolerance[name] &&
          (!best || Math.abs(offset) < Math.abs(best.offset))
        )
          best = { offset, id: guide.id };
      }
    }
    if (!best) return delta;
    snapped.push(best.id);
    return delta + best.offset;
  }
  return { dx: axis("x", dx), dy: axis("y", dy), snapped };
}
/** Guide snapping distance in artboard units for the svg's current zoom. */
export function guideTolerance(svg: SVGSVGElement) {
  const matrix = svg.getScreenCTM();
  return {
    x: SNAP_PIXELS / Math.max(1e-6, Math.abs(matrix?.a ?? 1)),
    y: SNAP_PIXELS / Math.max(1e-6, Math.abs(matrix?.d ?? 1)),
  };
}

let cleanupRulers: (() => void) | undefined;
export function disposeRulers() {
  cleanupRulers?.();
  cleanupRulers = undefined;
}
/** Dragging out of a ruler adds a guide; dragging a guide moves it, and back
 * onto a ruler (or out of the stage) removes it. One history entry per drop. */
export function bindRulers(state: State, actions: Actions) {
  disposeRulers();
  const stage = document.querySelector<HTMLElement>(".stage");
  if (!stage || !state.scene) return;
  const observer = new ResizeObserver(() => layoutRulers());
  observer.observe(stage);
  layoutRulers();
  let cancelDrag: (() => void) | undefined;
  cleanupRulers = () => {
    cancelDrag?.();
    observer.disconnect();
  };
  const commit = (guides: Guide[]) => {
    try {
      actions.execute(guides);
    } catch (error) {
      actions.notify(error instanceof Error ? error.message : "Não foi possível editar as guias.");
    }
  };
  function drag(event: PointerEvent, axis: Guide["axis"], existing: Guide | null) {
    if (event.button !== 0 || !stage) return;
    const map = stageMapping(stage);
    if (!map) return;
    event.preventDefault();
    event.stopPropagation();
    const layer =
      stage.querySelector<HTMLElement>("[data-guide-layer]") ??
      stage.appendChild(Object.assign(document.createElement("div"), { className: "guide-layer" }));
    const element =
      (existing && stage.querySelector<HTMLElement>(`[data-guide="${existing.id}"]`)) ??
      layer.appendChild(
        Object.assign(document.createElement("div"), {
          className: "canvas-guide is-dragging",
          innerHTML: '<span class="guide-label"></span>',
        }),
      );
    element.dataset.axis = axis;
    element.classList.add("is-dragging");
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : stage;
    target.setPointerCapture(event.pointerId);
    let position =
        existing?.position ?? map.fromClient(axis, axis === "x" ? event.clientX : event.clientY),
      removing = !existing;
    const update = (move: PointerEvent) => {
      const client = axis === "x" ? move.clientX : move.clientY,
        box = stage.getBoundingClientRect();
      position = Math.round(map.fromClient(axis, client));
      // Over its own ruler, or out of the stage, the guide is dropped away.
      removing =
        move.clientX < box.left ||
        move.clientX > box.right ||
        move.clientY < box.top ||
        move.clientY > box.bottom ||
        (rulersShown(state) &&
          (axis === "x"
            ? move.clientX < map.left + RULER_SIZE
            : move.clientY < map.top + RULER_SIZE));
      element.classList.toggle("is-removing", removing);
      element.dataset.position = String(position);
      placeGuide(element, map, position);
    };
    const finish = (keep: boolean) => {
      cancelDrag = undefined;
      target.removeEventListener("pointermove", update);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", keyboard, true);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      element.classList.remove("is-dragging", "is-removing");
      const guides = boardGuides(state);
      if (!keep || (!existing && removing)) {
        if (existing) {
          element.dataset.position = String(existing.position);
          layoutRulers();
        } else element.remove();
        return;
      }
      if (removing && existing) commit(guides.filter((guide) => guide.id !== existing.id));
      else if (existing) {
        if (position === existing.position) return;
        commit(guides.map((guide) => (guide.id === existing.id ? { ...guide, position } : guide)));
      } else commit([...guides, { id: `guide-${crypto.randomUUID()}`, axis, position }]);
    };
    const up = (release: PointerEvent) => {
      update(release);
      finish(true);
    };
    const cancel = () => finish(false);
    const keyboard = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      key.stopImmediatePropagation();
      cancel();
    };
    cancelDrag = cancel;
    target.addEventListener("pointermove", update);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", keyboard, true);
    if (!existing) update(event);
  }
  // The top ruler (x) makes horizontal guides; the left one (y) vertical guides.
  for (const ruler of stage.querySelectorAll<HTMLCanvasElement>("canvas[data-ruler]"))
    ruler.onpointerdown = (event) => drag(event, ruler.dataset.ruler === "x" ? "y" : "x", null);
  for (const element of stage.querySelectorAll<HTMLElement>("[data-guide]")) {
    const guide = () => boardGuides(state).find((item) => item.id === element.dataset.guide);
    element.onpointerdown = (event) => {
      const current = guide();
      if (current) drag(event, current.axis, current);
    };
    element.onkeydown = (event) => {
      const current = guide();
      if (!current) return;
      const step = event.shiftKey ? 10 : 1,
        delta = {
          ArrowLeft: current.axis === "x" ? -step : 0,
          ArrowRight: current.axis === "x" ? step : 0,
          ArrowUp: current.axis === "y" ? -step : 0,
          ArrowDown: current.axis === "y" ? step : 0,
        }[event.key];
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        commit(boardGuides(state).filter((item) => item.id !== current.id));
      } else if (delta) {
        event.preventDefault();
        event.stopPropagation();
        commit(
          boardGuides(state).map((item) =>
            item.id === current.id ? { ...item, position: item.position + delta } : item,
          ),
        );
        stage.querySelector<HTMLElement>(`[data-guide="${current.id}"]`)?.focus();
      }
    };
  }
}
