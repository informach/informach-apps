import assert from "node:assert/strict";
import { test } from "node:test";
import { patternId } from "@informach/edi-motion/graphics";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { executeDocumentTransaction } from "./documentCommands";
import { compileInteractiveArtboard } from "./interactive";
import { inspectLottieCompatibility } from "./lottie/prepare";
import { applySceneAttributes } from "./paintAttributes";
import { PATTERN_PRESETS, patternFromPreset } from "./patternPresets";
import { newProject, PROJECT_VERSION, parseProject } from "./project";
import { editScene, renderScene } from "./scene.js";

function patterned() {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    board = project.artboards[0];
  assert.ok(board);
  const run = (commands: unknown[]) => {
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
  const fill = patternFromPreset({
    preset: "dots",
    size: 12,
    weight: 0.5,
    angle: 30,
    color: "#E33A60",
    background: "#15171c",
  });
  run([{ type: "scene", operation: "gradients", targetId: id, value: { fill } }]);
  run([
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: "animation-pattern",
          name: "Padrão",
          frames: 10,
          fps: 10,
          mode: "loop",
          tracks: [],
        },
      },
    },
  ]);
  return { project, id, fill, boardId: board.id };
}

test("preset tiles are ordinary typed patterns with an optional rotation", () => {
  for (const preset of PATTERN_PRESETS)
    for (const background of ["none", "#000000"] as const) {
      const pattern = patternFromPreset({
        preset,
        size: 20,
        weight: 0.4,
        angle: 0,
        color: "#4FE3C1",
        background,
      });
      assert.equal(pattern.kind, "pattern");
      assert.equal(pattern.width, 20);
      assert.equal(pattern.transform, undefined);
      assert.equal(pattern.shapes.length, background === "none" ? 1 : 2);
      assert.equal(pattern.shapes.at(-1)?.fill, "#4fe3c1");
    }
  const rotated = patternFromPreset({
    preset: "stripes",
    size: 8,
    weight: 0.5,
    angle: 90,
    color: "#ffffff",
    background: "none",
  });
  assert.deepEqual(rotated.transform, [0, 1, -1, 0, 0, 0]);
  assert.throws(() =>
    patternFromPreset({
      preset: "dots",
      size: 0,
      weight: 0.5,
      angle: 0,
      color: "#ffffff",
      background: "none",
    }),
  );
});

test("projects store patterns from v23, refuse them under older headers and migrate v22 files", () => {
  const { project, id, fill } = patterned();
  assert.equal(PROJECT_VERSION, 23);
  const reopened = parseProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(reopened.artboards[0]?.scene.nodes[0]?.gradients?.fill, fill);
  assert.throws(
    () => parseProject({ ...project, version: 22 }),
    /Padrões tipados requerem projeto v23/,
  );
  const plain = newProject();
  assert.equal(parseProject({ ...plain, version: 22 }).version, 23);
  const styled = structuredClone(project),
    scene = styled.artboards[0]?.scene;
  assert.ok(scene);
  scene.nodes[0]?.gradients && delete scene.nodes[0].gradients;
  scene.styles = [{ id: "style-pattern", name: "Pontos", attrs: {}, gradients: { fill } }];
  assert.equal(parseProject(styled).artboards[0]?.scene.styles?.length, 1);
  assert.throws(
    () => parseProject({ ...styled, version: 22 }),
    /Estilos com padrões requerem projeto v23/,
  );
  const node = reopened.artboards[0]?.scene.nodes[0];
  assert.ok(node && node.id === id);
  applySceneAttributes(node, { fill: "#123456" });
  assert.equal(node.gradients, undefined);
  assert.equal(node.attrs.fill, "#123456");
});

test("rendered scenes and interactive blueprints carry one pooled pattern definition", () => {
  const { project, fill, boardId } = patterned(),
    scene = project.artboards[0]?.scene;
  assert.ok(scene);
  const copy = structuredClone(scene),
    id = copy.nodes[0]?.id ?? null;
  editScene(copy, id, "duplicate");
  const svg = renderScene(copy);
  assert.equal(svg.split("<pattern ").length - 1, 1);
  assert.equal(svg.split(`fill="url(#${patternId(fill)})"`).length - 1, 2);
  const compiled = compileInteractiveArtboard(project, boardId, {
    animationId: "animation-pattern",
  });
  assert.equal(compiled.document.version, 12);
  assert.equal(compiled.document.content[0]?.gradients?.fill?.kind, "pattern");
  assert.match(compiled.svg, /<pattern /);
  assert.throws(
    () => parseInteractiveDocument({ ...compiled.document, version: 11 }),
    /blueprint v12/,
  );
});

test("Lottie refuses patterned paint instead of flattening it to a solid colour", () => {
  const { project, boardId } = patterned(),
    report = inspectLottieCompatibility(project, {
      artboardId: boardId,
      animationId: "animation-pattern",
      alt: "Padrão",
      subdivisions: 1,
      confirmSampling: true,
      confirmRendererPrecision: true,
      confirmAnimationOnly: true,
    });
  assert.equal(report.supported, false);
  assert.ok(report.issues.some((issue) => /Padrões \(tiles\)/.test(issue.message)));
});
