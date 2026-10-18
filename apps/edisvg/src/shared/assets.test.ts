import assert from "node:assert/strict";
import { test } from "node:test";
import { INTERACTIVE_VERSION } from "@informach/edi-motion/runtime";
import { fontFixture, imageFixture } from "../../tests/assetFixtures";
import { inspectAssets } from "./assetInspection";
import { applyAsset } from "./assets";
import { compileArtboard, renderEditorComposition } from "./components";
import { executeDocumentTransaction } from "./documentCommands";
import { createHistory } from "./history.js";
import { compileInteractiveArtboard } from "./interactive";
import { newProject, PROJECT_VERSION, parseProject, snapshot } from "./project";
import { editScene, renderScene } from "./scene.js";

test("asset transactions deduplicate content, persist typed image references, share bytes in SVG and preserve undo/redo", () => {
  let project = newProject(),
    revision = 0;
  const initial = structuredClone(project),
    history = createHistory(project),
    sessionId = crypto.randomUUID(),
    asset = imageFixture();
  const run = (commands: unknown[]) => {
    const result = executeDocumentTransaction(
      { project, revision, sessionId },
      { projectId: project.id, revision, sessionId, commands },
    );
    project = result.project;
    revision = result.revision;
    history.commit(project);
    return result;
  };
  run([{ type: "asset", operation: "put", value: asset }]);
  assert.equal(
    run([{ type: "asset", operation: "put", value: { ...asset, name: "Duplicate" } }]).changed,
    false,
  );
  const inserted = run([{ type: "asset", operation: "insert-image", assetId: asset.id }]).selected;
  run([{ type: "asset", operation: "insert-image", assetId: asset.id }]);
  assert.equal(project.assets.length, 1);
  assert.equal("data" in (inspectAssets(project.assets, {}).items[0] ?? {}), false);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(snapshot(project)))), project);
  const board = project.artboards[0];
  assert.ok(board);
  assert.equal(board.scene.nodes[0]?.assetId, asset.id);
  const compiled = compileArtboard(project, board.id),
    markup = renderEditorComposition(compiled);
  assert.equal(markup.split(asset.data).length - 1, 1);
  assert.equal(markup.match(/<use href=/g)?.length, 2);
  assert.match(compileInteractiveArtboard(project, board.id).svg, /<defs><image/);
  assert.throws(() => renderScene(board.scene), /Recurso/);
  const before = JSON.stringify(project);
  assert.throws(
    () => run([{ type: "asset", operation: "remove", assetId: asset.id }]),
    /Remova as imagens/,
  );
  assert.equal(JSON.stringify(project), before);
  assert.equal(history.undo()?.artboards[0]?.scene.nodes.length, 1);
  assert.equal(history.redo()?.artboards[0]?.scene.nodes.length, 2);
  run([{ type: "scene", operation: "delete", targetId: inserted }]);
  assert.equal(project.artboards[0]?.scene.nodes.length, 1);
  const bad = structuredClone(project);
  const node = bad.artboards[0]?.scene.nodes[0];
  assert.ok(node);
  node.assetId = `asset-${"0".repeat(64)}`;
  assert.throws(() => parseProject(bad), /recurso/);
  assert.throws(() => parseProject({ ...project, version: 14 }), /v15/);
  assert.throws(() => parseProject({ ...project, version: 1 }), /v15/);
  const { assets: _assets, ...legacy } = initial;
  assert.equal(parseProject({ ...legacy, version: 14 }).version, PROJECT_VERSION);
  assert.throws(
    () => run([{ type: "asset", operation: "put", value: { ...asset, data: "AAAA" } }]),
    /Integridade|tamanho/,
  );
});

test("embedded fonts require declared editable rights, persist typed references and refuse dangling/deletion/locked changes", () => {
  const project = newProject(),
    board = project.artboards[0],
    font = fontFixture();
  assert.ok(board);
  const id = editScene(board.scene, null, "add", "text");
  assert.ok(id);
  applyAsset(project, board.scene, { type: "asset", operation: "put", value: font });
  applyAsset(project, board.scene, {
    type: "asset",
    operation: "set-font",
    assetId: font.id,
    targetId: id,
  });
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
  const markup = compileInteractiveArtboard(project, board.id);
  assert.equal(markup.document.version, INTERACTIVE_VERSION);
  assert.equal(markup.document.content[0]?.fontAssetId, font.id);
  assert.equal(markup.svg.includes("@font-face"), false);
  assert.match(markup.svg, /SIL Open Font License/);
  assert.equal(JSON.stringify(markup.document).split(font.data).length - 1, 1);
  assert.throws(
    () =>
      applyAsset(project, board.scene, { type: "asset", operation: "remove", assetId: font.id }),
    /referências de texto/,
  );
  const text = board.scene.nodes[0];
  assert.ok(text);
  text.locked = true;
  assert.throws(
    () =>
      applyAsset(project, board.scene, {
        type: "asset",
        operation: "set-font",
        assetId: null,
        targetId: id,
      }),
    /Desbloqueie/,
  );
  text.locked = false;
  applyAsset(project, board.scene, {
    type: "asset",
    operation: "set-font",
    assetId: null,
    targetId: id,
  });
  applyAsset(project, board.scene, { type: "asset", operation: "remove", assetId: font.id });
  assert.equal(parseProject(project).assets.length, 0);
  assert.throws(() =>
    applyAsset(project, board.scene, {
      type: "asset",
      operation: "put",
      value: { ...font, rightsConfirmed: false },
    }),
  );
});
