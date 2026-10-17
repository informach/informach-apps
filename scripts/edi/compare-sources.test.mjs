import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyChange } from "./compare-sources.mjs";

test("three-way comparison detects additions, deletions and concurrent edits", () => {
  assert.equal(classifyChange("a", "a", "a"), "unchanged");
  assert.equal(classifyChange("a", "b", "a"), "source_only");
  assert.equal(classifyChange("a", "a", "b"), "repository_only");
  assert.equal(classifyChange("a", "b", "b"), "converged");
  assert.equal(classifyChange("a", "b", "c"), "conflict");
  assert.equal(classifyChange(undefined, "b", undefined), "source_only");
  assert.equal(classifyChange("a", undefined, "b"), "conflict");
  assert.equal(classifyChange("a", undefined, undefined), "converged");
});
