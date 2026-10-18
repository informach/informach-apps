import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { executeDocumentTransaction } from "./documentCommands";
import { newProject, parseProject } from "./project";
import { editScene } from "./scene.js";

test("authored logic shares revision-guarded transactions, persists and remaps references when duplicating artboards", () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  const id = editScene(board.scene, null, "add", "text");
  const behavior = {
    ...emptyBehavior(),
    inputs: [{ id: "input-name", name: "Nome", kind: "string", initial: "Ana" }],
    bindings: [
      {
        id: "binding-name",
        inputId: "input-name",
        kind: "text",
        targetId: id,
        direction: "two-way",
      },
    ],
    listeners: [
      {
        id: "listener-click",
        targetId: id,
        event: "activate",
        actions: [{ kind: "set-input", inputId: "input-name", value: "Bia" }],
      },
    ],
  };
  const sessionId = crypto.randomUUID(),
    before = structuredClone(project);
  const result = executeDocumentTransaction(
    { project, sessionId, revision: 0 },
    {
      projectId: project.id,
      sessionId,
      revision: 0,
      commands: [{ type: "behavior", operation: "replace", value: behavior }],
    },
  );
  assert.deepEqual(project, before);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(result.project))), result.project);
  const duplicated = executeDocumentTransaction(
    { project: result.project, sessionId, revision: 1 },
    {
      projectId: project.id,
      sessionId,
      revision: 1,
      commands: [
        {
          type: "artboard",
          operation: "duplicate",
          id: board.id,
          newId: "artboard-copy",
          name: "Cópia",
        },
      ],
    },
  );
  const copied = duplicated.project.artboards[1];
  if (!copied) throw new Error("Missing copy");
  assert.equal(copied.behavior?.bindings[0]?.targetId, copied.scene.nodes[0]?.id);
  assert.equal(copied.behavior?.listeners[0]?.targetId, copied.scene.nodes[0]?.id);
  assert.notEqual(copied.scene.nodes[0]?.id, id);
  assert.throws(
    () =>
      executeDocumentTransaction(
        { project: result.project, sessionId, revision: 1 },
        {
          projectId: project.id,
          sessionId,
          revision: 1,
          commands: [{ type: "scene", operation: "delete", targetId: id }],
        },
      ),
    /órfã/,
  );
  assert.throws(
    () =>
      executeDocumentTransaction(
        { project: result.project, sessionId, revision: 1 },
        {
          projectId: project.id,
          sessionId,
          revision: 0,
          commands: [{ type: "behavior", operation: "replace", value: emptyBehavior() }],
        },
      ),
    /mudou/,
  );
});
