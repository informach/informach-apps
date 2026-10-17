import assert from "node:assert/strict";
import { test } from "node:test";
import { createHistory } from "../../shared/history.js";
import { newProject, parseProject } from "../../shared/project.js";
import { bindPenTool, pathFromAnchors } from "./penTool.js";

const anchor = (x, y, dx = 0, dy = 0) => ({ x, y, dx, dy });
test("pen creates open and closed paths and symmetric Bezier handles", () => {
  assert.equal(pathFromAnchors([anchor(0, 0), anchor(40, 20)]), "M0 0 L40 20");
  assert.equal(
    pathFromAnchors([anchor(0, 0, 10, 0), anchor(40, 20, 0, 5)]),
    "M0 0 C10 0 40 15 40 20",
  );
  assert.equal(
    pathFromAnchors([anchor(0, 0), anchor(40, 0), anchor(40, 40)], true),
    "M0 0 L40 0 L40 40 L0 0 Z",
  );
  for (const anchors of [
    [],
    [anchor(0, 0)],
    [anchor(NaN, 0), anchor(0, 0)],
    [anchor(Infinity, 0), anchor(0, 0)],
  ]) {
    assert.throws(() => pathFromAnchors(anchors));
  }
});

// DOM adapter tests use real EventTarget/AbortController; no Electron or global user data.
class Element extends EventTarget {
  children = [];
  attrs = {};
  captured = new Set();
  classList = { add() {} };
  setAttribute(key, value) {
    this.attrs[key] = String(value);
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
  closest() {
    return null;
  }
  focus() {}
  getScreenCTM() {
    return {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      inverse() {
        return this;
      },
    };
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
}
function emit(target, type, values = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { button: 0, pointerId: 1, ...values });
  target.dispatchEvent(event);
}

test("pen gestures keep drafts out of storage, commit once and clean up on cancellation", (t) => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    DOMPoint: globalThis.DOMPoint,
  };
  const document = new Element();
  document.createElementNS = () => new Element();
  document.querySelector = () => null;
  globalThis.document = document;
  globalThis.window = new Element();
  globalThis.DOMPoint = class {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
    matrixTransform() {
      return this;
    }
  };
  t.after(() => Object.assign(globalThis, previous));
  const project = newProject(),
    history = createHistory(project);
  const state = { scene: project.scene, tool: "pen" };
  let commits = 0,
    renders = 0;
  const callbacks = {
    render() {
      renders++;
    },
    commit() {
      commits++;
      history.commit(project);
    },
    notify(message) {
      throw new Error(message);
    },
  };
  const svg = new Element();
  const dispose = bindPenTool(svg, state, callbacks);
  const point = (x, y) => {
    emit(svg, "pointerdown", { clientX: x, clientY: y });
    emit(svg, "pointerup", { clientX: x, clientY: y });
  };
  point(0, 0);
  point(40, 20);
  assert.equal(project.scene.nodes.length, 0);
  assert.equal(commits, 0);
  emit(document, "keydown", { key: "Enter" });
  assert.equal(commits, 1);
  assert.equal(renders, 1);
  assert.equal(
    parseProject(JSON.parse(JSON.stringify(project))).scene.nodes[0].attrs.d,
    "M0 0 L40 20",
  );
  assert.equal(history.undo().scene.nodes.length, 0);
  assert.equal(history.redo().scene.nodes.length, 1);
  emit(document, "keydown", { key: "Enter" });
  assert.equal(commits, 1, "disposed listeners cannot commit twice");
  assert.equal(svg.children.length, 0);
  dispose();

  for (const reason of ["Escape", "pointercancel", "blur", "dispose"]) {
    state.tool = "pen";
    const stop = bindPenTool(svg, state, callbacks);
    point(10, 10);
    point(80, 80);
    if (reason === "Escape") emit(document, "keydown", { key: "Escape" });
    if (reason === "pointercancel") emit(svg, "pointercancel");
    if (reason === "blur") emit(window, "blur");
    if (reason === "dispose") stop();
    emit(document, "keydown", { key: "Enter" });
    assert.equal(commits, 1, `${reason} leaves no commit listener`);
    assert.equal(svg.children.length, 0);
    assert.equal(svg.captured.size, 0);
    stop();
  }
});
