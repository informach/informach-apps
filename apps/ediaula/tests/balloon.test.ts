import assert from "node:assert/strict";
import { test } from "node:test";
import { balloonPath, freeBalloonTip, preserveBalloonBody } from "../src/shared/annotation.ts";

test("free balloon tip chooses all four sides and retains the requested length", () => {
  for (const [point, side] of [
    [{ x: 3, y: 0.5 }, "right"],
    [{ x: -2, y: 0.5 }, "left"],
    [{ x: 0.5, y: -4 }, "top-left"],
    [{ x: 0.5, y: 5 }, "bottom-left"],
  ] as const) {
    const result = freeBalloonTip(point);
    assert.equal(result.tail, side);
    assert.deepEqual(result.point, point);
    const path = balloonPath(100, 100, 200, 100, 16, 26, result.tail, {
      x: 100 + point.x * 200,
      y: 100 + point.y * 100,
    });
    assert.ok(path.includes(`${100 + point.x * 200} ${100 + point.y * 100}`));
    assert.equal(path.match(/M /g)?.length, 1);
    assert.ok(path.endsWith("Z"));
  }
});

test("dragging inside the body projects the tip outside instead of inverting the outline", () => {
  const result = freeBalloonTip({ x: 0.6, y: 0.55 });
  assert.equal(result.tail, "right");
  assert.ok(result.point.x > 1);
  assert.ok(Number.isFinite(freeBalloonTip({ x: NaN, y: Infinity }).point.x));
});

test("extending a tail preserves body position and size at every keyframe scale", () => {
  const oldImage = { width: 400, height: 240 };
  const nextImage = { width: 850, height: 600 };
  const frame = { width: 1920, height: 1080 };
  const oldBody = { x: 50, y: 50, w: 280, h: 120, tipX: 370, tipY: 110 };
  const newBody = { ...oldBody, x: 420, y: 290, tipX: 30, tipY: 40 };
  for (const scale of [0.1, 0.4, 1.2]) {
    const original = { x: 0.3, y: 0.7, scale, t: 4 };
    const next = preserveBalloonBody(original, oldImage, nextImage, frame, oldBody, newBody);
    const d1 = scale * Math.min(frame.width / oldImage.width, frame.height / oldImage.height);
    const d2 =
      next.scale * Math.min(frame.width / nextImage.width, frame.height / nextImage.height);
    assert.ok(Math.abs(d1 - d2) < 1e-9);
    assert.ok(
      Math.abs(
        original.x * frame.width +
          (oldBody.x - oldImage.width / 2) * d1 -
          (next.x * frame.width + (newBody.x - nextImage.width / 2) * d2),
      ) < 1e-9,
    );
    assert.ok(
      Math.abs(
        original.y * frame.height +
          (oldBody.y - oldImage.height / 2) * d1 -
          (next.y * frame.height + (newBody.y - nextImage.height / 2) * d2),
      ) < 1e-9,
    );
    assert.equal(next.t, 4);
  }
});
