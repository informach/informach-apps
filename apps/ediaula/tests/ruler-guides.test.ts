import assert from "node:assert/strict";
import { test } from "node:test";
import { projectSchema } from "../src/shared/project-schema.ts";
import { MAX_GUIDES, placeGuide, rulerStep, snapGuide } from "../src/shared/rulerGuides.ts";

test("the rulers step as EdiSVG's: 1, 2 or 5 × 10ⁿ frame pixels, numbers at least 50 px apart", () => {
  // The preview at half size (960 px for 1920): a number every 100 px of the frame.
  assert.equal(rulerStep(0.5), 100);
  // Small, as in a short preview (about 0.29): every 200 px.
  assert.equal(rulerStep(0.29), 200);
  // Zoomed in four times: every 50 px... and far in, every 5.
  assert.equal(rulerStep(2), 50);
  assert.equal(rulerStep(12), 5);
  for (const scale of [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 12]) {
    const step = rulerStep(scale);
    assert.ok(step * scale >= 50);
    assert.ok(step * scale < 50 * 2.5 + 1e-9);
  }
});

test("guides are added, moved and taken away; one landing on another is the same guide", () => {
  const none = { x: [], y: [] };
  const one = placeGuide(none, "x", null, 0.25, 1920);
  assert.deepEqual(one, { x: [0.25], y: [] });
  const two = placeGuide(one, "y", null, 0.5, 1080);
  assert.deepEqual(two, { x: [0.25], y: [0.5] });
  // Moved.
  assert.deepEqual(placeGuide(two, "x", 0, 0.75, 1920), { x: [0.75], y: [0.5] });
  // Dropped off the frame: gone.
  assert.deepEqual(placeGuide(two, "y", 0, null, 1080), { x: [0.25], y: [] });
  assert.deepEqual(placeGuide(two, "y", 0, 1.2, 1080), { x: [0.25], y: [] });
  // A new one on an old one (within half a pixel) adds nothing.
  assert.deepEqual(placeGuide(two, "x", null, 0.25 + 0.2 / 1920, 1920), two);
  // Never more than the file allows.
  let many = none as { x: number[]; y: number[] };
  for (let i = 0; i <= MAX_GUIDES; i++) many = placeGuide(many, "x", null, i / 1000, 1920);
  assert.equal(many.x.length, MAX_GUIDES);
});

test("a guide being dragged snaps to the nearest target in reach", () => {
  assert.deepEqual(snapGuide(955, [0, 960, 1920], 8), { value: 960, target: 960 });
  assert.deepEqual(snapGuide(940, [0, 960, 1920], 8), { value: 940, target: null });
  // On a tie, the first target.
  assert.deepEqual(snapGuide(503, [500, 506], 8), { value: 500, target: 500 });
});

test("the lesson keeps its guides", () => {
  const base = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [],
    tracks: [],
    clips: [],
  };
  assert.ok(projectSchema.safeParse({ ...base, guides: { x: [0.05, 0.5], y: [0.1] } }).success);
  assert.equal(projectSchema.safeParse({ ...base, guides: { x: [1.5], y: [] } }).success, false);
});
