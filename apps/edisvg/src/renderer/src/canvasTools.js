import { editScene } from "../../shared/scene.js";
import { bindPathCanvas, startPathEditing } from "./pathEditor.js";
import { bindPenTool } from "./penTool.js";
import { bindBoneTool } from "./rig/bone-tool";
import { layoutRulers } from "./rulers";
import { bindSelectionGestures } from "./selectionGestures";
import { defaultArtboardView } from "./workspace";

let cleanupGesture;
let cleanupViewport;
export function disposeCanvasTools() {
  cleanupGesture?.();
  cleanupGesture = null;
  cleanupViewport?.();
  cleanupViewport = null;
}
export function shapeAttributes(tag, start, end, square = false) {
  let dx = end.x - start.x,
    dy = end.y - start.y;
  if (square) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * size;
    dy = (dy < 0 ? -1 : 1) * size;
  }
  const x = Math.min(start.x, start.x + dx),
    y = Math.min(start.y, start.y + dy),
    w = Math.abs(dx),
    h = Math.abs(dy);
  const attrs =
    tag === "line"
      ? { x1: start.x, y1: start.y, x2: start.x + dx, y2: start.y + dy }
      : tag === "circle"
        ? { cx: x + w / 2, cy: y + h / 2, r: Math.min(w, h) / 2 }
        : { x, y, width: w, height: h };
  return Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
}
export const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300];
const clampZoom = (zoom) => Math.max(10, Math.min(800, zoom));
/** Shows a zoom in the toolbar select: a preset, or the free value from the wheel. */
export function zoomOptions(zoom) {
  const shown = Math.round(zoom);
  return `${ZOOM_PRESETS.includes(shown) ? "" : `<option selected data-zoom-custom>${shown}%</option>`}${ZOOM_PRESETS.map((v) => `<option ${shown === v ? "selected" : ""}>${v}%</option>`).join("")}`;
}
/** Places the active artboard on the stage from the pan and its editor-only view. */
export function applyArtboardView(state) {
  const board = document.querySelector(".stage .artboard");
  if (!board) return;
  const pan = state.pan ?? { x: 0, y: 0 },
    view = state.artboardViews?.[state.activeArtboardId] ?? defaultArtboardView();
  board.style.translate = `${pan.x + view.x}px ${pan.y + view.y}px`;
  board.style.transformOrigin = `${view.originX}% ${view.originY}%`;
  board.style.rotate = `${view.rotation}deg`;
  board.style.scale = `${view.scaleX / 100} ${view.scaleY / 100}`;
  board.style.opacity = String(view.opacity / 100);
  layoutRulers();
}
export function bindViewport(state, { render }) {
  const stage = document.querySelector(".stage"),
    board = stage?.querySelector(".artboard");
  if (!board) return;
  state.pan ??= { x: 0, y: 0 };
  const pan = state.pan;
  const apply = () => applyArtboardView(state);
  apply();
  stage.dataset.tool = state.tool || "select";
  const reset = document.querySelector("[data-viewport-reset]");
  if (reset)
    reset.onclick = () => {
      state.pan = { x: 0, y: 0 };
      state.zoom = 75;
      render();
    };
  // Ctrl + wheel (a trackpad pinch arrives the same way) zooms around the pointer:
  // the artboard point under it stays put. It does not render, like the zoom select.
  stage.onwheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const step = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.002,
      next = clampZoom(state.zoom * Math.exp(-e.deltaY * step));
    if (next === state.zoom) return;
    const before = board.getBoundingClientRect(),
      fx = (e.clientX - before.left) / before.width,
      fy = (e.clientY - before.top) / before.height;
    state.zoom = next;
    board.style.setProperty("--zoom", String(next / 75));
    const after = board.getBoundingClientRect();
    pan.x += e.clientX - (after.left + fx * after.width);
    pan.y += e.clientY - (after.top + fy * after.height);
    apply();
    const select = document.querySelector("#zoom");
    if (select) select.innerHTML = zoomOptions(next);
  };
  stage.onpointerdown = (e) => {
    if (e.button !== 1 && !(e.button === 0 && ["hand", "zoom"].includes(state.tool))) return;
    e.preventDefault();
    if (state.tool === "zoom" && e.button === 0) {
      state.zoom = clampZoom(state.zoom + (e.altKey ? -25 : 25));
      render();
      return;
    }
    const start = { x: e.clientX, y: e.clientY },
      origin = { ...pan };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add("panning");
    stage.onpointermove = (ev) => {
      pan.x = origin.x + ev.clientX - start.x;
      pan.y = origin.y + ev.clientY - start.y;
      apply();
    };
    const dispose = () => {
      stage.onpointermove =
        stage.onpointerup =
        stage.onpointercancel =
        stage.onlostpointercapture =
          null;
      stage.classList.remove("panning");
      document.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("blur", cancel);
      if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      cleanupViewport = null;
    };
    const cancel = () => {
      Object.assign(pan, origin);
      apply();
      dispose();
    };
    const keyboard = (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        cancel();
      }
    };
    cleanupViewport = cancel;
    document.addEventListener("keydown", keyboard, true);
    window.addEventListener("blur", cancel);
    stage.onpointerup = () => {
      apply();
      dispose();
    };
    stage.onpointercancel = stage.onlostpointercapture = cancel;
  };
}
export function bindCanvasTools(
  state,
  {
    render,
    commit,
    notify,
    changeTransforms,
    changeScene,
    setVertexKey,
    changePath,
    transact,
    previewChanged,
  },
) {
  cleanupGesture?.();
  cleanupGesture = null;
  const svg = document.querySelector(".scene-artwork>svg");
  if (!svg) return;
  if (state.pathEdit) {
    cleanupGesture = bindPathCanvas(svg, state, {
      render,
      commit,
      notify,
      changeScene,
      setVertexKey,
      changePath,
      previewChanged,
    });
    return;
  }
  if (state.tool === "pen") {
    cleanupGesture = bindPenTool(svg, state, { render, commit, notify, changeScene });
    return;
  }
  if (state.tool === "bone") {
    if (!transact) throw new Error("Ferramenta de osso requer transações do documento.");
    cleanupGesture = bindBoneTool(svg, state, {
      render,
      notify,
      execute: (command) => transact([command]),
    });
    return;
  }
  if ((state.tool || "select") === "select") {
    cleanupGesture = bindSelectionGestures(svg, state, {
      render,
      notify,
      transform: changeTransforms,
      previewChanged,
      editPath: (id) =>
        startPathEditing(state, { render, commit, notify, changeScene, setVertexKey }, id),
    });
    return;
  }
  const ns = "http://www.w3.org/2000/svg";
  const add = (definition) => {
    if (changeScene) changeScene("add", definition, null);
    else {
      state.selected = editScene(state.scene, null, "add", definition);
      commit();
    }
  };
  svg.onpointerdown = (event) => {
    if (event.button !== 0 || !["shapes", "text"].includes(state.tool)) return;
    event.preventDefault();
    event.stopPropagation();
    if (state.view === "animate" && state.activeClipId) {
      notify("Use Design para desenhar e editar a geometria. Use Animar para gravar poses.");
      return;
    }
    const matrix = svg.getScreenCTM();
    if (
      !matrix ||
      !Number.isFinite(matrix.a * matrix.d - matrix.b * matrix.c) ||
      matrix.a * matrix.d - matrix.b * matrix.c === 0
    ) {
      notify("O espaço de desenho está singular ou indisponível.");
      return;
    }
    const inverse = matrix.inverse();
    const point = (value) => new DOMPoint(value.clientX, value.clientY).matrixTransform(inverse);
    const start = point(event);
    if (state.tool === "text") {
      try {
        add({
          tag: "text",
          attrs: { x: String(start.x), y: String(start.y), "text-anchor": "start" },
        });
        state.tool = "select";
        render();
        const input = document.querySelector('[data-text-panel] textarea[name="text"]');
        input?.focus();
        input?.select();
      } catch (error) {
        notify(error.message);
      }
      return;
    }
    const preview = document.createElementNS(ns, state.shape || "rect");
    preview.setAttribute("fill", state.shape === "line" ? "none" : "var(--mint)");
    preview.setAttribute("stroke", state.shape === "line" ? "var(--mint)" : "none");
    preview.setAttribute("stroke-width", "4");
    svg.append(preview);
    svg.setPointerCapture(event.pointerId);
    let end = start,
      moved = false,
      square = false,
      finished = false;
    const cleanup = () => {
      cleanupGesture = null;
      document.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("blur", cancel);
      svg.onpointermove = svg.onpointerup = svg.onpointercancel = svg.onlostpointercapture = null;
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      preview.remove();
    };
    const finish = (keep) => {
      if (finished) return;
      finished = true;
      cleanup();
      try {
        if (keep && moved) {
          const attrs = shapeAttributes(state.shape || "rect", start, end, square);
          if (
            state.shape === "line" ||
            (Number(attrs.r ?? attrs.width) > 0 && Number(attrs.r ?? attrs.height) > 0)
          ) {
            add({ tag: state.shape || "rect", attrs });
            state.tool = "select";
          }
        }
      } catch (error) {
        notify(error.message);
      }
      render();
    };
    const cancel = () => finish(false);
    const keyboard = (key) => {
      if (key.key === "Escape") {
        key.preventDefault();
        key.stopImmediatePropagation();
        cancel();
      }
    };
    document.addEventListener("keydown", keyboard, true);
    window.addEventListener("blur", cancel);
    cleanupGesture = () => {
      if (!finished) {
        finished = true;
        cleanup();
      }
    };
    svg.onpointermove = (move) => {
      end = point(move);
      square = move.shiftKey;
      moved = Math.hypot(move.clientX - event.clientX, move.clientY - event.clientY) > 3;
      for (const [name, value] of Object.entries(
        shapeAttributes(state.shape || "rect", start, end, square),
      ))
        preview.setAttribute(name, value);
    };
    svg.onpointerup = (up) => {
      svg.onpointermove(up);
      finish(true);
    };
    svg.onpointercancel = svg.onlostpointercapture = cancel;
  };
}
