import { inverse, type Motion, type Transform } from "@informach/edi-motion";
import { PATH_TAGS } from "../../shared/pathGeometry.js";
import { flattenScene } from "../../shared/scene.js";
import { selectionRoots } from "../../shared/sceneBatch";
import type { Scene } from "../../shared/sceneTypes";
import { objectPose } from "./clipPose";
import { chooseObject, selectionIds } from "./selection";
import { bindTransformGesture } from "./transformGesture";

interface State {
  id: string;
  sessionId: string;
  revision: number;
  scene: Scene;
  motion: Motion;
  activeClipId: string | null;
  view: string;
  frame: number;
  playing: boolean;
  selected: string | null;
  selectedIds?: string[];
  clean: boolean;
  snapGrid?: number;
  lastVertexClick?: { id: string; x: number; y: number; time: number } | null;
}
export interface TransformUpdate {
  targetId: string;
  transform: Partial<Transform>;
}
interface Actions {
  render(): void;
  notify(message: string): void;
  transform(updates: TransformUpdate[]): void;
  editPath(id: string): void;
  previewChanged?(): void;
}
const ns = "http://www.w3.org/2000/svg";
function screenInverse(matrix: DOMMatrix | null) {
  if (!matrix) throw new Error("Espaço de coordenadas indisponível.");
  const values = inverse([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]);
  return new DOMMatrix(values);
}
const at = (event: { clientX: number; clientY: number }, matrix: DOMMatrix) =>
  new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
