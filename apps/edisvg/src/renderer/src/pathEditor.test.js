import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePath } from "../../shared/pathGeometry.js";
import { identity } from "../../shared/scene.js";
import {
  bindPathCanvas,
  bindPathInspector,
  inferVertexMode,
  synchronizePathEditing,
  vertexModeBar,
} from "./pathEditor.js";

test("vertex mode inference distinguishes corners and handle constraints", () => {
  const p = { x: 10, y: 20, in: null, out: null };
  assert.equal(inferVertexMode(p), "straight");
  p.in = { x: 0, y: 20 };
  assert.equal(inferVertexMode(p), "detached");
  p.out = { x: 20, y: 20 };
  assert.equal(inferVertexMode(p), "mirrored");
  p.out = { x: 30, y: 20 };
  assert.equal(inferVertexMode(p), "asymmetric");
  p.out = { x: 30, y: 21 };
  assert.equal(inferVertexMode(p), "detached");
  p.out = { x: 5, y: 20 };
  assert.equal(inferVertexMode(p), "detached");
  p.out = { x: 20, y: 20.00000001 };
  assert.equal(inferVertexMode(p), "mirrored");
});

test("vertex toolbar exposes four accessible buttons and a single active mode", () => {
  const html = vertexModeBar("mirrored");
  assert.deepEqual(
    [...html.matchAll(/data-vertex-mode="([^"]+)"/g)].map((m) => m[1]),
    ["straight", "mirrored", "detached", "asymmetric"],
  );
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(html, /data-vertex-mode="mirrored"[^>]*aria-pressed="true"/);
  assert.equal((vertexModeBar("straight", true).match(/ disabled>/g) || []).length, 4);
});

test("vertex mode buttons change geometry once and preserve keyboard focus", (t) => {
  const previous = globalThis.document;
  t.after(() => {
    globalThis.document = previous;
  });
  let focused = null,
    commits = 0;
  const buttons = ["straight", "mirrored", "detached", "asymmetric"].map((mode) => ({
    dataset: { vertexMode: mode },
    focus() {
      focused = mode;
    },
  }));
  globalThis.document = {
    querySelectorAll: (selector) => (selector === "button[data-vertex-mode]" ? buttons : []),
    querySelector: (selector) =>
      buttons.find(
        (button) => selector === `button[data-vertex-mode="${button.dataset.vertexMode}"]`,
      ) || null,
  };
  const node = {
    id: "node-path",
    tag: "path",
    name: "Path",
    attrs: { d: "M0 0L20 20L40 0" },
    transform: identity(),
    visible: true,
    children: [],
  };
  const state = {
    scene: { viewBox: [0, 0, 100, 100], nodes: [node] },
    selected: node.id,
    pathEdit: { id: node.id, contour: 0, index: 1, mode: "straight" },
  };
  bindPathInspector(state, {
    render() {},
    commit() {
      commits++;
    },
    notify(message) {
      assert.fail(message);
    },
  });
  buttons[1].onclick();
  assert.equal(inferVertexMode(parsePath(state.scene.nodes[0].attrs.d)[0].points[1]), "mirrored");
  assert.equal(state.pathEdit.mode, "mirrored");
  assert.equal(focused, "mirrored");
  assert.equal(commits, 1);
  buttons[0].onclick();
  assert.equal(inferVertexMode(parsePath(state.scene.nodes[0].attrs.d)[0].points[1]), "straight");
  assert.equal(commits, 2);
  let stopped = false;
  buttons[0].onkeydown({
    key: "Enter",
    stopPropagation() {
      stopped = true;
    },
  });
  assert.equal(stopped, true);
});

class Matrix {
  constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    Object.assign(this, { a, b, c, d, e, f });
  }
  inverse() {
    const { a, b, c, d, e, f } = this,
      det = a * d - b * c;
    return new Matrix(
      d / det,
      -b / det,
      -c / det,
      a / det,
      (c * f - d * e) / det,
      (b * e - a * f) / det,
    );
  }
  multiply(m) {
    const { a, b, c, d, e, f } = this;
    return new Matrix(
      a * m.a + c * m.b,
      b * m.a + d * m.b,
      a * m.c + c * m.d,
      b * m.c + d * m.d,
      a * m.e + c * m.f + e,
      b * m.e + d * m.f + f,
    );
  }
}
class Point {
  constructor(x, y) {
    Object.assign(this, { x, y });
  }
  matrixTransform(m) {
    return new Point(m.a * this.x + m.c * this.y + m.e, m.b * this.x + m.d * this.y + m.f);
  }
}
class Element extends EventTarget {
  attrs = {};
  dataset = {};
  children = [];
  captured = new Set();
  matrix = new Matrix();
  classList = { add() {} };
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key.startsWith("data-"))
      this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] =
        String(value);
  }
  getAttribute(key) {
    return this.attrs[key] ?? null;
  }
  append(child) {
    child.parent = this;
    this.children.push(child);
  }
  replaceChildren() {
    this.children = [];
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  closest(selector) {
    return selector.includes("[data-vertex-part]") && this.dataset.vertexPart ? this : null;
  }
  querySelectorAll() {
    return this.objects || [];
  }
  querySelector() {
    return null;
  }
  getScreenCTM() {
    return this.matrix;
  }
  setPointerCapture(id) {
    this.captured.add(id);
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
  }
  focus() {}
}
function emit(bus, type, target, props = {}) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "target", { value: target || bus });
  Object.assign(event, { button: 0, pointerId: 1, ...props });
  bus.dispatchEvent(event);
  return event;
}
function setup(t, d = "M0 0 C10 0 20 10 30 10 L60 20") {
  const globals = {
    document: globalThis.document,
    window: globalThis.window,
    DOMPoint: globalThis.DOMPoint,
  };
  const doc = new Element(),
    win = new Element();
  doc.createElementNS = () => new Element();
  Object.assign(globalThis, { document: doc, window: win, DOMPoint: Point });
  const node = {
    id: "node-path",
    tag: "path",
    name: "Path",
    attrs: { d, transform: "rotate(90)" },
    transform: identity(),
    visible: true,
    children: [],
  };
  const state = {
    scene: { viewBox: [0, 0, 100, 100], nodes: [node] },
    selected: node.id,
    tool: "select",
    pathEdit: { id: node.id, contour: 0, index: 0, mode: "detached" },
  };
  const svg = new Element(),
    shape = new Element(),
    wrapper = new Element();
  svg.matrix = new Matrix(2, 0, 0, 2, 10, 20);
  shape.matrix = new Matrix(0, 2, -2, 0, 100, 200);
  shape.setAttribute("d", d);
  wrapper.dataset.object = node.id;
  wrapper.firstElementChild = shape;
  svg.objects = [wrapper];
  let commits = 0,
    renders = 0,
    dispose;
  dispose = bindPathCanvas(svg, state, {
    render() {
      renders++;
      dispose();
    },
    commit() {
      commits++;
    },
    notify(message) {
      throw new Error(message);
    },
  });
  t.after(() => {
    dispose();
    Object.assign(globalThis, globals);
  });
  const target = (part = "anchor", index = 0) =>
    svg.children
      .at(-1)
      .children.find(
        (el) => el.dataset.vertexPart === part && el.dataset.vertexIndex === String(index),
      );
  return {
    state,
    svg,
    shape,
    doc,
    win,
    target,
    dispose,
    get commits() {
      return commits;
    },
    get renders() {
      return renders;
    },
  };
}

