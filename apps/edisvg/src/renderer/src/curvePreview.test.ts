import assert from "node:assert/strict";
import { test } from "node:test";
import { curvePreview } from "./curvePreview";

test("curve preview follows actual interpolation, including a true step and overshoot bounds", () => {
  const line = curvePreview("linear");
  assert.match(line.path, /^M12 118 /);
  assert.ok(line.path.endsWith("L248 12"));
  assert.equal(curvePreview("hold").path, "M12 118H248V12");
  const overshoot = curvePreview({ kind: "cubic-bezier", points: [0.3, -2, 0.7, 3] });
  assert.ok(overshoot.min < 0);
  assert.ok(overshoot.max > 1);
  assert.throws(() => curvePreview({ kind: "cubic-bezier", points: [-1, 0, 1, 1] }));
});
