import assert from "node:assert/strict";
import { test } from "node:test";
import { worldMatrix } from "./composition";
import { createHistory } from "./history.js";
import { newProject, PROJECT_VERSION, parseProject } from "./project.js";
import {
  editScene,
  flattenScene,
  identity,
  renderScene,
  validAttributes,
  validateScene,
} from "./scene.js";

const node = () => ({
  id: "node-1",
  tag: "rect",
  name: "Retângulo",
  attrs: { x: "0", y: "0", width: "50", height: "40", fill: "#00ff00" },
  transform: identity(),
  children: [],
  visible: true,
  locked: false,
});
const scene = () => ({ viewBox: [0, 0, 100, 100], nodes: [node()] });
function projectWithScene(value) {
  const project = newProject();
  project.artboards[0].scene = value;
  return parseProject(project);
}

test("aspect ratio survives project roundtrip and SVG serialization", () => {
  for (const preserveAspectRatio of ["none", "xMinYMax slice", "xMidYMid meet"]) {
    const project = projectWithScene({ ...scene(), preserveAspectRatio });
    const restored = parseProject(JSON.parse(JSON.stringify(project)));
    assert.equal(restored.artboards[0].scene.preserveAspectRatio, preserveAspectRatio);
    assert.ok(
      renderScene(restored.artboards[0].scene).includes(
        `preserveAspectRatio="${preserveAspectRatio}"`,
      ),
    );
  }
  assert.throws(() => validateScene({ ...scene(), preserveAspectRatio: "invalid" }));
});

test("transform coefficients must be finite and have the correct arity", () => {
  for (const transform of [
    "matrix(1e999 0 0 1 0 0)",
    "translate(1 2 3)",
    "rotate(30 10)",
    "scale(1..2)",
  ])
    assert.throws(() => validAttributes({ transform }));
  assert.equal(
    validAttributes({ transform: "matrix(1 0 0 1 2 3) rotate(30 10 20)" }).transform,
    "matrix(1 0 0 1 2 3) rotate(30 10 20)",
  );
});
test("aggregate geometry/attribute budgets reject oversized scenes before publication", () => {
  const d = "M0 0" + "L1 1".repeat(1000);
  const nodes = Array.from({ length: 101 }, (_, index) => ({
    ...node(),
    id: `node-${index}`,
    tag: "path",
    attrs: { d },
  }));
  assert.throws(() => validateScene({ viewBox: [0, 0, 100, 100], nodes }), /orçamento agregado/);
  const large = "Arial".repeat(100000);
  assert.throws(
    () =>
      validateScene({
        viewBox: [0, 0, 100, 100],
        nodes: Array.from({ length: 9 }, (_, index) => ({
          ...node(),
          id: `node-${index}`,
          attrs: { "font-family": large },
        })),
      }),
    /orçamento agregado/,
  );
});

test("rename preserves geometry, survives undo and rejects invalid or locked changes", () => {
  const project = projectWithScene(scene()),
    history = createHistory(project);
  const before = structuredClone(project.artboards[0].scene.nodes[0]);
  editScene(project.artboards[0].scene, "node-1", "rename", "  My shape  ");
  history.commit(project);
  assert.equal(project.artboards[0].scene.nodes[0].name, "My shape");
  assert.deepEqual(project.artboards[0].scene.nodes[0].attrs, before.attrs);
  assert.equal(history.undo().artboards[0].scene.nodes[0].name, before.name);
  assert.equal(history.redo().artboards[0].scene.nodes[0].name, "My shape");
  for (const value of ["", " ", "x".repeat(121), null])
    assert.throws(() => editScene(project.artboards[0].scene, "node-1", "rename", value));
  project.artboards[0].scene.nodes[0].locked = true;
  assert.throws(() => editScene(project.artboards[0].scene, "node-1", "rename", "Locked"));
  assert.equal(project.artboards[0].scene.nodes[0].name, "My shape");
});
test("object creation, painting, ordering and deletion survive history and serialization", () => {
  const p = newProject(),
    h = createHistory(p);
  for (const tag of ["rect", "circle", "line", "text"])
    editScene(p.artboards[0].scene, null, "add", tag);
  const id = p.artboards[0].scene.nodes[3].id;
  editScene(p.artboards[0].scene, id, "text", "<hello>");
  editScene(p.artboards[0].scene, id, "attrs", { fill: "#123456" });
  editScene(p.artboards[0].scene, id, "back");
  assert.equal(p.artboards[0].scene.nodes[0].id, id);
  h.commit(p);
  editScene(p.artboards[0].scene, id, "delete");
  h.commit(p);
  assert.equal(h.undo().artboards[0].scene.nodes.length, 4);
  assert.equal(h.redo().artboards[0].scene.nodes.length, 3);
  assert.equal(parseProject(JSON.parse(JSON.stringify(p))).artboards[0].scene.nodes.length, 3);
});
test("duplicate renews nested IDs and locked groups cannot be edited", () => {
  const s = scene();
  s.nodes = [{ ...node(), id: "node-parent", tag: "g", children: [node()] }];
  const id = editScene(s, "node-parent", "duplicate");
  assert.notEqual(s.nodes[1].children[0].id, "node-1");
  assert.equal(s.nodes[1].id, id);
  assert.equal(worldMatrix(s, id)[4], 20);
  assert.equal(s.nodes[0].transform.x, 0);
  s.nodes[0].locked = true;
  const before = JSON.stringify(s);
  for (const op of ["delete", "duplicate", "front", "back", "attrs"])
    assert.throws(() => editScene(s, "node-1", op, {}));
  assert.equal(JSON.stringify(s), before);
});
test("invalid object edits leave the original scene intact", () => {
  const s = scene(),
    before = JSON.stringify(s);
  assert.throws(() => editScene(s, "node-1", "attrs", { fill: "url(https://example.com)" }));
  assert.throws(() => editScene(s, null, "add", "script"));
  assert.equal(JSON.stringify(s), before);
});