test("vertex drag converts screen coordinates through zoom and rotation and commits once", (t) => {
  const h = setup(t),
    anchor = h.target();
  // Local origin is screen (100,200); moving (+20,+10) means local (+5,-10).
  emit(h.svg, "pointerdown", anchor, { clientX: 100, clientY: 200 });
  emit(h.svg, "pointermove", h.svg, { clientX: 120, clientY: 210 });
  assert.equal(h.commits, 0);
  assert.equal(h.state.scene.nodes[0].attrs.d, "M0 0 C10 0 20 10 30 10 L60 20");
  emit(h.svg, "pointerup", h.svg, { clientX: 120, clientY: 210 });
  const p = parsePath(h.state.scene.nodes[0].attrs.d)[0].points[0];
  assert.equal(p.x, 5);
  assert.equal(p.y, -10);
  assert.deepEqual(p.out, { x: 15, y: -10 });
  assert.equal(h.commits, 1);
  assert.equal(h.svg.captured.size, 0);
  emit(h.doc, "keydown", h.doc, { key: "Delete" });
  assert.equal(h.commits, 1, "disposed keyboard listener cannot mutate");
});

for (const reason of ["Escape", "pointercancel", "blur", "dispose"])
  test(`vertex preview rolls back on ${reason}`, (t) => {
    const h = setup(t),
      before = JSON.stringify(h.state.scene),
      original = h.shape.getAttribute("d");
    emit(h.svg, "pointerdown", h.target(), { clientX: 100, clientY: 200 });
    emit(h.svg, "pointermove", h.svg, { clientX: 130, clientY: 230 });
    assert.notEqual(h.shape.getAttribute("d"), original);
    if (reason === "Escape") emit(h.doc, "keydown", h.doc, { key: "Escape" });
    if (reason === "pointercancel") emit(h.svg, "pointercancel");
    if (reason === "blur") emit(h.win, "blur");
    if (reason === "dispose") h.dispose();
    assert.equal(JSON.stringify(h.state.scene), before);
    assert.equal(h.shape.getAttribute("d"), original);
    assert.equal(h.commits, 0);
    assert.equal(h.svg.captured.size, 0);
  });

test("handle drag changes only its own side in detached mode", (t) => {
  const h = setup(t);
  emit(h.svg, "pointerdown", h.target("out"), { clientX: 100, clientY: 220 });
  emit(h.svg, "pointerup", h.svg, { clientX: 90, clientY: 240 });
  const points = parsePath(h.state.scene.nodes[0].attrs.d)[0].points;
  assert.deepEqual(points[0].out, { x: 20, y: 5 });
  assert.deepEqual(points[1].in, { x: 20, y: 10 });
  assert.equal(h.commits, 1);
});

test("double clicking an edge inserts a vertex without moving the contour", (t) => {
  const h = setup(t, "M0 0L40 0L40 40Z");
  emit(h.svg, "dblclick", h.shape, { clientX: 100, clientY: 240 });
  const contour = parsePath(h.state.scene.nodes[0].attrs.d)[0];
  assert.equal(contour.points.length, 4);
  assert.equal(contour.closed, true);
  assert.equal(h.commits, 1);
});

test("path edit session is cleared for locked, deleted or non-path selections", () => {
  for (const tag of ["rect", "text"]) {
    const state = {
      scene: { nodes: [{ id: "node-a", tag, visible: true, children: [] }] },
      selected: "node-a",
      tool: "select",
      pathEdit: { id: "node-a" },
    };
    synchronizePathEditing(state);
    assert.equal(state.pathEdit, null);
  }
  const state = {
    scene: {
      nodes: [
        {
          id: "node-a",
          tag: "path",
          attrs: { d: "M0 0L1 1" },
          locked: true,
          visible: true,
          children: [],
        },
      ],
    },
    selected: "node-a",
    tool: "select",
    pathEdit: { id: "node-a" },
  };
  synchronizePathEditing(state);
  assert.equal(state.pathEdit, null);
});
