import assert from "node:assert/strict";
import { test } from "node:test";
import { nextEnabled, placeMenu, tidyMenu } from "./menu-popover";

const command = (id: string) => ({ id, label: id, group: "Objeto" });
const line = { separator: true as const };

test("separators only sit between commands", () => {
  assert.deepEqual(
    tidyMenu([line, command("a"), line, line, command("b"), line]).map((item) =>
      "separator" in item ? "-" : item.id,
    ),
    ["a", "-", "b"],
  );
  assert.deepEqual(tidyMenu([line, line]), []);
});

test("the menu stays inside the window", () => {
  const view = { width: 800, height: 600 },
    size = { width: 240, height: 200 };
  assert.deepEqual(placeMenu({ x: 100, y: 40 }, size, view), { x: 100, y: 40 });
  assert.deepEqual(placeMenu({ x: 700, y: 500 }, size, view), { x: 556, y: 396 });
  assert.deepEqual(placeMenu({ x: -20, y: -5 }, size, view), { x: 4, y: 4 });
});

test("the arrows skip unavailable commands and wrap around", () => {
  const enabled = [false, true, false, true];
  assert.equal(nextEnabled(enabled, -1, 1), 1);
  assert.equal(nextEnabled(enabled, 1, 1), 3);
  assert.equal(nextEnabled(enabled, 3, 1), 1);
  assert.equal(nextEnabled(enabled, 1, -1), 3);
  assert.equal(nextEnabled(enabled, enabled.length, -1), 3);
  assert.equal(nextEnabled([false, false], -1, 1), -1);
});
