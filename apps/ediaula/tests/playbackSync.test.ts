import assert from "node:assert/strict";
import { test } from "node:test";
import { driftCorrection } from "../src/shared/playbackSync.ts";

test("preview drift: small differences are absorbed by the rate, only jumps seek", () => {
  const frame = 1 / 30;
  assert.deepEqual(driftCorrection(10.01, 10, 1, frame, false), { seek: false, rate: 1 });
  assert.deepEqual(driftCorrection(10.08, 10, 1, frame, false), { seek: false, rate: 0.97 });
  assert.deepEqual(driftCorrection(9.92, 10, 1, frame, false), { seek: false, rate: 1.03 });
  assert.deepEqual(driftCorrection(10.2, 10, 1, frame, false), { seek: true, rate: 1 });
  // Once catching up it goes on to half a frame, then back to the normal rate.
  assert.equal(driftCorrection(10.025, 10, 1, frame, true).rate, 0.97);
  assert.equal(driftCorrection(10.01, 10, 1, frame, true).rate, 1);
  // A clip at 2× allows twice the drift before seeking.
  assert.deepEqual(driftCorrection(10.25, 10, 2, frame, false), { seek: false, rate: 1.94 });
});
