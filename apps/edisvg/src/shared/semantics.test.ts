import assert from "node:assert/strict";
import { test } from "node:test";
import { INTERACTIVE_VERSION, parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { independentComponentsFixture } from "../../tests/componentFixture";
import { semanticFixture } from "../../tests/semanticFixture";
import { buildClipExport } from "../renderer/src/clipExport";
import { compileArtboard, renderEditorComposition } from "./components";
import { executeDocumentTransaction } from "./documentCommands";
import { createHistory } from "./history.js";
import { compileInteractiveArtboard } from "./interactive";
import { hasInteractiveFeatures, requiresInteractiveExport } from "./interactiveCapabilities";
import { PROJECT_VERSION, parseProject } from "./project";
import { editScene, renderScene } from "./scene.js";

test("semantics persist and compile with strict versions while static SVG has no inactive button role", () => {
  const fixture = semanticFixture(),
    board = fixture.project.artboards[0];
  assert.ok(board);
  const compiled = compileInteractiveArtboard(fixture.project, board.id);
  assert.equal(fixture.project.version, PROJECT_VERSION);
  assert.equal(compiled.document.version, INTERACTIVE_VERSION);
  assert.deepEqual(
    compiled.document.content.find((item) => item.id === fixture.buttonId)?.semantics,
    board.scene.nodes[0]?.semantics,
  );
  assert.match(compiled.svg, /role="button"/);
  assert.match(compiled.svg, /<desc>Ativa o aceno pelo teclado ou toque\.<\/desc>/);
  const staticSvg = renderScene(board.scene);
  assert.doesNotMatch(staticSvg, /role="button"|tabindex/);
  assert.match(staticSvg, /aria-label="Acenar para você"/);
  const authoring = renderEditorComposition(compileArtboard(fixture.project, board.id));
  assert.doesNotMatch(authoring, /role="button"|aria-hidden|<desc>/);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(fixture.project))), fixture.project);
  assert.throws(() => parseProject({ ...fixture.project, version: 18 }), /v19/);
  assert.throws(() => parseInteractiveDocument({ ...compiled.document, version: 7 }), /v8/);
});
test("semantic edits are atomic, undoable and locked, and incomplete buttons remain editable/saveable", () => {
  const fixture = semanticFixture(),
    project = fixture.project,
    sessionId = crypto.randomUUID();
  const request = (value: unknown) => ({
    projectId: project.id,
    sessionId,
    revision: 0,
    artboardId: fixture.boardId,
    commands: [{ type: "scene", operation: "semantics", targetId: fixture.buttonId, value }],
  });
  const result = executeDocumentTransaction(
      { project, sessionId, revision: 0 },
      request({ kind: "image", label: "Imagem" }),
    ),
    history = createHistory(project);
  history.commit(result.project);
  assert.deepEqual(history.undo(), project);
  assert.deepEqual(history.redo(), result.project);
  assert.throws(() =>
    executeDocumentTransaction(
      { project, sessionId, revision: 0 },
      request({ kind: "decorative", label: "bad" }),
    ),
  );
  assert.equal(project.artboards[0]?.scene.nodes[0]?.semantics?.kind, "button");
  const board = project.artboards[0];
  assert.ok(board);
  editScene(board.scene, fixture.buttonId, "lock", true);
  assert.throws(
    () => executeDocumentTransaction({ project, sessionId, revision: 0 }, request(null)),
    /Desbloqueie/,
  );
  editScene(board.scene, fixture.buttonId, "lock", false);
  board.behavior = undefined;
  assert.equal(hasInteractiveFeatures(project, board.id), true);
  assert.equal(requiresInteractiveExport(project, board.id), false);
  assert.doesNotThrow(() => parseProject(project));
  assert.doesNotThrow(() =>
    buildClipExport(
      project,
      "animation-none",
      { format: "json", alt: "Backup", reduced: false, offscreen: false },
      "",
    ),
  );
  assert.throws(() => compileInteractiveArtboard(project, board.id), /ativação/);
});
test("component semantic boundaries cannot hide scoped descendants or artboard-wide listeners", () => {
  const fixture = independentComponentsFixture(),
    board = fixture.project.artboards.find((item) => item.id === fixture.rootId);
  assert.ok(board);
  const instance = board.scene.nodes[0];
  assert.ok(instance);
  instance.semantics = { kind: "decorative" };
  assert.doesNotThrow(() => parseProject(fixture.project));
  assert.throws(() => compileInteractiveArtboard(fixture.project, board.id), /esconderia/);
  instance.semantics = { kind: "group", label: "Personagem" };
  assert.doesNotThrow(() => compileInteractiveArtboard(fixture.project, board.id));
});
