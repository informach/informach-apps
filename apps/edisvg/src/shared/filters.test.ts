import assert from "node:assert/strict";
import { test } from "node:test";
import { filterId } from "@informach/edi-motion/graphics";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { executeDocumentTransaction } from "./documentCommands";
import { describeFilter, FILTER_PRESETS, filterFromPreset } from "./filterPresets";
import { compileInteractiveArtboard } from "./interactive";
import { inspectLottieCompatibility } from "./lottie/prepare";
import { newProject, parseProject } from "./project";
import { renderScene } from "./scene.js";

function filtered() {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    run = (commands: unknown[]) => {
      const result = executeDocumentTransaction(
        { project, revision, sessionId },
        { projectId: project.id, sessionId, revision, commands },
      );
      project = result.project;
      revision = result.revision;
    };
  run([{ type: "scene", operation: "add", targetId: null, value: "rect" }]);
  const id = project.artboards[0]?.scene.nodes[0]?.id;
  assert.ok(id);
  const filter = filterFromPreset({
    preset: "drop-shadow",
    amount: 4,
    dx: 6,
    dy: 3,
    color: "#102030",
    opacity: 0.5,
  });
  run([
    { type: "scene", operation: "attrs", targetId: id, value: { transform: "scale(2)" } },
    { type: "scene", operation: "filter", targetId: id, value: filter },
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: "animation-filter",
          name: "Filtro",
          frames: 10,
          fps: 10,
          mode: "loop",
          tracks: [],
        },
      },
    },
  ]);
  const board = project.artboards[0];
  assert.ok(board);
  return {
    project,
    id,
    filter,
    boardId: board.id,
    run: (commands: unknown[]) => (run(commands), project),
  };
}

test("filter presets are ordinary typed chains", () => {
  for (const preset of FILTER_PRESETS) {
    const filter = filterFromPreset({
      preset,
      amount: 3,
      dx: 1,
      dy: 2,
      color: "#ff0000",
      opacity: 0.5,
    });
    assert.equal(filter.colorInterpolation, "sRGB");
    assert.ok(filter.primitives.length >= 1);
  }
  const glow = filterFromPreset({
    preset: "glow",
    amount: 5,
    dx: 0,
    dy: 0,
    color: "#4fe3c1",
    opacity: 1,
  });
  assert.equal(describeFilter(glow), "desfoque → cor → composição → junção");
  assert.deepEqual(
    filterFromPreset({ preset: "grayscale", amount: 9, dx: 0, dy: 0, color: "#000000", opacity: 1 })
      .primitives[0],
    { kind: "colorMatrix", in: "SourceGraphic", type: "saturate", values: [0] },
  );
});

test("projects keep filters from v23 and the panel command removes them in one edit", () => {
  const { project, id, filter, run } = filtered();
  assert.deepEqual(
    parseProject(JSON.parse(JSON.stringify(project))).artboards[0]?.scene.nodes[0]?.filter,
    filter,
  );
  assert.throws(
    () => parseProject({ ...project, version: 22 }),
    /Filtros tipados requerem projeto v23/,
  );
  const cleared = run([{ type: "scene", operation: "filter", targetId: id, value: null }]);
  assert.equal(cleared.artboards[0]?.scene.nodes[0]?.filter, undefined);
  assert.throws(() =>
    run([
      { type: "scene", operation: "filter", targetId: id, value: { ...filter, primitives: [] } },
    ]),
  );
});

test("the filter sits on the shape inside its transform and travels to the blueprint", () => {
  const { project, filter, boardId } = filtered(),
    scene = project.artboards[0]?.scene;
  assert.ok(scene);
  const svg = renderScene(scene),
    id = filterId(filter);
  assert.equal(svg.split("<filter ").length - 1, 1);
  assert.match(svg, new RegExp(`<rect[^>]*transform="scale\\(2\\)"[^>]*filter="url\\(#${id}\\)"`));
  assert.doesNotMatch(svg, new RegExp(`<g[^>]*filter="url\\(#${id}\\)"`));
  const compiled = compileInteractiveArtboard(project, boardId, {
    animationId: "animation-filter",
  });
  assert.deepEqual(compiled.document.content[0]?.filter, filter);
  assert.match(compiled.svg, /<feDropShadow /);
  assert.throws(
    () => parseInteractiveDocument({ ...compiled.document, version: 11 }),
    /Filtros requerem blueprint v12/,
  );
});

test("Lottie refuses filters on any node, including groups", () => {
  const { project, boardId } = filtered(),
    report = inspectLottieCompatibility(project, {
      artboardId: boardId,
      animationId: "animation-filter",
      alt: "Filtro",
      subdivisions: 1,
      confirmSampling: true,
      confirmRendererPrecision: true,
      confirmAnimationOnly: true,
    });
  assert.equal(report.supported, false);
  assert.ok(report.issues.some((issue) => /Filtros \(desfoque, sombra, cor\)/.test(issue.message)));
});
