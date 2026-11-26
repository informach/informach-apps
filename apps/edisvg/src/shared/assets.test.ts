import assert from "node:assert/strict";
import { test } from "node:test";
import { INTERACTIVE_VERSION } from "@informach/edi-motion/runtime";
import {
  audioFixture,
  fontFixture,
  imageFixture,
  mathFontFixture,
  sliceImageFixture,
  wideImageFixture,
} from "../../tests/assetFixtures";
import { inspectAssets } from "./assetInspection";
import { applyAsset, assetUsage } from "./assets";
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

test("the asset panel counts uses, inserts an image where it was dropped and replaces a file everywhere", () => {
  const project = newProject(),
    board = project.artboards[0],
    image = imageFixture(),
    font = fontFixture(),
    audio = audioFixture();
  assert.ok(board);
  const scene = board.scene;
  for (const value of [image, font, audio])
    applyAsset(project, scene, { type: "asset", operation: "put", value });
  assert.equal(assetUsage(project).size, 0);
  // A drop puts the image's center on the point.
  const placed = applyAsset(project, scene, {
    type: "asset",
    operation: "insert-image",
    assetId: image.id,
    at: { x: 100, y: 50 },
  });
  const image0 = () => {
    const found = scene.nodes.find((value) => value.id === placed);
    assert.ok(found);
    return found;
  };
  let node = image0();
  assert.equal(Number(node.attrs.x) + Number(node.attrs.width) / 2, 100);
  assert.equal(Number(node.attrs.y) + Number(node.attrs.height) / 2, 50);
  node.attrs.width = "40";
  node.attrs.height = "40";
  node.attrs.x = "80";
  node.attrs.y = "30";
  node.imageSlice = { top: 0, right: 0, bottom: 0, left: 0 };
  const text = editScene(scene, null, "add", "text");
  assert.ok(text);
  applyAsset(project, scene, {
    type: "asset",
    operation: "set-font",
    assetId: font.id,
    targetId: text,
  });
  board.audio = {
    version: 1,
    bindings: [{ id: "cue", eventId: "event", assetId: audio.id, volume: 1, caption: "Pulo" }],
  };
  project.defaults = { fonts: { heading: font.id, body: null } };
  assert.deepEqual(
    [...assetUsage(project)].sort(),
    [
      [audio.id, 1],
      [font.id, 2],
      [image.id, 1],
    ].sort(),
  );

  // Image: same center and width, height of the new proportion; the asset keeps its name.
  const wide = wideImageFixture();
  applyAsset(project, scene, {
    type: "asset",
    operation: "replace",
    assetId: image.id,
    value: wide,
  });
  node = image0();
  assert.equal(node.assetId, wide.id);
  assert.equal(node.attrs.width, "40");
  assert.equal(node.attrs.height, "20");
  assert.equal(node.attrs.y, "40");
  assert.equal(project.assets.find((asset) => asset.id === wide.id)?.name, image.name);
  assert.equal(
    project.assets.some((asset) => asset.id === image.id),
    false,
  );
  // A nine-slice that does not fit the new picture is dropped.
  node.imageSlice = { top: 0, right: 15, bottom: 0, left: 15 };
  applyAsset(project, scene, {
    type: "asset",
    operation: "replace",
    assetId: wide.id,
    value: sliceImageFixture(),
  });
  assert.equal(image0().imageSlice, undefined);

  // Font: the text and the default font follow the new one.
  const math = mathFontFixture();
  applyAsset(project, scene, {
    type: "asset",
    operation: "replace",
    assetId: font.id,
    value: math,
  });
  const textNode = scene.nodes.find((value) => value.id === text);
  assert.equal(textNode?.fontAssetId, math.id);
  assert.equal(textNode?.attrs["font-family"], math.family);
  assert.equal(project.defaults.fonts.heading, math.id);

  // Audio: the bindings follow.
  const shorter = audioFixture(400);
  applyAsset(project, scene, {
    type: "asset",
    operation: "replace",
    assetId: audio.id,
    value: shorter,
  });
  assert.equal(board.audio.bindings[0]?.assetId, shorter.id);

  assert.throws(
    () =>
      applyAsset(project, scene, {
        type: "asset",
        operation: "replace",
        assetId: shorter.id,
        value: imageFixture(),
      }),
    /mesmo tipo/,
  );
  assert.throws(
    () =>
      applyAsset(project, scene, {
        type: "asset",
        operation: "replace",
        assetId: shorter.id,
        value: shorter,
      }),
    /mesmo arquivo/,
  );
});
