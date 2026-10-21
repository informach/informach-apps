import assert from "node:assert/strict";
import { test } from "node:test";
import { lottieFixture } from "../../../tests/lottieFixture";
import { editScene } from "../scene.js";
import { compileLottie, LottieExportError } from "./compile";
import { shapeLayers } from "./model";

test("Lottie compilation requires explicit conversion consents and leaves the source unchanged", () => {
  const fixture = lottieFixture(),
    options = {
      artboardId: fixture.boardId,
      animationId: fixture.clipId,
      confirmRendererPrecision: true,
    },
    before = structuredClone(fixture.project);
  assert.throws(() => compileLottie(fixture.project, options), LottieExportError);
  assert.throws(
    () =>
      compileLottie(fixture.project, {
        ...options,
        confirmSampling: true,
        confirmRendererPrecision: false,
      }),
    (error: unknown) =>
      error instanceof LottieExportError &&
      /precisão/.test(error.message) &&
      error.report.requiresRendererPrecisionConsent,
  );
  const progress: [number, number][] = [],
    output = compileLottie(fixture.project, { ...options, confirmSampling: true }, (done, total) =>
      progress.push([done, total]),
    );
  assert.deepEqual(fixture.project, before);
  assert.deepEqual(progress[0], [0, 32]);
  assert.deepEqual(progress.at(-1), [32, 32]);
  assert.equal(output.extension, "lottie.json");
  assert.deepEqual(JSON.parse(output.content), output.document);
  assert.equal(output.document.w, 300);
  assert.equal(output.document.h, 200);
  assert.deepEqual(output.document.assets, []);
  assert.doesNotMatch(output.content, /"artboards"|"expressions"|https?:|"href"/);
  const doubled = compileLottie(fixture.project, {
    ...options,
    subdivisions: 2,
    confirmSampling: true,
  });
  assert.equal(doubled.document.fr, 60);
  assert.equal(doubled.document.op, 61);
  const board = fixture.project.artboards[0];
  assert.ok(board);
  editScene(board.scene, fixture.shapeId, "semantics", { kind: "image", label: "Arte" });
  assert.throws(
    () => compileLottie(fixture.project, { ...options, confirmSampling: true }),
    /semântica/,
  );
  assert.equal(
    compileLottie(fixture.project, {
      ...options,
      confirmSampling: true,
      confirmAnimationOnly: true,
    }).report.requiresAnimationOnlyConsent,
    true,
  );
});

test("Lottie stores static geometry compactly, includes once's endpoint, and refuses unsupported output", () => {
  const fixture = lottieFixture(),
    clip = fixture.project.motion.animations[0],
    board = fixture.project.artboards[0];
  assert.ok(clip);
  assert.ok(board);
  clip.tracks = [];
  const output = compileLottie(fixture.project, {
    artboardId: fixture.boardId,
    animationId: clip.id,
    confirmSampling: true,
    confirmRendererPrecision: true,
  });
  assert.equal(output.document.op, 31);
  const group = shapeLayers(output.document)[0]?.shapes[0];
  assert.ok(group?.ty === "gr");
  const path = group.it.find((element) => element.ty === "sh");
  assert.ok(path?.ty === "sh");
  assert.equal(path.ks.a, 0);
  if (path.ks.a !== 0) throw new Error("Expected static path");
  assert.deepEqual(path.ks.k.v[0], [10, 10]);
  assert.ok(output.content.length < 2000);
  editScene(board.scene, fixture.shapeId, "attrs", { stroke: "red", "stroke-dasharray": "2 3" });
  assert.throws(
    () =>
      compileLottie(fixture.project, {
        artboardId: fixture.boardId,
        animationId: clip.id,
        confirmSampling: true,
      }),
    /cúbico explícito/,
  );
});

test("Lottie refuses aggregate frame/geometry cost before emitting progress or partial output", () => {
  const fixture = lottieFixture(),
    clip = fixture.project.motion.animations[0],
    board = fixture.project.artboards[0];
  assert.ok(clip);
  assert.ok(board);
  clip.frames = 1198;
  editScene(board.scene, fixture.shapeId, "attrs", { d: `M0 0${"L10 10".repeat(300)}Z` });
  let started = false;
  assert.throws(
    () =>
      compileLottie(
        fixture.project,
        { artboardId: fixture.boardId, animationId: clip.id, confirmSampling: true },
        () => {
          started = true;
        },
      ),
    /orçamento de amostragem/,
  );
  assert.equal(started, false);
});
