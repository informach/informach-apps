import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAnimation, transformPoint } from "@informach/edi-motion";
import { firstScene } from "../../tests/fixtures";
import { worldMatrix } from "./composition";
import { executeDocumentTransaction } from "./documentCommands";
import { newProject, parseProject } from "./project";
import { editScene, flattenScene, renderScene } from "./scene.js";

function fixture() {
  const project = newProject();
  if (!firstScene(project)) throw new Error("Missing scene");
  const a = editScene(firstScene(project), null, "add", "rect"),
    b = editScene(firstScene(project), null, "add", "circle");
  assert.ok(a && b);
  let context = { project, revision: 0, sessionId: crypto.randomUUID() };
  const run = (commands: unknown[]) => {
    const result = executeDocumentTransaction(context, {
      projectId: project.id,
      sessionId: context.sessionId,
      revision: context.revision,
      commands,
    });
    context = { ...context, project: result.project, revision: result.revision };
    return result;
  };
  return { a, b, run, context: () => context };
}
test("group/ungroup preserve stable child identities, transforms, paint and reversible document snapshots", () => {
  const { a, b, run, context } = fixture();
  const before = structuredClone(context().project);
  const group = run([
    { type: "composition", operation: "group", targetIds: [b, a], name: "Personagem" },
  ]).selected;
  assert.ok(group);
  const grouped = context().project;
  assert.deepEqual(
    firstScene(grouped)?.nodes[0]?.children.map((node) => node.id),
    [a, b],
  );
  run([
    {
      type: "scene",
      operation: "transform",
      targetId: group,
      value: { x: 19, rotation: 37, sx: 2, sy: 0.7 },
    },
    {
      type: "scene",
      operation: "attrs",
      targetId: group,
      value: { transform: "skewX(12)", stroke: "#123456" },
    },
  ]);
  const scene = firstScene(context().project);
  assert.ok(scene);
  const matrices = [worldMatrix(scene, a), worldMatrix(scene, b)];
  run([{ type: "composition", operation: "ungroup", targetId: group }]);
  const result = firstScene(context().project);
  assert.ok(result);
  [a, b].forEach((id, index) => {
    worldMatrix(result, id).forEach((value, j) => {
      assert.ok(Math.abs(value - (matrices[index]?.[j] ?? Infinity)) < 1e-9);
    });
  });
  assert.equal(result.nodes[0]?.attrs.stroke, "#123456");
  assert.match(renderScene(result, { runtime: true }), /transform="matrix\(/);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(context().project))), context().project);
  assert.equal(firstScene(before)?.nodes.length, 2);
  assert.equal(firstScene(before)?.nodes[0]?.basis, undefined);
});
test("reparenting animated children retains their coordinate basis at every sampled frame", () => {
  const { a, b, run, context } = fixture();
  const group = run([
    { type: "composition", operation: "group", targetIds: [b], name: "Destino" },
  ]).selected;
  assert.ok(group);
  run([
    {
      type: "scene",
      operation: "transform",
      targetId: group,
      value: { x: 100, rotation: 45, sx: 2, sy: 1 },
    },
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: "animation-free",
          name: "Livre",
          fps: 60,
          frames: 60,
          mode: "once",
          tracks: [],
        },
      },
    },
    ...[0, 60].map((frame) => ({
      type: "motion",
      command: {
        type: "set-key",
        animationId: "animation-free",
        targetId: a,
        property: "x",
        frame,
        value: frame * 2,
      },
    })),
  ]);
  const original = structuredClone(context().project);
  run([{ type: "composition", operation: "reparent", targetId: a, parentId: group, index: 1 }]);
  for (const frame of [0, 7, 30, 59, 60]) {
    const before = structuredClone(original),
      after = structuredClone(context().project);
    for (const project of [before, after]) {
      const node = flattenScene(firstScene(project)).find(({ node }) => node.id === a)?.node;
      const animation = project.motion.animations[0];
      assert.ok(node && animation);
      Object.assign(node.transform, evaluateAnimation(animation, frame).get(a));
    }
    assert.ok(firstScene(before) && firstScene(after));
    const p = transformPoint(worldMatrix(firstScene(before), a), 15, 20),
      q = transformPoint(worldMatrix(firstScene(after), a), 15, 20);
    assert.ok(Math.abs(p.x - q.x) < 1e-8 && Math.abs(p.y - q.y) < 1e-8);
  }
});
test("cycles, inherited locks, translucent groups and animated-parent moves fail atomically", () => {
  const { a, b, run, context } = fixture();
  const group = run([
    { type: "composition", operation: "group", targetIds: [a, b], name: "Grupo" },
  ]).selected;
  assert.ok(group);
  const fail = (commands: unknown[]) => {
    const before = structuredClone(context().project);
    assert.throws(() => run(commands));
    assert.deepEqual(context().project, before);
  };
  fail([
    { type: "composition", operation: "reparent", targetId: group, parentId: group, index: 0 },
  ]);
  fail([
    { type: "scene", operation: "transform", targetId: group, value: { opacity: 50 } },
    { type: "composition", operation: "ungroup", targetId: group },
  ]);
  fail([
    { type: "scene", operation: "lock", targetId: a, value: true },
    { type: "composition", operation: "ungroup", targetId: group },
  ]);
  run([
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: { id: "animation-a", name: "A", fps: 60, frames: 60, mode: "once", tracks: [] },
      },
    },
    {
      type: "motion",
      command: {
        type: "set-key",
        animationId: "animation-a",
        targetId: group,
        property: "x",
        frame: 0,
        value: 20,
      },
    },
  ]);
  fail([{ type: "composition", operation: "reparent", targetId: a, parentId: null, index: 1 }]);
  fail([{ type: "composition", operation: "ungroup", targetId: group }]);
});
