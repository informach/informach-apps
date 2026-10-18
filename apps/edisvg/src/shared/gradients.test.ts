import assert from "node:assert/strict";
import { test } from "node:test";
import { INTERACTIVE_VERSION } from "@informach/edi-motion/runtime";
import { gradientFixture } from "../../tests/gradientFixture";
import { inheritedGradients } from "./appearance";
import { inspectAppearance, inspectAppearanceValue } from "./appearanceInspection";
import { applyComponent, compileArtboard } from "./components";
import { executeDocumentTransaction } from "./documentCommands";
import { compileInteractiveArtboard } from "./interactive";
import { parseProject } from "./project";
import { flattenScene } from "./scene.js";

test("gradients persist, compile safely, are retained in styles and switch to solid paint through the same atomic commands", () => {
  const fixture = gradientFixture();
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
  assert.equal(
    compileInteractiveArtboard(project, fixture.boardId).document.version,
    INTERACTIVE_VERSION,
  );
  assert.match(compileInteractiveArtboard(project, fixture.boardId).svg, /linearGradient/);
  assert.throws(() => parseProject({ ...project, version: 15 }), /v16/);
  run([
    {
      type: "appearance",
      operation: "save-style",
      style: {
        id: "style-gradient",
        name: "Gradiente",
        attrs: { fill: "#ffffff" },
        gradients: { fill: fixture.gradient },
      },
    },
  ]);
  run([
    { type: "scene", operation: "attrs", targetId: fixture.shapeId, value: { fill: "#008800" } },
  ]);
  assert.equal(project.artboards[0]?.scene.nodes[0]?.gradients, undefined);
  const restyled = run([
    {
      type: "appearance",
      operation: "apply-style",
      styleId: "style-gradient",
      targetIds: [fixture.shapeId],
    },
  ]);
  const scene = restyled.project.artboards[0]?.scene;
  assert.ok(scene);
  assert.equal(inspectAppearance(scene, { collection: "styles" }).total, 1);
  assert.equal(
    "stops" in (inspectAppearance(scene, { collection: "styles" }).items[0] ?? {}),
    false,
  );
  assert.deepEqual(
    JSON.parse(inspectAppearanceValue(scene, { collection: "styles", id: "style-gradient" }).value)
      .gradients.fill,
    fixture.gradient,
  );
  assert.deepEqual(
    restyled.project.artboards[0]?.scene.nodes[0]?.gradients?.fill,
    fixture.gradient,
  );
  const before = JSON.stringify(project);
  assert.throws(
    () =>
      run([
        {
          type: "scene",
          operation: "gradients",
          targetId: fixture.shapeId,
          value: { fill: { ...fixture.gradient, stops: [] } },
        },
      ]),
    /2–32 paradas/,
  );
  assert.equal(JSON.stringify(project), before);
  assert.deepEqual(parseProject(JSON.parse(before)), project);
  const styleOnly = structuredClone(project);
  for (const board of styleOnly.artboards)
    for (const { node } of flattenScene(board.scene)) delete node.gradients;
  assert.throws(() => parseProject({ ...styleOnly, version: 15 }), /Estilos.*v16/);
  const { artboards, assets: _assets, defaultArtboardId: _default, ...legacy } = styleOnly;
  assert.throws(
    () => parseProject({ ...legacy, version: 1, scene: artboards[0]?.scene }),
    /Estilos.*v16/,
  );
});

test("a component solid override replaces only its own gradient and cannot mutate its master source", () => {
  const fixture = gradientFixture(),
    board = fixture.project.artboards[0];
  assert.ok(board);
  const root = {
    ...structuredClone(board),
    id: "artboard-container",
    name: "Container",
    scene: { ...structuredClone(board.scene), nodes: [] },
  };
  fixture.project.artboards.push(root);
  fixture.project.defaultArtboardId = root.id;
  applyComponent(root.scene, {
    type: "component",
    operation: "create",
    name: "Instance",
    instance: {
      artboardId: board.id,
      animationId: null,
      width: 100,
      height: 100,
      fit: "contain",
      speed: 1,
      offsetSeconds: 0,
      overrides: [{ targetId: fixture.shapeId, attrs: { fill: "#008800" } }],
    },
  });
  const before = JSON.stringify(fixture.project),
    compiled = compileArtboard(fixture.project, root.id),
    shape = flattenScene(compiled.scene).find(({ node }) => node.tag === "rect")?.node;
  assert.equal(shape?.gradients, undefined);
  assert.equal(shape?.attrs.fill, "#008800");
  assert.equal(JSON.stringify(fixture.project), before);
  assert.deepEqual(board.scene.nodes[0]?.gradients?.fill, fixture.gradient);
});

test("inherited group gradients respect explicit colors and survive reparenting without a new dependency on the former parent", () => {
  const fixture = gradientFixture();
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
  run([
    { type: "scene", operation: "gradients", targetId: fixture.shapeId, value: null },
    { type: "scene", operation: "attrs", targetId: fixture.shapeId, value: { fill: "inherit" } },
  ]);
  const group = run([
    {
      type: "composition",
      operation: "group",
      targetIds: [fixture.shapeId],
      name: "Gradiente compartilhado",
    },
  ]).selected;
  assert.ok(group);
  run([
    { type: "scene", operation: "gradients", targetId: group, value: { fill: fixture.gradient } },
  ]);
  const first = project.artboards[0],
    shape =
      first && flattenScene(first.scene).find(({ node }) => node.id === fixture.shapeId)?.node;
  assert.ok(first && shape);
  assert.deepEqual(inheritedGradients(first.scene, shape).fill, fixture.gradient);
  run([
    {
      type: "composition",
      operation: "reparent",
      targetId: fixture.shapeId,
      parentId: null,
      index: 1,
    },
  ]);
  const detached = project.artboards[0]?.scene.nodes.find((node) => node.id === fixture.shapeId);
  assert.ok(detached);
  assert.deepEqual(detached.gradients?.fill, fixture.gradient);
  run([{ type: "scene", operation: "attrs", targetId: group, value: { fill: "#008800" } }]);
  assert.deepEqual(
    project.artboards[0]?.scene.nodes.find((node) => node.id === fixture.shapeId)?.gradients?.fill,
    fixture.gradient,
  );
});
