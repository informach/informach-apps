import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { inspectBehavior, inspectBehaviorValue } from "./behaviorInspection";

test("behavior inspection explicitly paginates summaries and exact JSON chunks without hidden truncation", () => {
  const behavior = {
    ...emptyBehavior(),
    inputs: Array.from({ length: 21 }, (_, index) => ({
      id: `input-${index}`,
      name: `Nome ${index}`,
      kind: "string" as const,
      initial: "Á".repeat(10000),
    })),
  };
  const first = inspectBehavior(behavior, { collection: "inputs" });
  assert.equal(first.total, 21);
  assert.equal(first.nextOffset, 20);
  assert.equal(first.items.length, 20);
  assert.ok(JSON.stringify(first).length < 15000);
  const full = inspectBehaviorValue(behavior, { collection: "inputs", id: "input-0" });
  assert.deepEqual(JSON.parse(full.value), behavior.inputs[0]);
  assert.throws(() => inspectBehavior(behavior, { collection: "states" }), /máquina/);
  assert.throws(
    () => inspectBehaviorValue(behavior, { collection: "inputs", id: "input-0", offset: 1000000 }),
    /Offset/,
  );
});
