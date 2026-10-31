import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultLayoutContainer, defaultLayoutItem } from "@informach/edi-motion/layout";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { executeDocumentTransaction } from "./documentCommands";
import { createHistory } from "./history.js";
import { compileInteractiveArtboard } from "./interactive";
import { newProject, PROJECT_VERSION, parseProject } from "./project";
import { editScene } from "./scene.js";

test("layout edits share atomic revision guards, preserve history, migrate v9 and remap artboard identities", () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  const id = editScene(board.scene, null, "add", "rect");
  if (!id) throw new Error("Missing object");
  const before = structuredClone(project),
    sessionId = crypto.randomUUID(),
    history = createHistory(project);
  const value = {
    version: 1,
    root: defaultLayoutContainer(),
    containers: [],
    items: [defaultLayoutItem(id)],
  };
  const request = {
    projectId: project.id,
    sessionId,
    revision: 0,
    commands: [{ type: "layout", operation: "replace", value }],
  };
  const result = executeDocumentTransaction({ project, sessionId, revision: 0 }, request);
  assert.deepEqual(project, before);
  history.commit(result.project);
  assert.deepEqual(history.undo(), before);
  assert.deepEqual(history.redo(), result.project);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(result.project))), result.project);
  assert.throws(
    () => executeDocumentTransaction({ project: result.project, sessionId, revision: 1 }, request),
    /mudou/,
  );
  const copied = executeDocumentTransaction(
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
          name: "Copy",
        },
      ],
    },
  ).project.artboards[1];
  assert.ok(copied?.scene.nodes[0]);
  assert.equal(copied.layout?.items[0]?.targetId, copied.scene.nodes[0].id);
  assert.notEqual(copied.layout?.items[0]?.targetId, id);
  const { assets: _assets, ...legacyFields } = before;
  assert.equal(parseProject({ ...legacyFields, version: 9 }).version, PROJECT_VERSION);
  assert.equal(parseProject({ ...legacyFields, version: 9 }).artboards[0]?.layout, undefined);
  const locked = structuredClone(project);
  if (!locked.artboards[0]?.scene.nodes[0]) throw new Error("Missing object");
  locked.artboards[0].scene.nodes[0].locked = true;
  assert.throws(
    () => executeDocumentTransaction({ project: locked, sessionId, revision: 0 }, request),
    /Desbloqueie/,
  );
  assert.throws(
    () =>
      executeDocumentTransaction(
        { project, sessionId, revision: 0 },
        {
          ...request,
          commands: [
            {
              type: "layout",
              operation: "replace",
              value: { ...value, items: [defaultLayoutItem("node-missing")] },
            },
          ],
        },
      ),
    /Item/,
  );
  assert.deepEqual(project, before);
});

test("artboard size modes are a project v24 / blueprint v13 capability", () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  board.layout = {
    version: 1,
    root: defaultLayoutContainer(),
    rootSize: { width: "hug", height: "fixed" },
    containers: [],
    items: [],
  };
  const saved = JSON.parse(JSON.stringify(project));
  assert.ok(PROJECT_VERSION >= 24);
  assert.deepEqual(parseProject(saved).artboards[0]?.layout?.rootSize, {
    width: "hug",
    height: "fixed",
  });
  assert.throws(
    () => parseProject({ ...saved, version: 23 }),
    /Tamanho da prancheta no layout requer projeto v24/,
  );
  const compiled = compileInteractiveArtboard(project, board.id);
  assert.deepEqual(compiled.document.layout?.rootSize, { width: "hug", height: "fixed" });
  assert.throws(
    () => parseInteractiveDocument({ ...compiled.document, version: 12 }),
    /Tamanho da prancheta no layout requer blueprint v13/,
  );
});
