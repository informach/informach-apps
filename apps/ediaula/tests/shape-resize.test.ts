import assert from "node:assert/strict";
import { test } from "node:test";
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
  assert.equal(big.h, SHAPE_LIMITS.maxH);
  assert.equal(big.w, 1800);
});

test("which annotations are sized on the stage, and their size by default", () => {
  assert.equal(sizedOnStage({ kind: "highlight", color: "#FFD60A" }), true);
  assert.equal(sizedOnStage({ kind: "panel", color: "#3D6BFF", boxWidth: 420 }), true);
  // A panel that fills the frame is a background.
  assert.equal(sizedOnStage({ kind: "panel", color: "#000000", boxWidth: 1920 }), false);
  assert.equal(sizedOnStage({ kind: "arrow", color: "#FF4D4D" }), false);
  assert.equal(sizedOnStage(undefined), false);
  assert.deepEqual(shapeSize({ kind: "highlight", color: "#FFD60A" }), { w: 360, h: 200 });
  assert.deepEqual(shapeSize({ kind: "panel", color: "#3D6BFF" }), { w: 900, h: 500 });
});
