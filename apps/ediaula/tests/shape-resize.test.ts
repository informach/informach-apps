import assert from "node:assert/strict";
import { test } from "node:test";
import { editedAnnotation, fillsFrame } from "../src/shared/annotation.ts";
import { SHAPE_LIMITS, shapeResize, shapeSize, sizedOnStage } from "../src/shared/shapeResize.ts";

const box = { w: 360, h: 200 };

test("pulling a side changes that side only; the other one stays where it was", () => {
  // The right side 40 to the right: 40 wider, the center 20 to the right.
  assert.deepEqual(shapeResize(box, { sx: 1, sy: 0 }, { du: 40, dv: 99 }), {
    w: 400,
    h: 200,
    shiftX: 20,
    shiftY: 0,
  });
  // The left side 40 to the right: 40 narrower, the center 20 to the right too.
  assert.deepEqual(shapeResize(box, { sx: -1, sy: 0 }, { du: 40, dv: 0 }), {
    w: 320,
    h: 200,
    shiftX: 20,
    shiftY: 0,
  });
  // The top side up: taller, the center up.
  assert.deepEqual(shapeResize(box, { sx: 0, sy: -1 }, { du: 0, dv: -30 }), {
    w: 360,
    h: 230,
    shiftX: 0,
    shiftY: -15,
  });
});

test("a corner changes both; Alt grows around the center, Shift keeps the proportion", () => {
  assert.deepEqual(shapeResize(box, { sx: 1, sy: 1 }, { du: 40, dv: 10 }), {
    w: 400,
    h: 210,
    shiftX: 20,
    shiftY: 5,
  });
  assert.deepEqual(shapeResize(box, { sx: 1, sy: 1 }, { du: 40, dv: 10 }, { symmetric: true }), {
    w: 440,
    h: 220,
    shiftX: 0,
    shiftY: 0,
  });
  const kept = shapeResize(box, { sx: 1, sy: 1 }, { du: 180, dv: 0 }, { keepRatio: true });
  assert.equal(kept.w, 540);
  assert.equal(kept.h, 300);
});

test("the size stays inside the panel's limits, also keeping the proportion", () => {
  const small = shapeResize(box, { sx: 1, sy: 1 }, { du: -1000, dv: -1000 });
  assert.equal(small.w, SHAPE_LIMITS.minW);
  assert.equal(small.h, SHAPE_LIMITS.minH);
  // The left side cannot pass the right one: the right side stays where it was.
  assert.equal(small.shiftX, (SHAPE_LIMITS.minW - box.w) / 2);
  const big = shapeResize(box, { sx: 1, sy: 1 }, { du: 5000, dv: 0 }, { keepRatio: true });
  assert.equal(big.w, SHAPE_LIMITS.maxW);
  assert.equal(big.h, Math.round((SHAPE_LIMITS.maxW / box.w) * box.h));
});

test("a shape can grow to twice a 1080p frame", () => {
  assert.deepEqual(SHAPE_LIMITS, { minW: 40, maxW: 3840, minH: 40, maxH: 2160 });
  const huge = shapeResize(box, { sx: 1, sy: 1 }, { du: 9000, dv: 9000 }, { symmetric: true });
  assert.equal(huge.w, 3840);
  assert.equal(huge.h, 2160);
});

test("which annotations are sized on the stage, and their size by default", () => {
  assert.equal(sizedOnStage({ kind: "highlight", color: "#FFD60A" }), true);
  assert.equal(sizedOnStage({ kind: "panel", color: "#3D6BFF", boxWidth: 420 }), true);
  // A template's background fills the frame; a shape bigger than the frame is still a shape.
  assert.equal(sizedOnStage({ kind: "panel", color: "#000000", backdrop: true }), false);
  const big = { kind: "panel", color: "#3D6BFF", boxWidth: 3000, boxHeight: 1500 } as const;
  assert.equal(sizedOnStage({ ...big, backdrop: false }), true);
  assert.equal(sizedOnStage({ kind: "arrow", color: "#FF4D4D" }), false);
  assert.equal(sizedOnStage(undefined), false);
  assert.deepEqual(shapeSize({ kind: "highlight", color: "#FFD60A" }), { w: 360, h: 200 });
  assert.deepEqual(shapeSize({ kind: "panel", color: "#3D6BFF" }), { w: 900, h: 500 });
});

test("a panel is a background by its flag; older projects by being at least 1920x1080", () => {
  const legacy = { kind: "panel", color: "#000000", boxWidth: 1920, boxHeight: 1080 } as const;
  assert.equal(fillsFrame(legacy), true);
  assert.equal(fillsFrame({ ...legacy, boxHeight: 500 }), false);
  assert.equal(fillsFrame({ ...legacy, backdrop: false }), false);
  assert.equal(fillsFrame({ kind: "panel", color: "#000000", backdrop: true }), true);
  assert.equal(fillsFrame({ kind: "highlight", color: "#FFD60A", backdrop: true }), false);
});

test("editing an older panel writes down what it was, so growing a shape keeps it a shape", () => {
  const shape = { kind: "panel", color: "#3D6BFF", boxWidth: 420, boxHeight: 260 } as const;
  const grown = editedAnnotation(shape, { boxWidth: 3000, boxHeight: 1500 });
  assert.equal(grown.backdrop, false);
  assert.equal(fillsFrame(grown), false);
  const background = { kind: "panel", color: "#000000", boxWidth: 1920, boxHeight: 1080 } as const;
  const recolored = editedAnnotation(background, { color: "#FFFFFF" });
  assert.equal(recolored.backdrop, true);
  assert.equal(fillsFrame(recolored), true);
  // Annotations that say it already, and other kinds, are left as they are.
  assert.equal(editedAnnotation({ ...shape, backdrop: false }, {}).backdrop, false);
  assert.equal("backdrop" in editedAnnotation({ kind: "arrow", color: "#FF4D4D" }, {}), false);
});
