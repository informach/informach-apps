import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePageGroups, parsePageRange } from "../src/shared/page-ranges.ts";

test("page ranges retain explicit order, remove duplicates and support parity and last page", () => {
  assert.deepEqual(parsePageRange("1-3, 7, 10-12, 2", 12), [0, 1, 2, 6, 9, 10, 11]);
  assert.deepEqual(parsePageRange("3-1, última", 8), [2, 1, 0, 7]);
  assert.deepEqual(parsePageRange("ímpares", 5), [0, 2, 4]);
  assert.deepEqual(parsePageRange("pares", 5), [1, 3]);
  assert.deepEqual(parsePageGroups("1-3; 4-última", 5), [
    [0, 1, 2],
    [3, 4],
  ]);
  for (const input of ["", "0", "6", "1,,2", "texto", "1-2-3"])
    assert.throws(() => parsePageRange(input, 5));
});
