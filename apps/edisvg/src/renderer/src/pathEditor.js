import {
  deleteVertex,
  moveHandle,
  moveVertex,
  PATH_TAGS,
  pathFromNode,
  pointOnSegment,
  reverseContour,
  serializePath,
  setVertexType,
  splitSegment,
} from "../../shared/pathGeometry.js";
import { editScene, flattenScene } from "../../shared/scene.js";

function entryFor(state) {
  return flattenScene(state.scene).find((item) => item.node.id === state.selected);
}

const VERTEX_MODES = [
  {
    id: "straight",
    label: "Reto",
    description: "Remove as alças e cria um canto.",
    drawing: '<path d="M5 17 16 6 27 17"/><circle cx="16" cy="6" r="2" fill="currentColor"/>',
  },
  {
    id: "mirrored",
    label: "Espelhado",
    description: "Mantém as alças alinhadas e com o mesmo comprimento.",
    drawing:
      '<path class="mode-curve" d="M5 18Q16 -2 27 18"/><path d="M6 7H26"/><circle cx="6" cy="7" r="2"/><circle cx="26" cy="7" r="2"/><circle cx="16" cy="7" r="2" fill="currentColor"/>',
  },
  {
    id: "detached",
    label: "Independente",
    description: "Permite ajustar a direção e o comprimento de cada alça.",
    drawing:
      '<path class="mode-curve" d="M4 18Q15 -2 28 18"/><path d="M7 5 16 8 24 15"/><circle cx="7" cy="5" r="2"/><circle cx="24" cy="15" r="2"/><circle cx="16" cy="8" r="2" fill="currentColor"/>',
  },
  {
    id: "asymmetric",
    label: "Assimétrico",
    description: "Mantém as alças alinhadas, com comprimentos diferentes.",
    drawing:
      '<path class="mode-curve" d="M6 18Q12 -2 28 18"/><path d="M7 7H27"/><circle cx="7" cy="7" r="2"/><circle cx="27" cy="7" r="2"/><circle cx="13" cy="7" r="2" fill="currentColor"/>',
  },
];

export function inferVertexMode(p) {
  const hasIn = p.in && Math.hypot(p.in.x - p.x, p.in.y - p.y) > 1e-7;
  const hasOut = p.out && Math.hypot(p.out.x - p.x, p.out.y - p.y) > 1e-7;
  if (!hasIn && !hasOut) return "straight";
  if (!hasIn || !hasOut) return "detached";
  const ax = p.in.x - p.x,
    ay = p.in.y - p.y,
    bx = p.out.x - p.x,
    by = p.out.y - p.y;
  const a = Math.hypot(ax, ay),
    b = Math.hypot(bx, by);
  if (a < 1e-7 || b < 1e-7 || ax * bx + ay * by >= 0 || Math.abs(ax * by - ay * bx) > 1e-5 * a * b)
    return "detached";
  return Math.abs(a - b) < 1e-5 * Math.max(1, a, b) ? "mirrored" : "asymmetric";
}

