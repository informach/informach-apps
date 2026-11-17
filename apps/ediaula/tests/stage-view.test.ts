import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampStageView,
  panStageView,
  STAGE_VIEW_MAX,
  stageViewShowing,
  WHOLE_VIEW,
  wheelZoomFactor,
  zoomStageView,
} from "../src/shared/stageView.ts";

const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("zooming keeps the point under the pointer still", () => {
  const v = zoomStageView(WHOLE_VIEW, 2, 0.25, 0.75);
  assert.equal(v.zoom, 2);
  // The picture's point under the pointer before (0.25, 0.75) is still there after.
  near(v.x + 0.25 * v.zoom, 0.25);
  near(v.y + 0.75 * v.zoom, 0.75);
  const again = zoomStageView(v, 2, 0.6, 0.4);
  const u = (0.6 - v.x) / v.zoom;
  near(again.x + u * again.zoom, 0.6);
});

test("the view never zooms out past the whole picture nor past the max, nor shows a border", () => {
  assert.deepEqual(zoomStageView(WHOLE_VIEW, 0.5, 0.5, 0.5), WHOLE_VIEW);
  assert.equal(zoomStageView(WHOLE_VIEW, 100, 0.5, 0.5).zoom, STAGE_VIEW_MAX);
  // Zooming out back to 1 returns the whole picture, whatever the pan was.
  assert.deepEqual(zoomStageView({ zoom: 2, x: -0.7, y: -0.2 }, 0.5, 0.1, 0.9), WHOLE_VIEW);
  assert.deepEqual(clampStageView({ zoom: 2, x: 0.3, y: -5 }), { zoom: 2, x: 0, y: -1 });
  assert.deepEqual(panStageView({ zoom: 3, x: -1, y: -1 }, 5, -5), { zoom: 3, x: 0, y: -2 });
  assert.deepEqual(panStageView(WHOLE_VIEW, 0.2, 0.2), WHOLE_VIEW);
});

test("a point off screen is brought to the center; one on screen leaves the view as it is", () => {
  const v = { zoom: 4, x: 0, y: 0 };
  assert.equal(stageViewShowing(v, 0.1, 0.1), v);
  const moved = stageViewShowing(v, 0.5, 0.5);
  near(moved.x + 0.5 * moved.zoom, 0.5);
  near(moved.y + 0.5 * moved.zoom, 0.5);
  // A point at the picture's corner is shown as close to the center as the border allows.
  assert.deepEqual(stageViewShowing(v, 1, 1), { zoom: 4, x: -3, y: -3 });
  assert.equal(stageViewShowing(WHOLE_VIEW, 0.99, 0.01), WHOLE_VIEW);
});

test("the wheel zooms in when turned up, out when down, a notch at a time", () => {
  near(wheelZoomFactor(-100), 1.2);
  near(wheelZoomFactor(100), 1 / 1.2);
  assert.ok(wheelZoomFactor(-4) > 1 && wheelZoomFactor(-4) < 1.01);
  near(wheelZoomFactor(-10000), 1.2 ** 3);
});
