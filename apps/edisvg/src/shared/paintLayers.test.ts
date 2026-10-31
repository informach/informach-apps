import assert from "node:assert/strict";
import { test } from "node:test";
import type { PaintLayer } from "@informach/edi-motion/graphics";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { executeDocumentTransaction } from "./documentCommands";
import { filterFromPreset } from "./filterPresets";
import { compileInteractiveArtboard } from "./interactive";
import { inspectLottieCompatibility } from "./lottie/prepare";
import { newProject, parseProject } from "./project";
import { renderScene } from "./scene.js";

const gradient = {
  kind: "linear" as const,
  units: "objectBoundingBox" as const,
  spread: "pad" as const,
  x1: 0,
  y1: 0,
  x2: 1,
  y2: 0,
  stops: [
    { offset: 0, color: "#ff0000", opacity: 1 },
    { offset: 1, color: "#0000ff", opacity: 1 },
  ],
};
const layers: PaintLayer[] = [
  {
    id: "paint-outline",
    kind: "stroke",
    color: "#123456",
    opacity: 0.5,
    visible: true,
    width: 6,
    linecap: "round",
  },
  { id: "paint-hidden", kind: "fill", color: "#ff00ff", opacity: 1, visible: false },
  { id: "paint-sheen", kind: "fill", color: "#000000", paint: gradient, opacity: 1, visible: true },
];

function layered() {
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
      return project;
    };
  run([
    {
      type: "scene",
      operation: "add",
      targetId: null,
      value: {
        tag: "path",
        attrs: { d: "M10 10 L90 10 L90 90 Z", fill: "#4fe3c1", "fill-rule": "evenodd" },
      },
    },
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: "animation-layers",
          name: "Camadas",
          frames: 10,
          fps: 10,
          mode: "loop",
          tracks: [],
        },
      },
    },
  ]);
  const id = project.artboards[0]?.scene.nodes[0]?.id;
  assert.ok(id);
  run([{ type: "scene", operation: "paint-layers", targetId: id, value: layers }]);
  return { project: () => project, id, run, boardId: project.artboards[0]?.id ?? "" };
}

test("paint layers need project v25 and null removes them", () => {
  const { project, id, run } = layered();
  assert.deepEqual(
    parseProject(JSON.parse(JSON.stringify(project()))).artboards[0]?.scene.nodes[0]?.paintLayers,
    layers,
  );
  assert.throws(
    () => parseProject({ ...project(), version: 24 }),
    /Camadas de pintura requerem projeto v25/,
  );
  const cleared = run([{ type: "scene", operation: "paint-layers", targetId: id, value: null }]);
  assert.equal(cleared.artboards[0]?.scene.nodes[0]?.paintLayers, undefined);
});

test("the document refuses layers on text, stroke fields on fills, repeated ids and filters", () => {
  const { id, run } = layered();
  assert.throws(() =>
    run([
      {
        type: "scene",
        operation: "paint-layers",
        targetId: id,
        value: [{ ...layers[1], visible: true, width: 2 }],
      },
    ]),
  );
  assert.throws(() =>
    run([
      {
        type: "scene",
        operation: "paint-layers",
        targetId: id,
        value: [layers[0], layers[0]],
      },
    ]),
  );
  assert.throws(
    () =>
      run([
        {
          type: "scene",
          operation: "filter",
          targetId: id,
          value: filterFromPreset({
            preset: "blur",
            amount: 2,
            dx: 0,
            dy: 0,
            color: "#000000",
            opacity: 1,
          }),
        },
      ]),
    /camadas de pintura extras com filtro/i,
  );
  const text = run([{ type: "scene", operation: "add", targetId: null, value: "text" }])
    .artboards[0]?.scene.nodes[1]?.id;
  assert.throws(
    () => run([{ type: "scene", operation: "paint-layers", targetId: text, value: layers }]),
    /forma ou caminho/,
  );
});

