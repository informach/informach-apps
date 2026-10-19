import { editScene } from "../../shared/scene.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_ANCHORS = 1000;

export function pathFromAnchors(anchors, closed = false) {
  if (anchors.length < 2 || anchors.length > MAX_ANCHORS)
    throw new Error("O caminho precisa de 2 a 1000 pontos.");
  for (const anchor of anchors) {
    if (
      ![anchor.x, anchor.y, anchor.dx, anchor.dy].every(
        (value) => Number.isFinite(value) && Math.abs(value) <= 100000,
      )
    ) {
      throw new Error("Ponto de controle inválido.");
    }
  }
  const number = (value) => String(Math.round(value * 1000) / 1000);
  const point = (x, y) => `${number(x)} ${number(y)}`;
  const segments = [`M${point(anchors[0].x, anchors[0].y)}`];
  const count = anchors.length + (closed ? 1 : 0);
  for (let i = 1; i < count; i++) {
    const previous = anchors[i - 1],
      current = anchors[i % anchors.length];
    if (previous.dx || previous.dy || current.dx || current.dy) {
      segments.push(
        `C${point(previous.x + previous.dx, previous.y + previous.dy)} ${point(current.x - current.dx, current.y - current.dy)} ${point(current.x, current.y)}`,
      );
    } else segments.push(`L${point(current.x, current.y)}`);
  }
  if (closed) segments.push("Z");
  return segments.join(" ");
}

/** Draft paths live only in this controller; a completed path is one history entry. */
export function bindPenTool(svg, state, { render, commit, notify, changeScene }) {
  const controller = new AbortController();
  const { signal } = controller;
  const anchors = [];
  let pointerId = null;
  const overlay = document.createElementNS(SVG_NS, "g");
  overlay.classList.add("pen-draft");
  overlay.setAttribute("pointer-events", "none");
  svg.append(overlay);

  function localPoint(event) {
    const matrix = svg.getScreenCTM();
    if (
      !matrix ||
      !Number.isFinite(matrix.a * matrix.d - matrix.b * matrix.c) ||
      Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-12
    )
      return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
  }

  function draw() {
    overlay.replaceChildren();
    if (anchors.length > 1) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", pathFromAnchors(anchors));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#4fe3c1");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("vector-effect", "non-scaling-stroke");
      overlay.append(path);
    }
    const matrix = svg.getScreenCTM();
    const radius = 4 / Math.max(Math.hypot(matrix.a, matrix.b), 0.001);
    for (const anchor of anchors) {
      if (anchor.dx || anchor.dy) {
        const handle = document.createElementNS(SVG_NS, "path");
        handle.setAttribute(
          "d",
          `M${anchor.x - anchor.dx} ${anchor.y - anchor.dy}L${anchor.x + anchor.dx} ${anchor.y + anchor.dy}`,
        );
        handle.setAttribute("stroke", "#168cce");
        handle.setAttribute("vector-effect", "non-scaling-stroke");
        overlay.append(handle);
      }
      const dot = document.createElementNS(SVG_NS, "circle");
      for (const [key, value] of Object.entries({
        cx: anchor.x,
        cy: anchor.y,
        r: radius,
        fill: "#fff",
        stroke: "#168cce",
        "vector-effect": "non-scaling-stroke",
      }))
        dot.setAttribute(key, value);
      overlay.append(dot);
    }
  }

  function dispose() {
    controller.abort();
    if (pointerId !== null && svg.hasPointerCapture(pointerId))
      svg.releasePointerCapture(pointerId);
    pointerId = null;
    overlay.remove();
  }

  function finish(closed = false) {
    if (anchors.length < 2) {
      notify("Adicione pelo menos dois pontos para concluir o caminho.");
      return;
    }
    try {
      const definition = {
        tag: "path",
        attrs: { d: pathFromAnchors(anchors, closed) },
      };
      if (changeScene) changeScene("add", definition, null);
      else state.selected = editScene(state.scene, null, "add", definition);
      dispose();
      state.tool = "select";
      if (!changeScene) commit();
      render();
    } catch (error) {
      notify(error.message);
    }
  }

  svg.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || pointerId !== null) return;
      event.preventDefault();
      event.stopPropagation();
      svg.setAttribute("tabindex", "-1");
      svg.focus({ preventScroll: true });
      const point = localPoint(event);
      if (!point) return;
      if (anchors.length >= 3) {
        const first = new DOMPoint(anchors[0].x, anchors[0].y).matrixTransform(svg.getScreenCTM());
        if (Math.hypot(event.clientX - first.x, event.clientY - first.y) < 8) {
          finish(true);
          return;
        }
      }
      if (anchors.length >= MAX_ANCHORS) {
        notify("Limite de 1000 pontos. Pressione Enter para concluir.");
        return;
      }
      anchors.push({ x: point.x, y: point.y, dx: 0, dy: 0 });
      pointerId = event.pointerId;
      svg.setPointerCapture(pointerId);
      draw();
    },
    { signal },
  );

  function move(event) {
    if (event.pointerId !== pointerId) return;
    const point = localPoint(event);
    if (!point) return;
    const anchor = anchors.at(-1);
    anchor.dx = point.x - anchor.x;
    anchor.dy = point.y - anchor.y;
    draw();
  }
  svg.addEventListener("pointermove", move, { signal });
  svg.addEventListener(
    "pointerup",
    (event) => {
      if (event.pointerId !== pointerId) return;
      move(event);
      const id = pointerId;
      pointerId = null;
      if (svg.hasPointerCapture(id)) svg.releasePointerCapture(id);
    },
    { signal },
  );
  const cancel = () => {
    dispose();
    render();
  };
  svg.addEventListener("pointercancel", cancel, { signal });
  svg.addEventListener(
    "lostpointercapture",
    () => {
      if (pointerId !== null) cancel();
    },
    { signal },
  );
  window.addEventListener("blur", cancel, { signal });
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.target.closest('.rail, input, textarea, select, [contenteditable="true"]') ||
        document.querySelector("dialog[open]")
      )
        return;
      if (!["Enter", "Escape", "Backspace"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        state.tool = "select";
        cancel();
      } else if (event.key === "Enter" && pointerId === null) finish();
      else if (event.key === "Backspace" && pointerId === null) {
        anchors.pop();
        draw();
      }
    },
    { signal, capture: true },
  );
  return dispose;
}
