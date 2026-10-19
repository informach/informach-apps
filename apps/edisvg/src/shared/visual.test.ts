import assert from "node:assert/strict";
import { test } from "node:test";
import { INTERACTIVE_VERSION, parseInteractiveDocument } from "@informach/edi-motion/runtime";
import {
  describeVisualDocument,
  serializeVisualElement,
  visualSceneFromDocument,
} from "@informach/edi-motion/visual";
import { strFromU8, unzipSync } from "fflate";
import { independentComponentsFixture } from "../../tests/componentFixture";
import { portableVisualFixture } from "../../tests/portableVisualFixture";
import { vectorEffectFixture } from "../../tests/vectorEffectFixture";
import { buildInteractiveExport } from "../renderer/src/behavior/export";
import { buildReactExport } from "../renderer/src/behavior/react-export";
import { compileInteractiveArtboard } from "./interactive";
import { editScene } from "./scene.js";

test("portable HTML and React artifacts include each used resource once and omit unused assets", () => {
  const fixture = portableVisualFixture(),
    options = {
      alt: "Portátil",
      reduced: false,
      offscreen: false,
      artboardId: fixture.boardId,
      animationId: fixture.animationId,
    },
    html = buildInteractiveExport(
      fixture.project,
      { ...options, format: "interactive-html" },
      "mountInteractivePlayer",
    ),
    archive = buildReactExport(
      fixture.project,
      { ...options, format: "react" },
      '"use client";export const EdiSvgPlayer=undefined;export const VisualArtwork=undefined;',
      "MIT License",
    ),
    files = unzipSync(archive.content),
    jsx = files["EdiAnimation.jsx"];
  assert.ok(jsx);
  const react = strFromU8(jsx),
    compiled = compileInteractiveArtboard(fixture.project, fixture.boardId, {
      animationId: fixture.animationId,
    });
  assert.equal(compiled.assets.length, 3);
  for (const asset of compiled.assets) {
    assert.equal(html.content.split(asset.data).length - 1, 1);
    assert.equal(react.split(asset.data).length - 1, 1);
  }
  for (const asset of fixture.project.assets.filter(
    (asset) => !compiled.assets.some((used) => used.id === asset.id),
  )) {
    assert.equal(html.content.includes(asset.data), false);
    assert.equal(react.includes(asset.data), false);
  }
  assert.ok(react.includes("h(VisualArtwork,{document:blueprint})"));
  assert.equal(html.content.includes("data-edi-object="), false);
});

test("portable compiler preserves exact SVG arcs and verifies original syntax against spatial geometry", () => {
  const fixture = vectorEffectFixture(),
    board = fixture.project.artboards[0];
  assert.ok(board);
  const arc = "M10 50A40 40 0 1 0 90 50A40 40 0 1 0 10 50Z";
  editScene(board.scene, fixture.sourceId, "attrs", { d: arc });
  const compiled = compileInteractiveArtboard(fixture.project, board.id),
    document = compiled.document;
  assert.equal(document.version, INTERACTIVE_VERSION);
  const source = document.content.find((object) => object.id === fixture.sourceId);
  assert.equal(source?.visual?.attrs.d, arc);
  assert.ok(
    document.playback.objects
      .find((object) => object.id === fixture.sourceId)
      ?.geometry?.[0]?.points.some((point) => point.in !== null),
  );
  const described = serializeVisualElement(describeVisualDocument(document));
  assert.ok(described.includes(`d="${arc}"`));
  assert.deepEqual(parseInteractiveDocument(JSON.parse(JSON.stringify(document))), document);
  const inconsistent = structuredClone(document),
    wrong = inconsistent.content.find((object) => object.id === fixture.sourceId);
  assert.ok(wrong?.visual);
  wrong.visual.attrs.d = "M0 0L1 1";
  assert.throws(() => parseInteractiveDocument(inconsistent), /geometria espacial/);
  assert.ok(
    visualSceneFromDocument(document).scene.nodes.some((node) => node.id === fixture.sourceId),
  );
});

test("portable content refuses unsafe XML, dynamic paint, visual hierarchy cycles and unsupported mixed scopes", () => {
  const fixture = vectorEffectFixture(),
    compiled = compileInteractiveArtboard(fixture.project, fixture.boardId);
  for (const mutate of [
    (document: typeof compiled.document) => {
      const node = document.content[0];
      if (node?.visual) node.visual.text = "\ud800";
    },
    (document: typeof compiled.document) => {
      const node = document.content[0];
      if (node?.visual) node.visual.attrs.fill = "var(--external)";
    },
    (document: typeof compiled.document) => {
      const node = document.content[0];
      if (node) delete node.visual;
    },
    (document: typeof compiled.document) => {
      const node = document.content[0],
        spatial = document.playback.objects[0];
      if (node && spatial) {
        node.parentId = node.id;
        spatial.parentId = node.id;
      }
    },
    (document: typeof compiled.document) => {
      delete document.assets;
    },
  ]) {
    const document = structuredClone(compiled.document);
    mutate(document);
    assert.throws(() => parseInteractiveDocument(document));
  }
  const before = JSON.stringify(fixture.project),
    board = fixture.project.artboards[0];
  assert.ok(board);
  assert.throws(() =>
    editScene(board.scene, fixture.targetId, "attrs", { "font-family": "\u0000" }),
  );
  assert.equal(JSON.stringify(fixture.project), before);
});

test("portable parsing refuses parent-scope graphics inside an independent component viewport", () => {
  const fixture = independentComponentsFixture(),
    document = compileInteractiveArtboard(fixture.project, fixture.rootId).document,
    component = document.components?.[0],
    viewport = document.content.find((object) => object.id === component?.rootId),
    instance = document.content.find((object) => object.id === fixture.instances[1]),
    spatial = document.playback.objects.find((object) => object.id === instance?.id);
  assert.ok(viewport && instance && spatial);
  instance.parentId = viewport.id;
  spatial.parentId = viewport.id;
  assert.throws(() => parseInteractiveDocument(document), /escopo pai/);
});
