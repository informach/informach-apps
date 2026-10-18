import assert from "node:assert/strict";
import { test } from "node:test";
import { curveRepresentation } from "./curveRepresentation";

test("curve representation preserves cubic parameters and never labels elastic as CSS", () => {
  assert.equal(curveRepresentation("linear"), "linear");
  assert.equal(curveRepresentation("hold"), "steps(1, end)");
  assert.equal(
    curveRepresentation({ kind: "cubic-bezier", points: [0.42, 0, 0.58, 1] }),
    "cubic-bezier(0.42, 0, 0.58, 1)",
  );
  assert.deepEqual(
    JSON.parse(curveRepresentation({ kind: "elastic", amplitude: 2, period: 0.3 })),
    { kind: "elastic", amplitude: 2, period: 0.3 },
  );
});
