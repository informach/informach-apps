import assert from "node:assert/strict";
import { test } from "node:test";
import { INTERACTIVE_VERSION, parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { legacyInteractive } from "../../tests/legacyInteractive";
import { vectorEffectFixture } from "../../tests/vectorEffectFixture";
import { buildClipExport } from "../renderer/src/clipExport";
import { applyComponent, compileArtboard } from "./components";
import { executeDocumentTransaction } from "./documentCommands";
import { compileInteractiveArtboard } from "./interactive";
import { requiresInteractiveExport } from "./interactiveCapabilities";
import { type Artboard, PROJECT_VERSION, parseProject } from "./project";
import { editScene, flattenScene } from "./scene.js";

test("native effect sources require project v20/blueprint v9 while ordinary v19/v8 paths remain readable", () => {
  const fixture = vectorEffectFixture(),
    board = fixture.project.artboards[0];
  assert.ok(board);
  const source = flattenScene(board.scene).find(({ node }) => node.id === fixture.sourceId)?.node;
  assert.ok(source);
  source.tag = "circle";
  source.attrs = { cx: "20", cy: "30", r: "25", fill: "white", stroke: "none" };
  const project = parseProject(fixture.project),
    compiled = compileInteractiveArtboard(project, board.id);
  assert.equal(project.version, PROJECT_VERSION);
  assert.equal(compiled.document.version, INTERACTIVE_VERSION);
  assert.match(compiled.svg, /<circle[^>]*r="25"/);
  assert.throws(() => parseProject({ ...project, version: 19 }), /v20/);
  assert.throws(() => parseInteractiveDocument(legacyInteractive(compiled.document, 8)), /v9/);
  const historical = vectorEffectFixture();
  assert.equal(parseProject({ ...historical.project, version: 19 }).version, PROJECT_VERSION);
  assert.equal(
    parseInteractiveDocument(
      legacyInteractive(
        compileInteractiveArtboard(historical.project, historical.boardId).document,
        8,
      ),
    ).version,
    8,
  );
});

test("unrelated empty SVG paths remain valid when effects require spatial playback metadata", () => {
  const fixture = vectorEffectFixture(),
    board = fixture.project.artboards[0];
  assert.ok(board);
  const emptyId = editScene(board.scene, null, "add", { tag: "path", attrs: { d: "M0 0L1 1" } });
  assert.ok(emptyId);
  editScene(board.scene, emptyId, "attrs", { d: "" });
  const compiled = compileInteractiveArtboard(fixture.project, board.id);
  assert.equal(
    compiled.document.playback.objects.find((object) => object.id === emptyId)?.geometry,
    undefined,
  );
  assert.ok(compiled.document.content.some((object) => object.id === emptyId));
  assert.throws(
    () =>
      editScene(board.scene, fixture.targetId, "effects", {
        clip: { sourceId: emptyId, rule: "nonzero" },
      }),
    /não vazio/,
  );
});

test("typed effects roundtrip, compile versioned local references, and reject deletion/locked/invalid edits atomically", () => {
  const fixture = vectorEffectFixture();
  let project = fixture.project,
    revision = 0;
  const sessionId = crypto.randomUUID(),
    run = (commands: unknown[]) => {
      const result = executeDocumentTransaction(
        { project, revision, sessionId },
        { projectId: project.id, revision, sessionId, commands },
      );
      project = result.project;
      revision = result.revision;
      return result;
    };
  const compiled = compileInteractiveArtboard(project, fixture.boardId, {
    animationId: fixture.animationId,
  });
  assert.equal(project.version, PROJECT_VERSION);
  assert.equal(compiled.document.version, INTERACTIVE_VERSION);
  assert.equal(compiled.document.playback.version, 3);
  assert.match(compiled.svg, /clipPathUnits="userSpaceOnUse"/);
  assert.match(compiled.svg, /mask-type="alpha"/);
  assert.equal(requiresInteractiveExport(project), true);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
  assert.throws(() => parseProject({ ...project, version: 16 }), /v17/);
  assert.throws(() => parseInteractiveDocument(legacyInteractive(compiled.document, 4)), /v5/);
  const mismatched = structuredClone(compiled.document);
  const content = mismatched.content.find((object) => object.id === fixture.sourceId);
  assert.ok(content);
  content.parentId = fixture.targetId;
  assert.throws(() => parseInteractiveDocument(mismatched), /Hierarquia visual/);
  for (const commands of [
    [{ type: "scene", targetId: fixture.sourceId, operation: "delete" }],
    [
      {
        type: "scene",
        targetId: fixture.targetId,
        operation: "effects",
        value: { clip: { sourceId: fixture.targetId, rule: "nonzero" } },
      },
    ],
  ]) {
    const before = JSON.stringify(project);
    assert.throws(() => run(commands));
    assert.equal(JSON.stringify(project), before);
  }
  assert.throws(
    () =>
      buildClipExport(
        project,
        fixture.animationId,
        {
          format: "svg",
          alt: "Silhueta",
          reduced: true,
          offscreen: true,
          confirmAnimationOnly: true,
        },
        "",
      ),
    /HTML interativo/,
  );
  run([{ type: "scene", targetId: fixture.targetId, operation: "lock", value: true }]);
  assert.throws(
    () => run([{ type: "scene", targetId: fixture.targetId, operation: "effects", value: null }]),
    /Desbloqueie/,
  );
  run([{ type: "scene", targetId: fixture.targetId, operation: "lock", value: false }]);
  run([
    { type: "scene", targetId: fixture.targetId, operation: "effects", value: null },
    { type: "scene", targetId: fixture.sourceId, operation: "delete" },
  ]);
  assert.equal(project.artboards[0]?.scene.nodes.length, 1);
});

test("artboard, subtree and sibling duplication remap effects and reused components never point to a foreign master instance", () => {
  const fixture = vectorEffectFixture(),
    sessionId = crypto.randomUUID();
  const duplicate = executeDocumentTransaction(
    { project: fixture.project, revision: 0, sessionId },
    {
      projectId: fixture.project.id,
      revision: 0,
      sessionId,
      commands: [
        {
          type: "artboard",
          operation: "duplicate",
          id: fixture.boardId,
          newId: "artboard-effects-copy",
          name: "Cópia",
        },
      ],
    },
  );
  const copy = duplicate.project.artboards[1];
  assert.ok(copy);
  const copiedSource = copy.scene.nodes.find((node) => node.tag === "path"),
    copiedTarget = copy.scene.nodes.find((node) => node.effects);
  assert.equal(copiedTarget?.effects?.clip?.sourceId, copiedSource?.id);
  assert.notEqual(copiedSource?.id, fixture.sourceId);
  const siblings = executeDocumentTransaction(
    { project: fixture.project, revision: 0, sessionId },
    {
      projectId: fixture.project.id,
      revision: 0,
      sessionId,
      commands: [
        {
          type: "scene-batch",
          operation: "duplicate",
          targetIds: [fixture.targetId, fixture.sourceId],
        },
      ],
    },
  );
  const siblingsCopy = siblings.project.artboards[0]?.scene.nodes.filter(
    (node) => node.id !== fixture.targetId && node.id !== fixture.sourceId,
  );
  assert.equal(
    siblingsCopy?.find((node) => node.effects)?.effects?.clip?.sourceId,
    siblingsCopy?.find((node) => node.tag === "path")?.id,
  );
  const root: Artboard = {
    id: "artboard-effects-host",
    name: "Host",
    scene: { viewBox: [0, 0, 100, 100], nodes: [] },
  };
  fixture.project.artboards.push(root);
  for (let index = 0; index < 2; index++)
    applyComponent(root.scene, {
      type: "component",
      operation: "create",
      name: `Instance ${index}`,
      instance: {
        artboardId: fixture.boardId,
        animationId: fixture.animationId,
        width: 100,
        height: 100,
        fit: "contain",
        speed: 1,
        offsetSeconds: 0,
        overrides: [],
      },
    });
  const compiled = compileArtboard(fixture.project, root.id),
    entries = flattenScene(compiled.scene);
  for (const { node } of entries.filter(({ node }) => node.effects)) {
    const source = entries.find(
      ({ node: source }) => source.id === node.effects?.clip?.sourceId,
    )?.node;
    assert.ok(source);
    assert.deepEqual(
      compiled.sourceMap.get(source.id)?.instancePath,
      compiled.sourceMap.get(node.id)?.instancePath,
    );
    assert.notEqual(source.id, fixture.sourceId);
  }
});
