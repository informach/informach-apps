import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { lottieFixture } from "../../../tests/lottieFixture";
import { editScene } from "../scene.js";
import { inspectLottieCompatibility, prepareLottie, svgOpacity } from "./prepare";

test("Lottie preparation is snapshot-only and declares sampling/final-frame policy before emission", () => {
  const fixture = lottieFixture(),
    before = JSON.stringify(fixture.project),
    options = { artboardId: fixture.boardId, animationId: fixture.clipId };
  const prepared = prepareLottie(fixture.project, options);
  assert.equal(prepared.report.supported, true);
  assert.equal(prepared.report.frames, 31);
  assert.equal(prepared.report.fps, 30);
  assert.equal(prepared.report.requiresSamplingConsent, true);
  assert.equal(prepared.report.requiresRendererPrecisionConsent, true);
  assert.equal(prepared.options.confirmRendererPrecision, false);
  assert.ok(prepared.report.issues.some((issue) => issue.code === "renderer-precision"));
  assert.equal(prepared.report.requiresAnimationOnlyConsent, false);
  const fill = prepared.paints.get(fixture.shapeId);
  assert.ok(fill?.ty === "fl");
  assert.deepEqual(fill.c.k, [227 / 255, 58 / 255, 96 / 255, 1]);
  assert.equal(prepared.geometries.get(fixture.shapeId)?.[0]?.points.length, 4);
  assert.equal(JSON.stringify(fixture.project), before);
  assert.equal(svgOpacity("50%"), 0.5);
  assert.equal(svgOpacity(undefined), 1);
  assert.throws(() => svgOpacity("not-a-number"));
  const board = fixture.project.artboards[0];
  assert.ok(board);
  editScene(board.scene, fixture.shapeId, "attrs", { "fill-opacity": "50%" });
  const translucent = prepareLottie(fixture.project, options).paints.get(fixture.shapeId);
  assert.ok(translucent?.ty === "fl");
  assert.equal(translucent.o.k, 50);
});
test("Lottie compatibility accepts px strokes, refuses relative units/unsupported content, and flags semantic conversion", () => {
  const fixture = lottieFixture(),
    board = fixture.project.artboards[0];
  assert.ok(board);
  const options = { artboardId: fixture.boardId, animationId: fixture.clipId };
  editScene(board.scene, fixture.shapeId, "attrs", {
    d: "M20 30C20 30 80 30 80 30C80 30 80 90 80 90C80 90 20 90 20 90C20 90 20 30 20 30Z",
  });
  editScene(board.scene, fixture.shapeId, "attrs", { stroke: "red", "stroke-width": "1px" });
  assert.equal(inspectLottieCompatibility(fixture.project, options).supported, true);
  editScene(board.scene, fixture.shapeId, "attrs", { "stroke-width": "1em" });
  assert.equal(inspectLottieCompatibility(fixture.project, options).supported, false);
  editScene(board.scene, fixture.shapeId, "attrs", { stroke: "none" });
  editScene(board.scene, null, "add", "text");
  assert.ok(
    inspectLottieCompatibility(fixture.project, options).issues.some(
      (issue) => issue.code === "content",
    ),
  );
  const text = board.scene.nodes.at(-1);
  assert.ok(text);
  editScene(board.scene, text.id, "delete");
  editScene(board.scene, fixture.shapeId, "semantics", { kind: "image", label: "Arte" });
  assert.equal(
    inspectLottieCompatibility(fixture.project, options).requiresAnimationOnlyConsent,
    true,
  );
  board.behavior = {
    ...emptyBehavior(),
    inputs: [{ id: "input-x", name: "Valor", kind: "number", initial: 0, min: 0, max: 1 }],
  };
  editScene(board.scene, fixture.shapeId, "semantics", null);
  assert.equal(
    inspectLottieCompatibility(fixture.project, options).requiresAnimationOnlyConsent,
    true,
  );
});
test("Lottie compatibility bounds frames/fps and reports fractional dimensions without generating output", () => {
  const fixture = lottieFixture(),
    clip = fixture.project.motion.animations[0],
    board = fixture.project.artboards[0];
  assert.ok(clip);
  assert.ok(board);
  const options = { artboardId: fixture.boardId, animationId: fixture.clipId, subdivisions: 4 };
  clip.fps = 120;
  assert.equal(inspectLottieCompatibility(fixture.project, options).supported, false);
  clip.fps = 30;
  clip.frames = 1200;
  assert.equal(inspectLottieCompatibility(fixture.project, options).supported, false);
  clip.frames = 30;
  board.scene.viewBox[2] = 300.5;
  assert.ok(
    inspectLottieCompatibility(fixture.project, options).issues.some(
      (issue) => issue.code === "dimensions",
    ),
  );
});