export function vertexModeBar(mode, disabled = false) {
  return `<div class="vertex-mode-bar" role="group" aria-label="Tipo de vértice">${VERTEX_MODES.map((item) => `<button type="button" data-vertex-mode="${item.id}" aria-label="${item.label}" aria-pressed="${mode === item.id}" title="${item.label}: ${item.description}" ${disabled ? "disabled" : ""}><svg viewBox="0 0 32 24" width="32" height="24" aria-hidden="true" focusable="false">${item.drawing}</svg><span class="vertex-mode-tip">${item.label}</span></button>`).join("")}</div>`;
}
export function synchronizePathEditing(state) {
  const entry = entryFor(state);
  if (
    state.pathEdit &&
    (!entry ||
      state.pathEdit.id !== entry.node.id ||
      entry.locked ||
      !entry.visible ||
      entry.node.tag !== "path" ||
      !["select", "pen"].includes(state.tool))
  )
    state.pathEdit = null;
  if (state.pathEdit) {
    try {
      pathFromNode(entry.node);
    } catch {
      state.pathEdit = null;
    }
  }
}
export function startPathEditing(state, callbacks, id = state.selected) {
  const { render, commit, notify } = callbacks;
  try {
    const entry = flattenScene(state.scene).find((item) => item.node.id === id);
    if (!entry || !PATH_TAGS.has(entry.node.tag))
      throw new Error("Selecione uma forma ou um caminho na hierarquia.");
    if (entry.locked) throw new Error("Desbloqueie a forma e seus grupos para editar vértices.");
    if (!entry.visible) throw new Error("Mostre a forma e seus grupos para editar vértices.");
    const geometry = pathFromNode(entry.node);
    if (entry.node.tag !== "path") {
      editScene(state.scene, id, "path", serializePath(geometry));
      commit();
    }
    state.selected = id;
    state.pathEdit = { id, contour: 0, index: 0, mode: inferVertexMode(geometry[0].points[0]) };
    state.tool = "select";
    state.view = "design";
    state.playing = false;
    render();
    document.querySelector(".scene-artwork>svg")?.focus({ preventScroll: true });
  } catch (error) {
    notify(error.message);
  }
}
export function pathInspector(state) {
  const entry = entryFor(state);
  if (!entry || !PATH_TAGS.has(entry.node.tag)) return "";
  if (!state.pathEdit)
    return `<section class="path-properties"><h3>CAMINHO</h3><button class="path-primary" data-path-enter ${entry.locked ? "disabled" : ""}>${entry.node.tag === "path" ? "Editar vértices" : "Converter em caminho e editar"}</button><p class="micro">Enter ou duplo clique para editar pontos e alças.${entry.node.tag === "path" ? "" : " A conversão pode ser desfeita."}</p></section>`;
  const contours = pathFromNode(entry.node),
    edit = state.pathEdit;
  edit.contour = Math.min(edit.contour, contours.length - 1);
  const contour = contours[edit.contour];
  edit.index = Math.min(edit.index, contour.points.length - 1);
  const p = contour.points[edit.index],
    disabled = entry.locked ? "disabled" : "";
  return `<section class="path-properties"><div class="path-heading"><h3>EDITAR VÉRTICES</h3><button data-path-done>Concluir</button></div><label class="scene-field">Contorno<select data-path-contour>${contours.map((c, i) => `<option value="${i}" ${i === edit.contour ? "selected" : ""}>${i + 1} · ${c.closed ? "Fechado" : "Aberto"} · ${c.points.length} pontos</option>`).join("")}</select></label><div class="path-actions"><button data-path-op="close">${contour.closed ? "Abrir caminho" : "Fechar caminho"}</button><button data-path-op="reverse">Inverter direção</button></div><h3>VÉRTICE ${edit.index + 1} / ${contour.points.length}</h3><div class="property-grid">${["x", "y"].map((key) => `<label class="property">${key.toUpperCase()}<input aria-label="Vértice ${key.toUpperCase()}" data-vertex-coordinate="${key}" type="number" step="0.1" value="${Number(p[key].toFixed(4))}" ${disabled}></label>`).join("")}</div><h3>TIPO DE VÉRTICE</h3>${vertexModeBar(edit.mode, entry.locked)}<div class="path-actions"><button data-path-op="insert">Inserir ponto após</button><button data-path-op="delete">Excluir vértice</button></div><p class="micro">Arraste pontos e alças. Duplo clique no segmento insere um ponto. Alt solta a alça. Delete exclui o ponto; Esc sai ou cancela o arraste.</p></section>`;
}

export function bindPathInspector(state, callbacks) {
  const { render, commit, notify } = callbacks;
  document
    .querySelector("[data-path-enter]")
    ?.addEventListener("click", () => startPathEditing(state, callbacks));
  document.querySelector("[data-path-done]")?.addEventListener("click", () => {
    state.pathEdit = null;
    state.tool = "select";
    render();
  });
  if (!state.pathEdit) return;
  const apply = (operation) => {
    try {
      const entry = entryFor(state);
      if (!entry || entry.locked) throw new Error("Objeto bloqueado ou ausente.");
      const geometry = pathFromNode(entry.node),
        edit = state.pathEdit,
        contour = geometry[edit.contour];
      operation(contour, edit);
      editScene(state.scene, edit.id, "path", serializePath(geometry));
      commit();
      render();
    } catch (error) {
      notify(error.message);
      render();
    }
  };
  const selector = document.querySelector("[data-path-contour]");
  if (selector)
    selector.onchange = () => {
      state.pathEdit.contour = Number(selector.value);
      state.pathEdit.index = 0;
      state.pathEdit.mode = inferVertexMode(
        pathFromNode(entryFor(state).node)[state.pathEdit.contour].points[0],
      );
      render();
    };
  document.querySelectorAll("[data-vertex-coordinate]").forEach((input) => {
    input.onchange = () =>
      apply((contour, edit) => {
        const value = Number(input.value);
        if (!input.value.trim() || !Number.isFinite(value))
          throw new Error("Informe uma coordenada válida.");
        const p = contour.points[edit.index];
        moveVertex(
          p,
          input.dataset.vertexCoordinate === "x" ? value : p.x,
          input.dataset.vertexCoordinate === "y" ? value : p.y,
        );
      });
  });
  document.querySelectorAll("button[data-vertex-mode]").forEach((button) => {
    button.onclick = () => {
      const mode = button.dataset.vertexMode;
      apply((contour, edit) => {
        setVertexType(contour, edit.index, mode);
        edit.mode = mode;
      });
      document.querySelector(`button[data-vertex-mode="${mode}"]`)?.focus({ preventScroll: true });
    };
    button.onkeydown = (event) => {
      if (["Enter", " "].includes(event.key)) event.stopPropagation();
    };
  });
  document.querySelectorAll("[data-path-op]").forEach((button) => {
    button.onclick = () =>
      apply((contour, edit) => {
        switch (button.dataset.pathOp) {
          case "close":
            if (!contour.closed && contour.points.length < 3)
              throw new Error("São necessários três pontos para fechar.");
            contour.closed = !contour.closed;
            break;
          case "reverse":
            reverseContour(contour);
            edit.index = contour.points.length - 1 - edit.index;
            break;
          case "delete":
            deleteVertex(contour, edit.index);
            edit.index = Math.min(edit.index, contour.points.length - 1);
            break;
          case "insert":
            edit.index = splitSegment(
              contour,
              !contour.closed && edit.index === contour.points.length - 1
                ? edit.index - 1
                : edit.index,
            );
            break;
        }
      });
  });
}

