import assert from "node:assert/strict";
import { test } from "node:test";
import { leaveField, typedNumber } from "../src/renderer/src/lib/fieldText.ts";
import { parseTimecode } from "../src/shared/timeline.ts";

test("Esc on a typed field goes back, even when the blur comes before the state", () => {
  assert.deepEqual(leaveField("45", "30", true, typedNumber), { kind: "none" });
  assert.deepEqual(leaveField("45", "30", false, typedNumber), { kind: "commit", value: 45 });
});

test("leaving a rounded value as it was shown does not round the value", () => {
  // 12,34 % shown as "12": focusing and leaving keeps 12,34.
  assert.deepEqual(leaveField("12", "12", false, typedNumber), { kind: "none" });
  assert.deepEqual(leaveField(" 12 ", "12", false, typedNumber), { kind: "none" });
  assert.deepEqual(leaveField("12,5", "12", false, typedNumber), { kind: "commit", value: 12.5 });
  assert.deepEqual(leaveField(null, "12", false, typedNumber), { kind: "none" });
});

test("text that is not a value is wrong and changes nothing", () => {
  assert.deepEqual(leaveField("abc", "12", false, typedNumber), { kind: "wrong" });
  assert.deepEqual(leaveField("", "12", false, typedNumber), { kind: "wrong" });
  const tc = (t: string): number | null => parseTimecode(t, 30);
  assert.deepEqual(leaveField("00:00:05:30", "00:00:05:00", false, tc), { kind: "wrong" });
  assert.deepEqual(leaveField("00:00:05:12", "00:00:05:00", false, tc), {
    kind: "commit",
    value: 5.4,
  });
});