function setSelection(state: State, ids: string[]) {
  state.selectedIds = ids;
  state.selected = ids.at(-1) ?? null;
}
/** Owns DOM previews only. The document changes once, on pointerup. */
export function bindSelectionGestures(svg: SVGSVGElement, state: State, actions: Actions) {
  if (state.clean) return () => {};
  let cancelGesture: (() => void) | undefined;
  const entries = flattenScene(state.scene),
    byId = new Map(entries.map((entry) => [entry.node.id, entry]));
  const elements = new Map<string, SVGGraphicsElement>();
  let gridElements: SVGElement[] = [];
  if ((state.snapGrid ?? 0) >= 0.1) {
    const matrix = svg.getScreenCTM(),
      scale = matrix ? Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) : 1;
    const raw = state.snapGrid ?? 1,
      step = raw * Math.max(1, Math.ceil(8 / (raw * Math.max(0.001, scale))));
    const defs = document.createElementNS(ns, "defs"),
      pattern = document.createElementNS(ns, "pattern"),
      path = document.createElementNS(ns, "path"),
      rect = document.createElementNS(ns, "rect"),
      id = `edi-grid-${crypto.randomUUID()}`;
    for (const [key, value] of Object.entries({
      id,
      width: step,
      height: step,
      patternUnits: "userSpaceOnUse",
    }))
      pattern.setAttribute(key, String(value));
    path.setAttribute("d", `M${step} 0H0V${step}`);
    path.setAttribute("class", "workspace-grid-line");
    pattern.append(path);
    defs.append(pattern);
    const [x, y, width, height] = state.scene.viewBox;
    for (const [key, value] of Object.entries({
      x,
      y,
      width,
      height,
      fill: `url(#${id})`,
      "pointer-events": "none",
      "aria-hidden": "true",
    }))
      rect.setAttribute(key, String(value));
    svg.prepend(defs, rect);
    gridElements = [defs, rect];
  }
  for (const element of svg.querySelectorAll("[data-object]")) {
    if (element instanceof SVGGraphicsElement) {
      const id = element.getAttribute("data-object");
      if (id) elements.set(id, element);
    }
  }
  function drawSelection() {
    svg.querySelectorAll(".selection-outline,.selection-handle").forEach((element) => {
      element.remove();
    });
    for (const id of selectionIds(state)) {
      const element = elements.get(id),
        node = byId.get(id)?.node;
      if (!element || !node) continue;
      const box = node.instance
        ? { x: 0, y: 0, width: node.instance.width, height: node.instance.height }
        : element.getBBox();
      const rootMatrix = svg.getScreenCTM(),
        elementMatrix = element.getScreenCTM();
      if (!rootMatrix || !elementMatrix) continue;
      try {
        const matrix = screenInverse(rootMatrix).multiply(elementMatrix),
          outline = document.createElementNS(ns, "polygon");
        outline.setAttribute(
          "points",
          [
            [box.x, box.y],
            [box.x + box.width, box.y],
            [box.x + box.width, box.y + box.height],
            [box.x, box.y + box.height],
          ]
            .map(([x, y]) => {
              const p = new DOMPoint(x, y).matrixTransform(matrix);
              return `${p.x},${p.y}`;
            })
            .join(" "),
        );
        outline.setAttribute("class", "selection-outline");
        svg.append(outline);
        if (selectionIds(state).length === 1 && !byId.get(id)?.locked) {
          const radius = 4 / Math.max(0.001, Math.hypot(rootMatrix.a, rootMatrix.b));
          const add = (x: number, y: number, kind: string) => {
            const p = new DOMPoint(x, y).matrixTransform(matrix),
              handle = document.createElementNS(ns, "circle");
            handle.setAttribute("cx", String(p.x));
            handle.setAttribute("cy", String(p.y));
            handle.setAttribute("r", String(radius));
            handle.setAttribute("class", "selection-handle");
            handle.setAttribute("data-transform-handle", kind);
            svg.append(handle);
            return p;
          };
          const corners: Array<[number, number]> = [
            [box.x, box.y],
            [box.x + box.width, box.y],
            [box.x + box.width, box.y + box.height],
            [box.x, box.y + box.height],
          ];
          for (const [x, y] of corners) add(x, y, "scale");
          const top = add(box.x + box.width / 2, box.y, "rotate"),
            rotate = svg.lastElementChild;
          rotate?.setAttribute("cy", String(top.y - radius * 5));
        }
      } catch (error) {
        actions.notify(
          error instanceof Error ? error.message : "Não foi possível mostrar a seleção.",
        );
      }
    }
  }
  drawSelection();
  svg.onpointerdown = (event) => {
    if (
      document.activeElement instanceof HTMLInputElement &&
      document.activeElement.hasAttribute("data-layer-rename")
    )
      document.activeElement.blur();
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle =
      event.target instanceof Element ? event.target.closest("[data-transform-handle]") : null;
    if (handle && state.selected) {
      const entry = byId.get(state.selected),
        element = elements.get(state.selected),
        kind = handle.getAttribute("data-transform-handle");
      if (!entry || !element || entry.locked || (kind !== "rotate" && kind !== "scale")) return;
      state.playing = false;
      try {
        cancelGesture = bindTransformGesture(
          svg,
          element,
          objectPose(state, entry.node),
          kind,
          event,
          {
            preview() {
              drawSelection();
              actions.previewChanged?.();
            },
            commit: (patch) => actions.transform([{ targetId: entry.node.id, transform: patch }]),
            finish: actions.render,
            report: actions.notify,
          },
        );
      } catch (error) {
        actions.notify(error instanceof Error ? error.message : "Coordenadas inválidas.");
      }
      return;
    }
    const target =
      event.target instanceof Element
        ? event.target.closest("[data-rig-object],[data-object]")
        : null;
    const id = target?.getAttribute("data-rig-object") ?? target?.getAttribute("data-object"),
      entry = id ? byId.get(id) : undefined;
    const initialSelection = [...selectionIds(state)],
      context = {
        id: state.id,
        sessionId: state.sessionId,
        revision: state.revision,
        scene: state.scene,
      };
    if (entry && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      chooseObject(state, entry.node.id, true);
      actions.render();
      return;
    }
    if (
      entry &&
      PATH_TAGS.has(entry.node.tag) &&
      state.view !== "animate" &&
      state.lastVertexClick?.id === entry.node.id &&
      performance.now() - state.lastVertexClick.time < 400 &&
      Math.hypot(event.clientX - state.lastVertexClick.x, event.clientY - state.lastVertexClick.y) <
        8
    ) {
      chooseObject(state, entry.node.id);
      state.lastVertexClick = null;
      actions.editPath(entry.node.id);
      return;
    }
    state.playing = false;
    const marquee = !entry;
    if (entry && !initialSelection.includes(entry.node.id)) chooseObject(state, entry.node.id);
    if (entry) state.selected = entry.node.id;
    drawSelection();
    const roots = marquee ? [] : selectionRoots(state.scene, selectionIds(state));
    if (roots.some((entry) => entry.locked)) {
      actions.notify("Desbloqueie todas as camadas selecionadas e seus grupos para mover.");
      actions.render();
      return;
    }
    let rootInverse: DOMMatrix;
    const participants: {
      id: string;
      element: SVGGraphicsElement;
      matrix: DOMMatrix;
      origin: DOMPoint;
      pose: Transform;
      attribute: string | null;
    }[] = [];
    try {
      rootInverse = screenInverse(svg.getScreenCTM());
      for (const item of roots) {
        const element = elements.get(item.node.id),
          parent = element?.parentElement;
        if (!element || !(parent instanceof SVGGraphicsElement))
          throw new Error("Objeto selecionado não está renderizado.");
        const matrix = screenInverse(parent.getScreenCTM());
        participants.push({
          id: item.node.id,
          element,
          matrix,
          origin: at(event, matrix),
          pose: objectPose(state, item.node),
          attribute: element.getAttribute("transform"),
        });
      }
    } catch (error) {
      setSelection(state, initialSelection);
      actions.notify(error instanceof Error ? error.message : "Coordenadas inválidas.");
      actions.render();
      return;
    }
    const start = at(event, rootInverse),
      preview = marquee ? document.createElementNS(ns, "rect") : null;
    const first = participants.find((item) => item.id === state.selected) ?? participants[0];
    const firstMatrix = first?.element.getScreenCTM();
    const anchor =
      first && firstMatrix
        ? new DOMPoint(first.pose.px ?? 0, first.pose.py ?? 0).matrixTransform(
            rootInverse.multiply(firstMatrix),
          )
        : start;
    preview?.setAttribute("class", "selection-marquee");
    if (preview) svg.append(preview);
    let moved = false,
      end = { clientX: event.clientX, clientY: event.clientY },
      finished = false;
    const cleanup = () => {
      cancelGesture = undefined;
      svg.onpointermove = svg.onpointerup = svg.onpointercancel = svg.onlostpointercapture = null;
      document.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("blur", cancel);
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      preview?.remove();
      svg.querySelectorAll(".selection-outline").forEach((element) => {
        element.removeAttribute("transform");
      });
      for (const item of participants) {
        if (item.attribute !== null) item.element.setAttribute("transform", item.attribute);
        else item.element.removeAttribute("transform");
      }
      actions.previewChanged?.();
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      cleanup();
      if (
        state.id === context.id &&
        state.sessionId === context.sessionId &&
        state.revision === context.revision &&
        state.scene === context.scene
      )
        setSelection(state, initialSelection);
    };
    const keyboard = (key: KeyboardEvent) => {
      if (key.key === "Escape") {
        key.preventDefault();
        key.stopImmediatePropagation();
        cancel();
        actions.render();
      }
    };
    cancelGesture = cancel;
    document.addEventListener("keydown", keyboard, true);
    window.addEventListener("blur", cancel);
    svg.setPointerCapture(event.pointerId);
    svg.onpointermove = (move) => {
      end = { clientX: move.clientX, clientY: move.clientY };
      moved = Math.hypot(move.clientX - event.clientX, move.clientY - event.clientY) > 3;
      if (!preview && moved) {
        const point = at(move, rootInverse);
        let dx = point.x - start.x,
          dy = point.y - start.y;
        if (move.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const grid = state.snapGrid ?? 0;
        if (grid >= 0.1) {
          if (dx) dx = Math.round((anchor.x + dx) / grid) * grid - anchor.x;
          if (dy) dy = Math.round((anchor.y + dy) / grid) * grid - anchor.y;
        }
        const screen = new DOMPoint(start.x + dx, start.y + dy).matrixTransform(
          rootInverse.inverse(),
        );
        end = { clientX: screen.x, clientY: screen.y };
      }
      if (preview) {
        const p = at(move, rootInverse);
        for (const [name, value] of Object.entries({
          x: Math.min(start.x, p.x),
          y: Math.min(start.y, p.y),
          width: Math.abs(p.x - start.x),
          height: Math.abs(p.y - start.y),
        }))
          preview.setAttribute(name, String(value));
      } else if (moved) {
        const delta = at(end, rootInverse);
        svg.querySelectorAll(".selection-outline").forEach((element) => {
          element.setAttribute("transform", `translate(${delta.x - start.x} ${delta.y - start.y})`);
        });
      }
      if (!preview && moved)
        for (const item of participants) {
          const point = at(end, item.matrix);
          item.element.setAttribute(
            "transform",
            `translate(${point.x - item.origin.x} ${point.y - item.origin.y}) ${item.attribute ?? ""}`,
          );
        }
      try {
        actions.previewChanged?.();
      } catch (error) {
        cancel();
        actions.notify(error instanceof Error ? error.message : "Prévia do efeito recusada.");
        actions.render();
      }
    };
    svg.onpointerup = (up) => {
      if (finished) return;
      svg.onpointermove?.(up);
      if (finished) return;
      finished = true;
      cleanup();
      try {
        if (marquee) {
          const left = Math.min(event.clientX, end.clientX),
            right = Math.max(event.clientX, end.clientX),
            top = Math.min(event.clientY, end.clientY),
            bottom = Math.max(event.clientY, end.clientY);
          const hits = moved
            ? entries
                .filter((item) => {
                  const element = elements.get(item.node.id);
                  if (!element || !item.visible) return false;
                  const box = element.getBoundingClientRect();
                  return (
                    box.width > 0 &&
                    box.height > 0 &&
                    box.left < right &&
                    box.right > left &&
                    box.top < bottom &&
                    box.bottom > top
                  );
                })
                .map((item) => item.node.id)
            : [];
          const ids =
            event.shiftKey || event.ctrlKey || event.metaKey
              ? [...new Set([...initialSelection, ...hits])]
              : hits;
          setSelection(
            state,
            selectionRoots(state.scene, ids).map((item) => item.node.id),
          );
          state.lastVertexClick = null;
        } else if (entry) {
          state.lastVertexClick = moved
            ? null
            : { id: entry.node.id, time: performance.now(), x: up.clientX, y: up.clientY };
          if (moved)
            actions.transform(
              participants.map((item) => {
                const point = at(end, item.matrix);
                return {
                  targetId: item.id,
                  transform: {
                    x: item.pose.x + point.x - item.origin.x,
                    y: item.pose.y + point.y - item.origin.y,
                  },
                };
              }),
            );
        }
      } catch (error) {
        actions.notify(
          error instanceof Error ? error.message : "Não foi possível transformar a seleção.",
        );
      }
      actions.render();
    };
    svg.onpointercancel = svg.onlostpointercapture = () => {
      cancel();
      actions.render();
    };
  };
  return () => {
    cancelGesture?.();
    svg.onpointerdown = null;
    for (const element of gridElements) element.remove();
    gridElements = [];
  };
}