export function bindPathCanvas(svg, state, callbacks) {
  const { render, commit, notify } = callbacks;
  const entry = entryFor(state),
    wrapper = Array.from(svg.querySelectorAll("[data-object]")).find(
      (el) => el.dataset.object === state.selected,
    ),
    shape = wrapper?.firstElementChild;
  if (!entry || entry.locked || !entry.visible || !shape) return () => {};
  const base = pathFromNode(entry.node),
    original = shape.getAttribute("d");
  let geometry = structuredClone(base),
    drag = null;
  const controller = new AbortController(),
    { signal } = controller,
    ns = "http://www.w3.org/2000/svg";
  const overlay = document.createElementNS(ns, "g");
  overlay.classList.add("vertex-overlay");
  svg.append(overlay);
  svg.setAttribute("tabindex", "-1");
  const element = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    overlay.append(el);
    return el;
  };
  function matrices() {
    const screen = shape.getScreenCTM(),
      root = svg.getScreenCTM();
    if (!screen || !root || Math.abs(screen.a * screen.d - screen.b * screen.c) < 1e-12)
      return null;
    return { screen, root, localToRoot: root.inverse().multiply(screen) };
  }
  function draw() {
    overlay.replaceChildren();
    const m = matrices();
    if (!m) return;
    const scale = Math.max(Math.hypot(m.root.a, m.root.b), 0.001),
      radius = 4 / scale;
    const position = (p) => new DOMPoint(p.x, p.y).matrixTransform(m.localToRoot);
    geometry.forEach((contour, ci) => {
      contour.points.forEach((p, pi) => {
        const center = position(p),
          active = ci === state.pathEdit.contour && pi === state.pathEdit.index;
        if (active)
          for (const side of ["in", "out"])
            if (p[side]) {
              const handle = position(p[side]);
              element("line", {
                x1: center.x,
                y1: center.y,
                x2: handle.x,
                y2: handle.y,
                class: "vertex-arm",
                "pointer-events": "none",
              });
              element("circle", {
                cx: handle.x,
                cy: handle.y,
                r: radius,
                class: "vertex-handle",
                "data-vertex-contour": ci,
                "data-vertex-index": pi,
                "data-vertex-part": side,
              });
            }
        element("rect", {
          x: center.x - radius,
          y: center.y - radius,
          width: radius * 2,
          height: radius * 2,
          rx: 1 / scale,
          class: `vertex-anchor${active ? " is-active" : ""}`,
          "data-vertex-contour": ci,
          "data-vertex-index": pi,
          "data-vertex-part": "anchor",
        });
      });
    });
  }
  function dispose() {
    controller.abort();
    overlay.remove();
    shape.setAttribute("d", original);
    if (drag && svg.hasPointerCapture(drag.pointerId)) svg.releasePointerCapture(drag.pointerId);
    drag = null;
  }
  function finish(keep) {
    const pending = drag;
    drag = null;
    if (pending && svg.hasPointerCapture(pending.pointerId))
      svg.releasePointerCapture(pending.pointerId);
    try {
      if (keep && pending?.moved) {
        editScene(state.scene, entry.node.id, "path", serializePath(geometry));
        commit();
      }
    } catch (error) {
      notify(error.message);
    }
    render();
  }
  const local = (event) => {
    const m = matrices();
    return m
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(m.screen.inverse())
      : null;
  };
  svg.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || drag) return;
      const target = event.target.closest("[data-vertex-part]");
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      svg.focus({ preventScroll: true });
      const p = local(event);
      if (!p) return;
      const ci = Number(target.dataset.vertexContour),
        pi = Number(target.dataset.vertexIndex);
      if (state.pathEdit.contour !== ci || state.pathEdit.index !== pi)
        state.pathEdit.mode = inferVertexMode(base[ci].points[pi]);
      state.pathEdit.contour = ci;
      state.pathEdit.index = pi;
      drag = {
        pointerId: event.pointerId,
        part: target.dataset.vertexPart,
        start: p,
        client: { x: event.clientX, y: event.clientY },
        moved: false,
      };
      geometry = structuredClone(base);
      svg.setPointerCapture(event.pointerId);
      draw();
    },
    { signal },
  );
  function move(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const end = local(event);
    if (!end) return;
    geometry = structuredClone(base);
    const edit = state.pathEdit,
      p = geometry[edit.contour].points[edit.index];
    const dx = end.x - drag.start.x,
      dy = end.y - drag.start.y;
    drag.moved = Math.hypot(event.clientX - drag.client.x, event.clientY - drag.client.y) > 2;
    if (drag.part === "anchor") moveVertex(p, p.x + dx, p.y + dy);
    else {
      const h = p[drag.part];
      moveHandle(p, drag.part, h.x + dx, h.y + dy, event.altKey ? "detached" : edit.mode);
    }
    shape.setAttribute("d", serializePath(geometry));
    draw();
  }
  svg.addEventListener("pointermove", move, { signal });
  svg.addEventListener(
    "pointerup",
    (event) => {
      if (drag && event.pointerId === drag.pointerId) {
        move(event);
        finish(true);
      }
    },
    { signal },
  );
  svg.addEventListener(
    "pointercancel",
    () => {
      if (drag) finish(false);
    },
    { signal },
  );
  svg.addEventListener(
    "lostpointercapture",
    () => {
      if (drag) finish(false);
    },
    { signal },
  );
  window.addEventListener(
    "blur",
    () => {
      if (drag) finish(false);
    },
    { signal },
  );
  svg.addEventListener(
    "dblclick",
    (event) => {
      if (event.target.closest("[data-vertex-part]")) return;
      const m = matrices();
      if (!m) return;
      let nearest = null;
      base.forEach((contour, ci) => {
        const segments = contour.points.length - (contour.closed ? 0 : 1);
        for (let index = 0; index < segments; index++)
          for (let step = 1; step < 40; step++) {
            const t = step / 40,
              p = pointOnSegment(contour, index, t),
              screen = new DOMPoint(p.x, p.y).matrixTransform(m.screen),
              distance = Math.hypot(screen.x - event.clientX, screen.y - event.clientY);
            if (distance < 10 && (!nearest || distance < nearest.distance))
              nearest = { ci, index, t, distance };
          }
      });
      if (!nearest) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        const draft = structuredClone(base);
        state.pathEdit.contour = nearest.ci;
        state.pathEdit.index = splitSegment(draft[nearest.ci], nearest.index, nearest.t);
        editScene(state.scene, entry.node.id, "path", serializePath(draft));
        commit();
        render();
      } catch (error) {
        notify(error.message);
      }
    },
    { signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.target.closest(
          'input,select,textarea,[contenteditable="true"],.rail,.vertex-mode-bar',
        ) ||
        document.querySelector("dialog[open]")
      )
        return;
      if (
        ![
          "Escape",
          "Enter",
          "Delete",
          "Backspace",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(event.key)
      )
        return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (drag) {
        if (event.key === "Escape") finish(false);
        return;
      }
      if (["Escape", "Enter"].includes(event.key)) {
        state.pathEdit = null;
        state.tool = "select";
        render();
        return;
      }
      try {
        const draft = structuredClone(base),
          edit = state.pathEdit,
          contour = draft[edit.contour];
        if (["Delete", "Backspace"].includes(event.key)) {
          deleteVertex(contour, edit.index);
          edit.index = Math.min(edit.index, contour.points.length - 1);
        } else {
          const p = contour.points[edit.index],
            step = event.shiftKey ? 10 : 1;
          moveVertex(
            p,
            p.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
            p.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
          );
        }
        editScene(state.scene, entry.node.id, "path", serializePath(draft));
        commit();
        render();
      } catch (error) {
        notify(error.message);
      }
    },
    { signal, capture: true },
  );
  draw();
  return dispose;
}
