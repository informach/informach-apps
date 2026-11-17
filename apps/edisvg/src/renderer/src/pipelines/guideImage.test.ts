import assert from "node:assert/strict";
import { test } from "node:test";
import { cutGuide, PART_PIXELS } from "./guideImage";

const SIDE = 1568;

/** Every part within what the engines read whole, covering the guide top to bottom. */
function assertReadable(width: number, height: number, most: number) {
  const cut = cutGuide(width, height, most);
  assert.ok(cut.parts.length >= 1 && cut.parts.length <= Math.max(1, most));
  assert.ok(cut.scale > 0 && cut.scale <= 1);
  let reached = 0;
  for (const part of cut.parts) {
    const w = width * cut.scale;
    const h = part.height * cut.scale;
    assert.ok(w <= SIDE + 1 && h <= SIDE + 1, `${w}×${h}`);
    assert.ok(Math.round(w) * Math.round(h) <= PART_PIXELS * 1.01, `${w}×${h}`);
    // Each part starts at or before where the last one ended (a little before: the overlap).
    assert.ok(part.y <= reached && part.y + part.height > reached);
    reached = part.y + part.height;
  }
  assert.equal(reached, height);
  return cut;
}

test("a tall style guide goes in up to four parts, as sharp as they can be", () => {
  // The Zero Kids guide: 3200 × 6818. Four parts at 0.45 (1440 px wide), not shrunk to one.
  const guide = assertReadable(3200, 6818, 4);
  assert.equal(guide.parts.length, 4);
  assert.ok(guide.scale > 0.44 && guide.scale < 0.46, String(guide.scale));
  // With two images left (a demonstration sends two frames), two parts of the same guide.
  const two = assertReadable(3200, 6818, 2);
  assert.equal(two.parts.length, 2);
  assert.ok(two.scale < guide.scale);
  // Parts repeat a little of the one before.
  const [first, second] = guide.parts;
  assert.ok(first && second && second.y < first.y + first.height);
});

test("a small or wide guide goes whole, never enlarged", () => {
  assert.deepEqual(cutGuide(1280, 720, 4), { scale: 1, parts: [{ y: 0, height: 720 }] });
  const wide = assertReadable(6000, 1000, 4);
  assert.equal(wide.parts.length, 1);
  assert.ok(Math.abs(wide.scale * 6000 - SIDE) < 1e-6);
  // 800 × 3000: three parts at full size.
  assert.deepEqual(
    (({ scale, parts }) => ({ scale, count: parts.length }))(assertReadable(800, 3000, 4)),
    { scale: 1, count: 3 },
  );
  assert.throws(() => cutGuide(0, 10, 4), /vazia/);
});
