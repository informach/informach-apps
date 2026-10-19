import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAnimation } from "@informach/edi-motion";
import { firstScene } from "../../tests/fixtures";
import { executeDocumentTransaction } from "./documentCommands";
import { createHistory } from "./history.js";
import { contentSnapshot, newProject, PROJECT_VERSION, parseProject } from "./project";
import { editScene, flattenScene } from "./scene.js";

function fixture() {
  const project = newProject();
  if (!firstScene(project)) throw new Error("Missing scene");
  const id = editScene(firstScene(project), null, "add", "rect");
  if (!id) throw new Error("Missing object");
  const context = { project, sessionId: crypto.randomUUID(), revision: 0 };
  const request = (commands: unknown[]) => ({
    projectId: project.id,
    sessionId: context.sessionId,
    revision: context.revision,
    commands,
  });
  const creation = {
    type: "motion",
    command: {
      type: "create-animation",
      animation: {
        id: "animation-user",
        name: "Livre",
        fps: 24,
        frames: 48,
        mode: "once",
        tracks: [],
      },
    },
  };
  const key = (frame: number, value: number) => ({
    type: "motion",
    command: {
      type: "set-key",
      animationId: "animation-user",
      targetId: id,
      property: "x",
      frame,
      value,
    },
  });
  return { project, context, request, creation, key, id };
}
test("UI/MCP transaction is atomic, session/revision guarded and undoable, including deleting tracked objects", () => {
  const { context, request, creation, key, id } = fixture();
  const history = createHistory(contentSnapshot(context.project));
  const result = executeDocumentTransaction(context, request([creation, key(0, 0), key(48, 96)]));
  assert.equal(context.project.motion.animations.length, 0);
  assert.equal(result.revision, 1);
  history.commit(contentSnapshot(result.project));
  const animation = result.project.motion.animations[0];
  assert.ok(animation);
  assert.equal(evaluateAnimation(animation, 24).get(id)?.x, 48);
  const next = { ...context, project: result.project, revision: result.revision };
  assert.throws(() => executeDocumentTransaction(next, request([key(24, 20)])), /projeto mudou/);
  assert.throws(
    () =>
      executeDocumentTransaction(context, {
        ...request([creation]),
        sessionId: crypto.randomUUID(),
      }),
    /projeto mudou/,
  );
  const deleted = executeDocumentTransaction(next, {
    ...request([{ type: "scene", targetId: id, operation: "delete" }]),
    revision: next.revision,
  });
  assert.equal(flattenScene(firstScene(deleted.project)).length, 0);
  assert.equal(deleted.project.motion.animations[0]?.tracks.length, 0);
  history.commit(contentSnapshot(deleted.project));
  assert.deepEqual(history.undo(), contentSnapshot(result.project));
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(result.project))), result.project);
});
test("a failed mixed transaction publishes neither scene nor motion changes", () => {
  const { context, request, creation, key, id } = fixture();
  const before = structuredClone(context.project);
  assert.throws(() =>
    executeDocumentTransaction(
      context,
      request([
        { type: "scene", targetId: id, operation: "rename", value: "Alterado" },
        creation,
        key(49, 4),
      ]),
    ),
  );
  assert.deepEqual(context.project, before);
  assert.equal(context.revision, 0);
});
test("inherited locks prevent authored keys", () => {
  const { context, request, creation, key } = fixture();
  const node = firstScene(context.project).nodes[0];
  assert.ok(node);
  node.locked = true;
  assert.throws(
    () => executeDocumentTransaction(context, request([creation, key(0, 1)])),
    /Desbloqueie/,
  );
  assert.equal(context.project.motion.animations.length, 0);
});
test("bulk poses and key selections respect locks, and preflight bounds nested key payloads", () => {
  const { context, request, creation, key, id } = fixture();
  const created = executeDocumentTransaction(context, request([creation, key(0, 0), key(48, 96)]));
  const clip = created.project.motion.animations[0],
    node = firstScene(created.project).nodes[0];
  assert.ok(clip);
  assert.ok(node);
  node.locked = true;
  const locked = { ...context, project: created.project, revision: created.revision },
    before = structuredClone(locked.project);
  const run = (command: unknown) =>
    executeDocumentTransaction(locked, {
      ...request([{ type: "motion", command }]),
      revision: locked.revision,
    });
  assert.throws(
    () =>
      run({
        type: "set-poses",
        animationId: clip.id,
        frame: 0,
        createKeys: true,
        poses: [{ targetId: id, transform: { x: 1 } }],
      }),
    /Desbloqueie/,
  );
  for (const type of ["move-keys", "copy-keys", "delete-keys"])
    assert.throws(
      () =>
        run({
          type,
          animationId: clip.id,
          keyIds: [clip.tracks[0]?.keys[0]?.id],
          ...(type === "delete-keys" ? {} : { deltaFrames: 1, scale: 1, anchorFrame: 0 }),
        }),
      /Desbloqueie/,
    );
  assert.deepEqual(locked.project, before);
  assert.throws(
    () =>
      run({
        type: "delete-keys",
        animationId: clip.id,
        keyIds: Array.from({ length: 100001 }, () => "key-large"),
      }),
    /Orçamento/,
  );
});
test("v3 identity is stable and unknown capabilities are refused rather than silently discarded", () => {
  const project = newProject();
  assert.equal(parseProject(project).id, project.id);
  assert.throws(() => parseProject({ ...project, unsupportedFeature: {} }));
  assert.throws(() =>
    parseProject({ ...project, inputs: { humor: 0.6, acenando: false, newBinding: true } }),
  );
  assert.throws(() =>
    parseProject({ ...project, scene: { ...firstScene(project), artboards: [] } }),
  );
  assert.throws(() => parseProject({ ...project, version: PROJECT_VERSION + 1 }));
  const legacy = { version: 2, name: "Antigo", animation: "Pular", transforms: {}, keys: [0, 48] };
  const migrated = parseProject(legacy);
  assert.equal(migrated.version, PROJECT_VERSION);
  assert.equal(parseProject(migrated).id, migrated.id);
});
test("scene commands validate their specific payloads and flags use the same transaction boundary", () => {
  const { context, request, id } = fixture();
  assert.throws(() =>
    executeDocumentTransaction(
      context,
      request([{ type: "scene", targetId: id, operation: "transform", value: true }]),
    ),
  );
  assert.throws(() =>
    executeDocumentTransaction(
      context,
      request([{ type: "scene", targetId: id, operation: "delete", value: "ignored" }]),
    ),
  );
  const locked = executeDocumentTransaction(
    context,
    request([{ type: "scene", targetId: id, operation: "lock", value: true }]),
  );
  const next = { ...context, project: locked.project, revision: locked.revision };
  assert.throws(
    () =>
      executeDocumentTransaction(next, {
        ...request([{ type: "scene", targetId: id, operation: "visibility", value: false }]),
        revision: next.revision,
      }),
    /Desbloqueie/,
  );
  const unlocked = executeDocumentTransaction(next, {
    ...request([
      { type: "scene", targetId: id, operation: "lock", value: false },
      { type: "scene", targetId: id, operation: "visibility", value: false },
    ]),
    revision: next.revision,
  });
  assert.equal(firstScene(unlocked.project)?.nodes[0]?.visible, false);
  assert.equal(firstScene(context.project)?.nodes[0]?.visible, true);
});
test("a child cannot bypass an inherited lock by changing its own lock flag", () => {
  const { context, request, id } = fixture();
  const scene = firstScene(context.project),
    child = scene?.nodes[0];
  assert.ok(scene);
  assert.ok(child);
  scene.nodes = [
    {
      ...child,
      id: "node-parent",
      name: "Grupo",
      tag: "g",
      attrs: {},
      locked: true,
      children: [child],
    },
  ];
  assert.throws(
    () =>
      executeDocumentTransaction(
        context,
        request([{ type: "scene", targetId: id, operation: "lock", value: false }]),
      ),
    /Desbloqueie/,
  );
  const unlocked = executeDocumentTransaction(
    context,
    request([
      { type: "scene", targetId: "node-parent", operation: "lock", value: false },
      { type: "scene", targetId: id, operation: "rename", value: "Editável" },
    ]),
  );
  assert.equal(firstScene(unlocked.project)?.nodes[0]?.children[0]?.name, "Editável");
  assert.equal(scene.nodes[0]?.locked, true);
});
