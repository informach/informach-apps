import assert from "node:assert/strict";
import { test } from "node:test";
import { lottieGradientFixture } from "../../tests/lottieGradientFixture";
import {
  createAppearanceResolver,
  createPaintResolver,
  inheritedAppearance,
  inheritedGradients,
} from "./appearance";
import { executeDocumentTransaction } from "./documentCommands";
import { newProject, parseProject } from "./project";
import { editScene, renderScene } from "./scene.js";

test("bulk typed paints share one snapshot index, preserve channel override rules and return owned containers", () => {
  const fixture = lottieGradientFixture("hierarchy"),
    scene = fixture.project.artboards[0]?.scene,
    parent = scene?.nodes[0],
    child = parent?.children[0];
  assert.ok(scene && parent?.gradients?.fill && child);
  const before = JSON.stringify(scene),
    resolver = createPaintResolver(scene),
    first = resolver.gradients(child);
  assert.deepEqual(first, inheritedGradients(scene, child));
  assert.equal(first.fill, parent.gradients.fill);
  delete first.fill;
  assert.equal(resolver.gradients(child).fill, parent.gradients.fill);
  assert.deepEqual(resolver.appearance(child), inheritedAppearance(scene, child));
  assert.throws(() => resolver.gradients({ ...child, id: "node-missing" }), /ausente/);
  assert.equal(JSON.stringify(scene), before);
  const next = structuredClone(scene),
    nextChild = next.nodes[0]?.children[0];
  assert.ok(nextChild);
  nextChild.attrs.fill = "#123456";
  assert.equal(createPaintResolver(next).gradients(nextChild).fill, undefined);
  assert.equal(resolver.gradients(child).fill, parent.gradients.fill);
});

test("bulk appearance resolves inheritance once per immutable snapshot and returns independent values", () => {
  const project = newProject(),
    board = project.artboards[0];
  assert.ok(board);
  editScene(board.scene, null, "add", "rect");
  const node = board.scene.nodes[0];
  assert.ok(node);
  node.attrs.fill = "inherit";
  node.attrs.stroke = "none";
  board.scene.nodes = [
    {
      ...structuredClone(node),
      id: "node-appearance-parent",
      tag: "g",
      attrs: { fill: "red", stroke: "blue" },
      children: [node],
    },
  ];
  const before = structuredClone(board.scene),
    resolve = createAppearanceResolver(board.scene),
    first = resolve(node);
  assert.equal(first.fill, "red");
  assert.equal(first.stroke, "none");
  first.fill = "blue";
  assert.equal(resolve(node).fill, "red");
  assert.deepEqual(resolve(node), inheritedAppearance(board.scene, node));
  assert.deepEqual(board.scene, before);
  assert.throws(() => resolve({ ...node, id: "node-not-in-scene" }), /ausente/);
});

test("palette and reusable appearance copies persist, respect locks and undo ownership without introducing active SVG", () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  const targetId = editScene(board.scene, null, "add", "rect");
  const sessionId = crypto.randomUUID();
  const before = structuredClone(project);
  const commands = [
    { type: "appearance", operation: "palette", colors: ["#4fe3c1", "#ffffff"] },
    {
      type: "appearance",
      operation: "save-style",
      style: { id: "style-mint", name: "Menta", attrs: { fill: "#123456", stroke: "none" } },
    },
    { type: "appearance", operation: "apply-style", styleId: "style-mint", targetIds: [targetId] },
  ];
  const result = executeDocumentTransaction(
    { project, sessionId, revision: 0 },
    { projectId: project.id, sessionId, revision: 0, commands },
  );
  assert.deepEqual(project, before);
  assert.equal(result.project.artboards[0]?.scene.nodes[0]?.attrs.fill, "#123456");
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(result.project))), result.project);
  for (const bad of [
    { type: "appearance", operation: "palette", colors: ["#ffffff", "#FFFFFF"] },
    {
      type: "appearance",
      operation: "save-style",
      style: { id: "style-x", name: "Unsafe", attrs: { fill: "url(https://x)" } },
    },
    {
      type: "appearance",
      operation: "save-style",
      style: { id: "style-x", name: "Unsafe", attrs: { d: "M0 0" } },
    },
  ])
    assert.throws(() =>
      executeDocumentTransaction(
        { project, sessionId, revision: 0 },
        { projectId: project.id, sessionId, revision: 0, commands: [bad] },
      ),
    );
  const next = result.project.artboards[0]?.scene.nodes[0];
  if (!next) throw new Error("Missing object");
  next.locked = true;
  assert.throws(
    () =>
      executeDocumentTransaction(
        { project: result.project, sessionId, revision: 1 },
        { projectId: project.id, sessionId, revision: 1, commands: [commands[2]] },
      ),
    /bloqueado/,
  );
  const original = board.scene.nodes[0];
  if (!original) throw new Error("Missing original object");
  assert.equal(inheritedAppearance(board.scene, original).fill, "#4fe3c1");
});

test("multiline text retains dynamic text, native bidi shaping, escaping and bounded expansion", () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  const targetId = editScene(board.scene, null, "add", "text");
  const sessionId = crypto.randomUUID();
  const result = executeDocumentTransaction(
    { project, sessionId, revision: 0 },
    {
      projectId: project.id,
      sessionId,
      revision: 0,
      commands: [
        { type: "scene", operation: "text", targetId, value: "Olá <&>\nمرحبا\n" },
        { type: "scene", operation: "text-layout", targetId, value: { lineHeight: 1.5 } },
        {
          type: "scene",
          operation: "attrs",
          targetId,
          value: { direction: "rtl", "font-weight": "700", "letter-spacing": "2" },
        },
      ],
    },
  );
  const scene = result.project.artboards[0]?.scene;
  if (!scene) throw new Error("Missing scene");
  assert.match(renderScene(scene), /Olá &lt;&amp;&gt;/);
  assert.equal(renderScene(scene).match(/<tspan /g)?.length, 3);
  assert.match(renderScene(scene), /dy="1.5em"/);
  assert.match(renderScene(scene), /direction="rtl"/);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(result.project))), result.project);
  const text = scene.nodes[0];
  if (!text) throw new Error("Missing text");
  text.text = "a\n".repeat(200);
  assert.throws(() => parseProject(result.project), /linhas/);
});
