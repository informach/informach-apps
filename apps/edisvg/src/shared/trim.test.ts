import assert from "node:assert/strict";
import { test } from "node:test";
import { INTERACTIVE_VERSION, parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { trimFixture } from "../../tests/trimFixture";
import { buildClipExport } from "../renderer/src/clipExport";
import { compileInteractiveArtboard } from "./interactive";
import { inspectLottieCompatibility } from "./lottie/prepare";
import { PROJECT_VERSION, parseProject } from "./project";
import { inspectRig, inspectRigValue } from "./rigInspection";

test("trim preserves its project v21/portable v10 minimum across newer formats, refuses capability downgrades or implicit arc conversion, and reaches the sampled consumers", () => {
  const fixture = trimFixture(),
    project = fixture.project(),
    before = structuredClone(project);
  assert.equal(project.version, PROJECT_VERSION);
  assert.equal(parseProject({ ...project, version: 21 }).version, PROJECT_VERSION);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
  for (const version of [15, 19, 20])
    assert.throws(() => parseProject({ ...project, version }), /v21/);
  const old = trimFixture(false).project();
  assert.equal(parseProject({ ...old, version: 20 }).version, PROJECT_VERSION);
  const compiled = compileInteractiveArtboard(project, fixture.boardId, {
    animationId: fixture.animationId,
  });
  assert.equal(compiled.document.version, INTERACTIVE_VERSION);
  assert.equal(parseInteractiveDocument({ ...compiled.document, version: 10 }).version, 10);
  assert.deepEqual(
    parseInteractiveDocument(JSON.parse(JSON.stringify(compiled.document))),
    compiled.document,
  );
  assert.throws(() => parseInteractiveDocument({ ...compiled.document, version: 9 }), /v10/);
  const arc = structuredClone(project),
    shape = arc.artboards[0]?.scene.nodes[0];
  assert.ok(shape);
  shape.attrs.d = "M20 80 A100 100 0 0 1 220 80";
  assert.throws(() => parseProject(arc), /conversão Bézier explícita/);
  const summary = inspectRig(project.artboards[0]?.rig, { collection: "trims" });
  assert.equal(summary.total, 1);
  assert.equal(
    JSON.parse(
      inspectRigValue(project.artboards[0]?.rig, { collection: "trims", id: "trim-draw" }).value,
    ).targetId,
    fixture.shapeId,
  );
  const report = inspectLottieCompatibility(project, {
    artboardId: fixture.boardId,
    animationId: fixture.animationId,
  });
  // Since 5.29 both sampled consumers represent trim instead of refusing it.
  assert.equal(
    report.issues.some((issue) => issue.code === "trim"),
    false,
  );
  const svg = buildClipExport(
    project,
    fixture.animationId,
    {
      format: "svg",
      alt: "Trim",
      reduced: false,
      offscreen: false,
    },
    "",
  ).content;
  assert.match(svg, /<animate attributeName="d"[^>]*calcMode="discrete"/);
  assert.deepEqual(project, before);
});

test("trim edits respect inherited locks, cannot orphan channels or geometry, and mixed failing transactions publish nothing", () => {
  const fixture = trimFixture(),
    before = structuredClone(fixture.project()),
    rig = before.artboards[0]?.rig;
  assert.ok(rig?.trims?.[0]);
  const trim = rig.trims[0];
  assert.ok(trim);
  assert.throws(
    () => fixture.run([{ type: "rig", operation: "replace", value: { ...rig, trims: [] } }]),
    /órfão/,
  );
  assert.throws(() =>
    fixture.run([
      { type: "scene", operation: "rename", targetId: fixture.shapeId, value: "Must not publish" },
      {
        type: "rig",
        operation: "replace",
        value: { ...rig, trims: [{ ...trim, end: 2 }] },
      },
    ]),
  );
  assert.deepEqual(fixture.project(), before);
  assert.throws(() =>
    fixture.run([{ type: "scene-batch", operation: "delete", targetIds: [fixture.shapeId] }]),
  );
  assert.deepEqual(fixture.project(), before);
  fixture.run([{ type: "scene", operation: "lock", targetId: fixture.shapeId, value: true }]);
  const locked = structuredClone(fixture.project());
  assert.throws(
    () =>
      fixture.run([
        {
          type: "rig",
          operation: "replace",
          value: { ...rig, trims: [{ ...trim, start: 0.25 }] },
        },
      ]),
    /bloqueado/,
  );
  assert.deepEqual(fixture.project(), locked);
});

test("a component override cannot smuggle a native arc into a trimmed master or publish part of the failed transaction", () => {
  const fixture = trimFixture(),
    before = structuredClone(fixture.project());
  assert.throws(
    () =>
      fixture.run([
        {
          type: "artboard",
          operation: "create",
          id: "artboard-trim-override",
          name: "Override",
          width: 300,
          height: 180,
        },
        {
          type: "component",
          operation: "create",
          name: "Arc override",
          instance: {
            artboardId: fixture.boardId,
            animationId: fixture.animationId,
            width: 300,
            height: 180,
            fit: "contain",
            speed: 1,
            offsetSeconds: 0,
            overrides: [
              { targetId: fixture.shapeId, attrs: { d: "M20 80 A100 100 0 0 1 220 80" } },
            ],
            inputOverrides: [],
          },
        },
      ]),
    /conversão Bézier explícita/,
  );
  assert.deepEqual(fixture.project(), before);
});

test("artboard copies remap trim owners and preserve shared animation identity without changing the master", () => {
  const fixture = trimFixture(),
    master = structuredClone(fixture.project().artboards[0]);
  fixture.run([
    {
      type: "artboard",
      operation: "duplicate",
      id: fixture.boardId,
      newId: "artboard-trim-copy",
      name: "Cópia",
    },
  ]);
  const project = fixture.project(),
    copy = project.artboards[1];
  assert.ok(copy?.rig?.trims?.[0]);
  assert.notEqual(copy.rig.trims[0].targetId, fixture.shapeId);
  assert.equal(copy.rig.trims[0].targetId, copy.scene.nodes[0]?.id);
  assert.equal(copy.rig.parameterClips?.[0]?.animationId, fixture.animationId);
  const compiled = compileInteractiveArtboard(project, copy.id, {
    animationId: copy.rig.parameterClips?.[0]?.animationId,
  });
  assert.equal(
    compiled.document.playback.rigScopes?.[0]?.rig.trims?.[0]?.targetId,
    copy.rig.trims[0].targetId,
  );
  assert.deepEqual(project.artboards[0], master);
});
