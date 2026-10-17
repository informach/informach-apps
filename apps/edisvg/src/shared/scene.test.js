import assert from "node:assert/strict";
import { test } from "node:test";
import { createHistory } from "./history.js";
import { newProject, parseProject } from "./project.js";
import { editScene, flattenScene, identity, renderScene, validateScene } from "./scene.js";

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

test("rename preserves geometry, survives undo and rejects invalid or locked changes", () => {
  const project = { ...newProject(), scene: scene() },
    history = createHistory(project);
  const before = structuredClone(project.scene.nodes[0]);
  editScene(project.scene, "node-1", "rename", "  My shape  ");
  history.commit(project);
  assert.equal(project.scene.nodes[0].name, "My shape");
  assert.deepEqual(project.scene.nodes[0].attrs, before.attrs);
  assert.equal(history.undo().scene.nodes[0].name, before.name);
  assert.equal(history.redo().scene.nodes[0].name, "My shape");
  for (const value of ["", " ", "x".repeat(121), null])
    assert.throws(() => editScene(project.scene, "node-1", "rename", value));
  project.scene.nodes[0].locked = true;
  assert.throws(() => editScene(project.scene, "node-1", "rename", "Locked"));
  assert.equal(project.scene.nodes[0].name, "My shape");
});
test("object creation, painting, ordering and deletion survive history and serialization", () => {
  const p = newProject(),
    h = createHistory(p);
  for (const tag of ["rect", "circle", "line", "text"]) editScene(p.scene, null, "add", tag);
  const id = p.scene.nodes[3].id;
  editScene(p.scene, id, "text", "<hello>");
  editScene(p.scene, id, "attrs", { fill: "#123456" });
  editScene(p.scene, id, "back");
  assert.equal(p.scene.nodes[0].id, id);
  h.commit(p);
  editScene(p.scene, id, "delete");
  h.commit(p);
  assert.equal(h.undo().scene.nodes.length, 4);
  assert.equal(h.redo().scene.nodes.length, 3);
  assert.equal(parseProject(JSON.parse(JSON.stringify(p))).scene.nodes.length, 3);
});
test("duplicate renews nested IDs and locked groups cannot be edited", () => {
  const s = scene();
  s.nodes = [{ ...node(), id: "node-parent", tag: "g", children: [node()] }];
  const id = editScene(s, "node-parent", "duplicate");
  assert.notEqual(s.nodes[1].children[0].id, "node-1");
  assert.equal(s.nodes[1].id, id);
  assert.equal(s.nodes[1].transform.x, 20);
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
  assert.equal(project.version, 2);
  assert.deepEqual(project.scene.nodes, []);
  assert.deepEqual(project.keys, []);
  assert.equal(project.name, "Sem título");
  assert.equal(parseProject({ ...project, version: 1, scene: undefined }).scene, null);
});
test("scene and per-object changes survive save/open and undo", () => {
  const project = { ...newProject(), scene: scene() },
    h = createHistory(project);
  project.scene.nodes[0].transform.x = 25;
  project.scene.nodes[0].visible = false;
  h.commit(project);
  const reopened = parseProject(JSON.parse(JSON.stringify(project)));
  assert.equal(reopened.scene.nodes[0].transform.x, 25);
  assert.equal(reopened.scene.nodes[0].visible, false);
  assert.equal(h.undo().scene.nodes[0].transform.x, 0);
  assert.match(renderScene(reopened.scene), /display="none"/);
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
  editScene(p.scene, null, "add", { tag: "rect", attrs });
  history.commit(p);
  assert.equal(history.undo().scene.nodes.length, 0);
  assert.deepEqual(history.redo().scene.nodes[0].attrs, { fill: "#4fe3c1", ...attrs });
  const before = JSON.stringify(p.scene);
  assert.throws(() =>
    editScene(p.scene, null, "add", { tag: "rect", attrs: { onclick: "alert(1)" } }),
  );
  assert.equal(JSON.stringify(p.scene), before);
});
