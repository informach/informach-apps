import assert from "node:assert/strict";
import { test } from "node:test";
import { createHistory } from "./history.js";

test("manual and AI edits share chronological undo and redo", () => {
  const h = createHistory({ name: "Zezé", x: 0 });
  h.commit({ name: "Zezé", x: 20 });
  h.commit({ name: "Novo nome", x: 20 });
  assert.deepEqual(h.undo(), { name: "Zezé", x: 20 });
  assert.deepEqual(h.undo(), { name: "Zezé", x: 0 });
  assert.equal(h.undo(), null);
  assert.deepEqual(h.redo(), { name: "Zezé", x: 20 });
  assert.deepEqual(h.redo(), { name: "Novo nome", x: 20 });
});
test("no-op edits preserve redo; new changes invalidate it", () => {
  const h = createHistory({ x: 0 });
  h.commit({ x: 1 });
  h.undo();
  assert.equal(h.commit({ x: 0 }), false);
  assert.equal(h.canRedo, true);
  h.commit({ x: 2 });
  assert.equal(h.canRedo, false);
});
test("checkpoints cannot be mutated, history is bounded, opening resets it", () => {
  const initial = { transforms: { x: 0 } },
    h = createHistory(initial, 2);
  initial.transforms.x = 99;
  h.commit({ transforms: { x: 1 } });
  h.commit({ transforms: { x: 2 } });
  h.commit({ transforms: { x: 3 } });
  const restored = h.undo();
  restored.transforms.x = 99;
  assert.equal(h.redo().transforms.x, 3);
  assert.equal(h.undo().transforms.x, 2);
  assert.equal(h.undo().transforms.x, 1);
  assert.equal(h.undo(), null);
  h.reset({ transforms: { x: 10 } });
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
});
