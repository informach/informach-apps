import assert from "node:assert/strict";
import { test } from "node:test";
import { panelWidths } from "./panelResize";

test("panels clamp within the viewport while reserving usable canvas and panel minima", () => {
  for (const available of [380, 500, 700, 1000])
    for (const left of [0, 200, 10000])
      for (const right of [0, 280, 10000]) {
        const result = panelWidths(available, left, right);
        assert.ok(result.left >= 160 - 1e-8);
        assert.ok(result.right >= 220 - 1e-8);
        assert.ok(result.left + result.right <= available + 1e-8);
      }
  assert.throws(() => panelWidths(379, 200, 280));
});
