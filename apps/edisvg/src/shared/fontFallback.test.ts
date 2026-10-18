import assert from "node:assert/strict";
import { test } from "node:test";
import { INTERACTIVE_VERSION, parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { fontFallbackFixture } from "../../tests/fontFallbackFixture";
import { legacyInteractive } from "../../tests/legacyInteractive";
import { buildClipExport } from "../renderer/src/clipExport";
import { applyAsset } from "./assets";
import { executeDocumentTransaction } from "./documentCommands";
import { inspectFontCoverage } from "./fontInspection";
import { createHistory } from "./history.js";
import { compileInteractiveArtboard } from "./interactive";
import { PROJECT_VERSION, parseProject } from "./project";
import { editScene, renderScene } from "./scene.js";

test("typed embedded fallback persists in order, uses one root catalog and rejects old versions or incompatible refs", () => {
  const fixture = fontFallbackFixture(),
    project = fixture.project,
    board = project.artboards[0];
  assert.ok(board);
  const compiled = compileInteractiveArtboard(project, fixture.boardId),
    node = board.scene.nodes[0];
  assert.ok(node);
  assert.equal(project.version, PROJECT_VERSION);
  assert.equal(compiled.document.version, INTERACTIVE_VERSION);
  assert.deepEqual(node.fontFallbackIds, [fixture.fallback.id]);
  assert.deepEqual(compiled.document.content[0]?.fontFallbackIds, [fixture.fallback.id]);
  assert.equal(compiled.assets.length, 2);
  assert.match(
    compiled.svg,
    new RegExp(`font-family="edi-${fixture.primary.id}, edi-${fixture.fallback.id}"`),
  );
  assert.equal(JSON.stringify(compiled.document).split(fixture.fallback.data).length - 1, 1);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
  const coverage = inspectFontCoverage(board.scene, project.assets, { id: fixture.textId });
  assert.equal(coverage.source, "embedded");
  assert.equal(coverage.coverage?.covered, true);
  assert.deepEqual(coverage.fontIds, [fixture.primary.id, fixture.fallback.id]);
  assert.throws(() => parseProject({ ...project, version: 17 }), /v18/);
  assert.throws(() => parseInteractiveDocument({ ...compiled.document, version: 6 }), /v7/);
  assert.equal(parseInteractiveDocument(legacyInteractive(compiled.document, 6)).version, 6);
  assert.deepEqual(
    parseInteractiveDocument(legacyInteractive(compiled.document, 7)).content[0]?.fontFallbackIds,
    [fixture.fallback.id],
  );
  for (const fontFallbackIds of [
    [fixture.primary.id],
    [fixture.fallback.id, fixture.fallback.id],
    [`asset-${"0".repeat(64)}`],
  ]) {
    const before = JSON.stringify(project),
      sessionId = crypto.randomUUID();
    assert.throws(
      () =>
        executeDocumentTransaction(
          { project, revision: 0, sessionId },
          {
            projectId: project.id,
            revision: 0,
            sessionId,
            artboardId: board.id,
            commands: [
              {
                type: "asset",
                operation: "set-font",
                targetId: fixture.textId,
                assetId: fixture.primary.id,
                fontFallbackIds,
              },
            ],
          },
        ),
      /principal|fallback|Cadeia/,
    );
    assert.equal(JSON.stringify(project), before);
  }
  assert.throws(
    () =>
      applyAsset(project, board.scene, {
        type: "asset",
        operation: "remove",
        assetId: fixture.fallback.id,
      }),
    /referências de texto/,
  );
});

test("fallback editing has actual transaction/history semantics, respects locks and reports missing coverage without changing text", () => {
  const fixture = fontFallbackFixture(),
    initial = fixture.project,
    sessionId = crypto.randomUUID(),
    history = createHistory(initial),
    command = {
      type: "asset",
      operation: "set-font",
      targetId: fixture.textId,
      assetId: fixture.primary.id,
      fontFallbackIds: [],
    },
    result = executeDocumentTransaction(
      { project: initial, revision: 0, sessionId },
      { projectId: initial.id, revision: 0, sessionId, commands: [command] },
    );
  assert.equal(result.changed, true);
  history.commit(result.project);
  assert.deepEqual(history.undo()?.artboards[0]?.scene.nodes[0]?.fontFallbackIds, [
    fixture.fallback.id,
  ]);
  assert.equal(history.redo()?.artboards[0]?.scene.nodes[0]?.fontFallbackIds, undefined);
  const board = result.project.artboards[0],
    node = board?.scene.nodes[0];
  assert.ok(board && node);
  const before = JSON.stringify(result.project),
    report = inspectFontCoverage(board.scene, result.project.assets, { id: fixture.textId });
  assert.equal(report.coverage?.missingCount, 1);
  assert.deepEqual(report.coverage?.missing[0]?.codePoints, [0x1d49c]);
  assert.equal(JSON.stringify(result.project), before);
  node.locked = true;
  assert.throws(
    () =>
      executeDocumentTransaction(
        { project: result.project, revision: result.revision, sessionId },
        {
          projectId: initial.id,
          revision: result.revision,
          sessionId,
          commands: [{ ...command, fontFallbackIds: [fixture.fallback.id] }],
        },
      ),
    /Desbloqueie/,
  );
});
test("missing embedded coverage blocks new portable and timeline exports, not editing or complete project backup", () => {
  const fixture = fontFallbackFixture(),
    project = fixture.project,
    board = project.artboards[0];
  assert.ok(board);
  applyAsset(project, board.scene, {
    type: "asset",
    operation: "set-font",
    targetId: fixture.textId,
    assetId: fixture.primary.id,
    fontFallbackIds: [],
  });
  assert.doesNotThrow(() => parseProject(JSON.parse(JSON.stringify(project))));
  assert.doesNotThrow(() => renderScene(board.scene, { assets: project.assets }));
  assert.throws(() => compileInteractiveArtboard(project, board.id), /U\+1D49C/);
  assert.throws(
    () => renderScene(board.scene, { assets: project.assets, verifyFonts: true }),
    /U\+1D49C/,
  );
  const backup = buildClipExport(
    project,
    "animation-unavailable",
    { format: "json", alt: "Backup", reduced: false, offscreen: false },
    "",
  );
  assert.equal(backup.content.includes("𝒜"), true);
  editScene(board.scene, fixture.textId, "text", "Texto corrigido");
  // The authored text is valid again; dynamic input remains independently checked by the player.
  assert.doesNotThrow(() => compileInteractiveArtboard(project, board.id));
});