test("visible layers are drawn as shape copies after the base shape, in list order", () => {
  const { project } = layered(),
    scene = project().artboards[0]?.scene;
  assert.ok(scene);
  const svg = renderScene(scene, { editor: true });
  const wrapper = /<g data-object="[^"]+"[^>]*>(.*?)<\/g>/.exec(svg)?.[1] ?? "";
  const paths = [...wrapper.matchAll(/<path ([^>]*)><\/path>/g)].map((match) => match[1] ?? "");
  assert.equal(paths.length, 3, "base shape plus the two visible layers");
  assert.match(paths[0] ?? "", /^fill="#4fe3c1" d="M10 10 L90 10 L90 90 Z"/);
  assert.doesNotMatch(paths[0] ?? "", /data-edi-paint-layer/);
  assert.match(paths[1] ?? "", /data-edi-paint-layer="paint-outline"/);
  assert.match(paths[1] ?? "", /fill="none" stroke="#123456" stroke-opacity="0.5"/);
  assert.match(paths[1] ?? "", /stroke-width="6" stroke-linecap="round"/);
  assert.match(paths[2] ?? "", /data-edi-paint-layer="paint-sheen"/);
  assert.match(
    paths[2] ?? "",
    /fill="url\(#edi-gradient-[\da-f]+\)" fill-opacity="1" stroke="none"/,
  );
  for (const path of paths) assert.match(path, /fill-rule="evenodd"/);
  assert.doesNotMatch(svg, /#ff00ff/, "hidden layers draw nothing");
  assert.equal(svg.split("<linearGradient ").length - 1, 1);
});

test("layers travel to blueprint v14 and Lottie refuses them without dropping them", () => {
  const { project, boardId } = layered();
  const compiled = compileInteractiveArtboard(project(), boardId, {
    animationId: "animation-layers",
  });
  assert.deepEqual(compiled.document.content[0]?.paintLayers, layers);
  assert.equal(compiled.svg.split("data-edi-paint-layer=").length - 1, 2);
  assert.throws(
    () => parseInteractiveDocument({ ...compiled.document, version: 13 }),
    /Camadas de pintura requerem blueprint v14/,
  );
  const report = inspectLottieCompatibility(project(), {
    artboardId: boardId,
    animationId: "animation-layers",
    alt: "Camadas",
    subdivisions: 1,
    confirmSampling: true,
    confirmRendererPrecision: true,
    confirmAnimationOnly: true,
  });
  assert.equal(report.supported, false);
  assert.ok(report.issues.some((issue) => issue.code === "paint-layers"));
});

test("a painted mask source with extra layers is refused", () => {
  const { project, id, run } = layered();
  const target = run([{ type: "scene", operation: "add", targetId: null, value: "rect" }])
    .artboards[0]?.scene.nodes[1]?.id;
  assert.ok(target && project());
  assert.throws(
    () =>
      run([
        {
          type: "scene",
          operation: "effects",
          targetId: target,
          value: { mask: { sourceId: id, rule: "nonzero", opacity: 1, mode: "luminance" } },
        },
      ]),
    /camadas de pintura extras/,
  );
});

test("a trim can belong to one paint layer and needs that layer", () => {
  const { project, id, run, boardId } = layered();
  const trim = {
    id: "trim-outline",
    targetId: id,
    layerId: "paint-outline",
    start: 0.5,
    end: 1,
    offset: 0,
    tolerance: 0.01,
    mode: "sequential" as const,
  };
  const rig = { version: 3 as const, bones: [], constraints: [], targets: [] };
  run([{ type: "rig", operation: "replace", value: { ...rig, trims: [trim] } }]);
  assert.deepEqual(project().artboards[0]?.rig?.trims, [trim]);
  // The shape keeps its own trim beside the layer's.
  run([
    {
      type: "rig",
      operation: "replace",
      value: { ...rig, trims: [trim, { ...trim, id: "trim-shape", layerId: undefined }] },
    },
  ]);
  assert.throws(
    () =>
      run([
        {
          type: "rig",
          operation: "replace",
          value: { ...rig, trims: [trim, { ...trim, id: "trim-twice" }] },
        },
      ]),
    /único/,
  );
  assert.throws(
    () =>
      run([
        {
          type: "rig",
          operation: "replace",
          value: { ...rig, trims: [{ ...trim, layerId: "paint-missing" }] },
        },
      ]),
    /sem a camada/,
  );
  assert.throws(
    () => run([{ type: "scene", operation: "paint-layers", targetId: id, value: null }]),
    /Remova o trim antes da camada/,
  );
  const compiled = compileInteractiveArtboard(project(), boardId, {
    animationId: "animation-layers",
  });
  assert.equal(compiled.document.playback.rigScopes?.[0]?.rig.trims?.[0]?.layerId, "paint-outline");
  const scope = compiled.document.playback.rigScopes?.[0];
  assert.ok(scope);
  assert.throws(
    () =>
      parseInteractiveDocument({
        ...compiled.document,
        content: compiled.document.content.map((object) => {
          const { paintLayers: _layers, ...rest } = object;
          return rest;
        }),
      }),
    /sem a camada/,
  );
});
