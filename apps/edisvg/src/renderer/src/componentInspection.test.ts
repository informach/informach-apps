import assert from "node:assert/strict";
import { test } from "node:test";
import type { ComponentInstance } from "../../shared/componentContracts";
import { inspectComponent, inspectOverrideValue } from "./componentInspection";

test("component inspection has explicit pagination and never returns large override content implicitly", () => {
  const instance: ComponentInstance = {
    artboardId: "artboard-master",
    animationId: null,
    width: 100,
    height: 100,
    fit: "contain",
    speed: 1,
    offsetSeconds: 0,
    inputOverrides: Array.from({ length: 100 }, (_, index) => ({
      inputId: `input-${index}`,
      value: "x".repeat(10000),
    })),
    overrides: Array.from({ length: 20 }, (_, index) => ({
      targetId: `node-${index}`,
      text: "x".repeat(10000),
      attrs: { d: "a".repeat(500000) },
    })),
  };
  const result = inspectComponent(instance, 0, 10);
  assert.equal(result.overrides.length, 10);
  assert.equal(result.nextOffset, 10);
  assert.equal(result.inputOverrides?.length, 10);
  assert.equal(result.nextInputOffset, 10);
  assert.equal(
    inspectOverrideValue(instance, "input-0", "input", 0).value,
    JSON.stringify("x".repeat(10000)),
  );
  assert.equal(result.overrides[0]?.text?.truncated, true);
  assert.ok(JSON.stringify(result).length < 20000);
  const chunk = inspectOverrideValue(instance, "node-0", "d", 20000);
  assert.equal(chunk.value.length, 20000);
  assert.equal(chunk.totalLength, 500000);
  assert.equal(chunk.nextOffset, 40000);
  assert.equal(inspectComponent(instance, 10, 10).nextOffset, null);
  assert.throws(() => inspectOverrideValue(instance, "node-missing", "d", 0));
});