test("movement is atomic, rejects invalid transforms and respects inherited locks", () => {
  const s = scene(),
    before = JSON.stringify(s);
  assert.throws(() => editScene(s, "node-1", "transform", { x: Infinity }));
  assert.equal(JSON.stringify(s), before);
  editScene(s, "node-1", "transform", { x: 37, y: -18 });
  assert.equal(s.nodes[0].transform.x, 37);
  s.nodes = [{ ...node(), id: "node-parent", tag: "g", locked: true, children: s.nodes }];
  assert.throws(() => editScene(s, "node-1", "transform", { x: 2 }));
  assert.equal(s.nodes[0].children[0].transform.x, 37);
});
test("new project has empty scene and no demo geometry or keyframes", () => {
  const project = newProject();
  assert.equal(project.version, PROJECT_VERSION);
  assert.deepEqual(project.artboards[0].scene.nodes, []);
  assert.deepEqual(project.keys, []);
  assert.equal(project.name, "Sem título");
  const { assets: _assets, ...legacy } = project;
  assert.equal(parseProject({ ...legacy, version: 1, scene: undefined }).artboards.length, 0);
});
test("scene and per-object changes survive save/open and undo", () => {
  const project = projectWithScene(scene()),
    h = createHistory(project);
  project.artboards[0].scene.nodes[0].transform.x = 25;
  project.artboards[0].scene.nodes[0].visible = false;
  h.commit(project);
  const reopened = parseProject(JSON.parse(JSON.stringify(project)));
  assert.equal(reopened.artboards[0].scene.nodes[0].transform.x, 25);
  assert.equal(reopened.artboards[0].scene.nodes[0].visible, false);
  assert.equal(h.undo().artboards[0].scene.nodes[0].transform.x, 0);
  assert.match(renderScene(reopened.artboards[0].scene), /display="none"/);
});
test("untrusted project scenes cannot inject active SVG attributes or elements", () => {
  for (const attrs of [
    { onclick: "alert(1)" },
    { href: "https://evil.test" },
    { style: "background:red" },
    { fill: "url(https://evil.test)" },
    { transform: "translate(0) url(x)" },
  ])
    assert.throws(() => validateScene({ ...scene(), nodes: [{ ...node(), attrs }] }));
  for (const tag of ["script", "foreignObject", "image", "use", "style"])
    assert.throws(() => validateScene({ ...scene(), nodes: [{ ...node(), tag }] }));
  assert.throws(() => validateScene({ ...scene(), nodes: [node(), node()] }));
  const text = { ...node(), tag: "text", text: "<script>alert(1)</script>" };
  assert.match(renderScene({ ...scene(), nodes: [text] }), /&lt;script&gt;/);
});
test("groups preserve inheritance and parent locks", () => {
  const group = { ...node(), id: "node-group", tag: "g", locked: true, children: [node()] };
  const parsed = validateScene({ ...scene(), nodes: [group] });
  const flat = flattenScene(parsed);
  assert.equal(flat.length, 2);
  assert.equal(flat[1].locked, true);
  assert.equal(flat[1].depth, 1);
  assert.match(renderScene(parsed), /fill="#00ff00"/);
});

test("canvas geometry supports reverse drags and atomic history for positioned shapes", async () => {
  const { shapeAttributes } = await import("../renderer/src/canvasTools.js");
  const attrs = shapeAttributes("rect", { x: 100, y: 80 }, { x: 20, y: 30 });
  assert.deepEqual(attrs, { x: "20", y: "30", width: "80", height: "50" });
  assert.deepEqual(shapeAttributes("rect", { x: 100, y: 80 }, { x: 20, y: 30 }, true), {
    x: "20",
    y: "0",
    width: "80",
    height: "80",
  });
  assert.deepEqual(shapeAttributes("line", { x: -10, y: 5 }, { x: 20, y: 5 }), {
    x1: "-10",
    y1: "5",
    x2: "20",
    y2: "5",
  });
  assert.deepEqual(shapeAttributes("circle", { x: 0, y: 0 }, { x: 40, y: 40 }), {
    cx: "20",
    cy: "20",
    r: "20",
  });
  const p = newProject(),
    history = createHistory(p);
  editScene(p.artboards[0].scene, null, "add", { tag: "rect", attrs });
  history.commit(p);
  assert.equal(history.undo().artboards[0].scene.nodes.length, 0);
  assert.deepEqual(history.redo().artboards[0].scene.nodes[0].attrs, { fill: "#4fe3c1", ...attrs });
  const before = JSON.stringify(p.artboards[0].scene);
  assert.throws(() =>
    editScene(p.artboards[0].scene, null, "add", { tag: "rect", attrs: { onclick: "alert(1)" } }),
  );
  assert.equal(JSON.stringify(p.artboards[0].scene), before);
});
