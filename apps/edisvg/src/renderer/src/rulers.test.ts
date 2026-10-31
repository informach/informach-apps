import assert from "node:assert/strict";
import { test } from "node:test";
import type { Guide } from "../../shared/guides";
import { rulerStep, snapToGuides } from "./rulers";

const guides: Guide[] = [
  { id: "guide-x", axis: "x", position: 100 },
  { id: "guide-y", axis: "y", position: 300 },
];
const box = { x: 10, y: 10, width: 40, height: 20 };

test("a dragged box snaps its nearest edge or centre onto a guide within the tolerance", () => {
  // Right edge 50 + 48 = 98 is 2 units from the vertical guide.
  assert.deepEqual(snapToGuides(box, 48, 0, guides, { x: 3, y: 3 }), {
    dx: 50,
    dy: 0,
    snapped: ["guide-x"],
  });
  // Centre y 20 + 279 = 299 snaps to the horizontal guide; x is out of reach.
  assert.deepEqual(snapToGuides(box, 20, 279, guides, { x: 3, y: 3 }), {
    dx: 20,
    dy: 280,
    snapped: ["guide-y"],
  });
  // An axis that does not move (Shift constraint) never snaps.
  assert.equal(snapToGuides(box, 0, 5, guides, { x: 100, y: 0 }).dx, 0);
});

test("ruler ticks step by 1, 2 or 5 × 10ⁿ units and stay at least 50px apart", () => {
  assert.equal(rulerStep(1), 50);
  assert.equal(rulerStep(0.5), 100);
  assert.equal(rulerStep(0.3), 200);
  assert.equal(rulerStep(4), 20);
  assert.equal(rulerStep(60), 1);
});
