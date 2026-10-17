import { validateTransform } from "../../shared/project.js";
import { editScene, flattenScene } from "../../shared/scene.js";
import { bindPathCanvas, startPathEditing } from "./pathEditor.js";
import { bindPenTool } from "./penTool.js";

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
export function bindViewport(state, { render }) {
  const stage = document.querySelector(".stage"),
    board = stage?.querySelector(".artboard");
  if (!board) return;
  state.pan ??= { x: 0, y: 0 };
  const pan = state.pan;
  const apply = () => {
    board.style.translate = `${pan.x}px ${pan.y}px`;
  };
  apply();
  stage.dataset.tool = state.tool || "select";
  const reset = document.querySelector("[data-viewport-reset]");
  if (reset)
    reset.onclick = () => {
      state.pan = { x: 0, y: 0 };
      state.zoom = 75;
      render();
    };
  stage.onpointerdown = (e) => {
    if (e.button !== 1 && !(e.button === 0 && ["hand", "zoom"].includes(state.tool))) return;
    e.preventDefault();
    if (state.tool === "zoom" && e.button === 0) {
      state.zoom = Math.max(25, Math.min(300, state.zoom + (e.altKey ? -25 : 25)));
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
export function bindCanvasTools(state, { render, commit, notify }) {
  cleanupGesture?.();
  cleanupGesture = null;
  const art = document.querySelector(".scene-artwork"),
    svg = art?.querySelector("svg");
  if (!svg) return;
  if (state.pathEdit) {
    cleanupGesture = bindPathCanvas(svg, state, { render, commit, notify });
    return;
  }
  if (state.tool === "pen") {
    cleanupGesture = bindPenTool(svg, state, { render, commit, notify });
    return;
  }
  const ns = "http://www.w3.org/2000/svg";
  const point = (e, matrix) => new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  const selected = Array.from(svg.querySelectorAll("[data-object]")).find(
    (el) => el.dataset.object === state.selected,
  );
  if (selected) {
    const box = selected.getBBox(),
      matrix = svg.getScreenCTM().inverse().multiply(selected.getScreenCTM());
    const outline = document.createElementNS(ns, "polygon");
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
  }
  svg.onpointerdown = (e) => {
    if (e.button !== 0 || !["select", "shapes", "text"].includes(state.tool || "select")) return;
    e.preventDefault();
    e.stopPropagation();
    const tool = state.tool || "select",
      target = e.target.closest("[data-object]");
    const entry = flattenScene(state.scene).find((item) => item.node.id === target?.dataset.object);
    if (
      tool === "select" &&
      entry &&
      state.lastVertexClick?.id === entry.node.id &&
      performance.now() - state.lastVertexClick.time < 400 &&
      Math.hypot(e.clientX - state.lastVertexClick.x, e.clientY - state.lastVertexClick.y) < 8
    ) {
      state.lastVertexClick = null;
      startPathEditing(state, { render, commit, notify }, entry.node.id);
      return;
    }
    if (tool === "select" && !entry) {
      state.selected = null;
      render();
      return;
    }
    if (tool === "select" && entry.locked) {
      state.selected = entry.node.id;
      notify("Desbloqueie a camada e seus grupos para mover.");
      render();
      return;
    }
    const matrix = tool === "select" ? target.parentNode.getScreenCTM() : svg.getScreenCTM();
    if (
      !matrix ||
      !Number.isFinite(matrix.a * matrix.d - matrix.b * matrix.c) ||
      Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-12
    )
      return;
    const start = point(e, matrix);
    let end = start,
      moved = false,
      preview;
    const original = target?.getAttribute("transform");
    if (tool === "text") {
      try {
        state.selected = editScene(state.scene, null, "add", {
          tag: "text",
          attrs: { x: String(start.x), y: String(start.y), "text-anchor": "start" },
        });
        state.tool = "select";
        commit();
        render();
        const input = document.querySelector("[data-scene-text]");
        input?.focus();
        input?.select();
      } catch (error) {
        notify(error.message);
      }
      return;
    }
    if (tool === "shapes") {
      preview = document.createElementNS(ns, state.shape || "rect");
      preview.setAttribute("fill", state.shape === "line" ? "none" : "#4fe3c1");
      preview.setAttribute("stroke", state.shape === "line" ? "#4fe3c1" : "none");
      preview.setAttribute("stroke-width", "4");
      svg.append(preview);
    }
    svg.setPointerCapture(e.pointerId);
    const cancel = () => finish(false);
    const keyboard = (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        cancel();
      }
    };
    const finish = (keep) => {
      cleanupGesture?.();
      cleanupGesture = null;
      svg.onpointermove = svg.onpointerup = svg.onpointercancel = svg.onlostpointercapture = null;
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      try {
        if (keep && tool === "select") {
          state.selected = entry.node.id;
          state.lastVertexClick = moved
            ? null
            : { id: entry.node.id, time: performance.now(), x: e.clientX, y: e.clientY };
          if (moved) {
            editScene(
              state.scene,
              entry.node.id,
              "transform",
              validateTransform({
                x: entry.node.transform.x + end.x - start.x,
                y: entry.node.transform.y + end.y - start.y,
              }),
            );
            commit();
          }
        }
        if (keep && tool === "shapes" && moved) {
          const attrs = shapeAttributes(state.shape || "rect", start, end, end.square);
          if (
            state.shape === "line" ||
            (Number(attrs.r ?? attrs.width) > 0 && Number(attrs.r ?? attrs.height) > 0)
          ) {
            state.selected = editScene(state.scene, null, "add", {
              tag: state.shape || "rect",
              attrs,
            });
            state.tool = "select";
            commit();
          }
        }
      } catch (error) {
        notify(error.message);
      } finally {
        render();
      }
    };
    document.addEventListener("keydown", keyboard, true);
    cleanupGesture = () => {
      document.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("blur", cancel);
      svg.onpointermove = svg.onpointerup = svg.onpointercancel = svg.onlostpointercapture = null;
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      preview?.remove();
      if (target && original !== null) target.setAttribute("transform", original);
    };
    window.addEventListener("blur", cancel);
    svg.onpointermove = (ev) => {
      end = point(ev, matrix);
      end.square = ev.shiftKey;
      moved = Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 3;
      if (preview) {
        for (const [k, v] of Object.entries(
          shapeAttributes(state.shape || "rect", start, end, ev.shiftKey),
        ))
          preview.setAttribute(k, v);
      } else if (moved) {
        target.setAttribute(
          "transform",
          `translate(${end.x - start.x} ${end.y - start.y}) ${original}`,
        );
        svg.querySelector(".selection-outline")?.remove();
      }
    };
    svg.onpointerup = (ev) => {
      svg.onpointermove(ev);
      finish(true);
    };
    svg.onpointercancel = svg.onlostpointercapture = cancel;
  };
}
