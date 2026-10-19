import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAnimation, transformPoint } from "@informach/edi-motion";
import { firstScene } from "../../tests/fixtures";
import { worldMatrix } from "./composition";
import { executeDocumentTransaction } from "./documentCommands";
import { newProject } from "./project";
import { editScene, flattenScene } from "./scene.js";

function fixture() {
  const project = newProject(),
    scene = firstScene(project);
  const a = editScene(scene, null, "add", "rect"),
    b = editScene(scene, null, "add", "circle");
  assert.ok(a && b);
  let context = { project, sessionId: crypto.randomUUID(), revision: 0 };
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
test("duplicating animated objects preserves all channels and curve motion outside TRS bounds", () => {
  const { a, run, context } = fixture();
  run([
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: { id: "animation-a", name: "A", fps: 30, frames: 30, mode: "once", tracks: [] },
      },
    },
    ...[0, 30].map((frame) => ({
      type: "motion",
      command: {
        type: "set-key",
        animationId: "animation-a",
        targetId: a,
        property: "x",
        frame,
        value: 9990 + frame / 3,
        easing: { kind: "cubic-bezier", points: [0.2, 2, 0.8, 2] },
      },
    })),
  ]);
  const before = structuredClone(context().project),
    result = run([{ type: "scene", operation: "duplicate", targetId: a }]);
  const copy = result.selected;
  assert.ok(copy);
  const clip = result.project.motion.animations[0];
  assert.ok(clip);
  assert.equal(clip.tracks.length, 2);
  assert.notEqual(clip.tracks[0]?.keys[0]?.id, clip.tracks[1]?.keys[0]?.id);
  for (const frame of [0, 7, 15, 29, 30]) {
    const scene = structuredClone(firstScene(result.project)),
      poses = evaluateAnimation(clip, frame);
    for (const { node } of flattenScene(scene)) Object.assign(node.transform, poses.get(node.id));
    const original = transformPoint(worldMatrix(scene, a), 0, 0),
      duplicate = transformPoint(worldMatrix(scene, copy), 0, 0);
    assert.ok(Math.abs(duplicate.x - original.x - 20) < 1e-8);
  }
  assert.equal(before.motion.animations[0]?.tracks.length, 1);
});
test("multi-object operations prune selected descendants, preserve painter order and refuse any locked target atomically", () => {
  const { a, b, run, context } = fixture();
  const group = run([
    { type: "composition", operation: "group", targetIds: [a, b], name: "Grupo" },
  ]).selected;
  assert.ok(group);
  const duplicated = run([{ type: "scene-batch", operation: "duplicate", targetIds: [group, a] }]);
  assert.equal(firstScene(duplicated.project).nodes.length, 2);
  assert.equal(duplicated.selectedIds?.length, 1);
  const second = firstScene(duplicated.project).nodes[1];
  assert.ok(second);
  run([{ type: "scene-batch", operation: "back", targetIds: [second.id] }]);
  assert.equal(firstScene(context().project).nodes[0]?.id, second.id);
  const deleted = run([
    { type: "scene-batch", operation: "delete", targetIds: [second.id, second.children[0]?.id] },
  ]);
  assert.equal(firstScene(deleted.project).nodes.length, 1);
  const before = structuredClone(context().project);
  assert.throws(() =>
    run([
      { type: "scene", operation: "lock", targetId: a, value: true },
      { type: "scene-batch", operation: "delete", targetIds: [a, b] },
    ]),
  );
  assert.deepEqual(context().project, before);
});
