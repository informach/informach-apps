import assert from "node:assert/strict";
import { test } from "node:test";
import { createHistory } from "./history.js";

test("content-addressed asset bodies are retained once across checkpoints without reducing ordinary undo depth", () => {
  const data = "AAAA".repeat(150000),
    asset = { id: `asset-${"a".repeat(64)}`, name: "Imagem", data },
    initial = { name: "0", assets: [asset] },
    history = createHistory(initial, 100, 1_000_000);
  for (let index = 1; index <= 10; index++) history.commit({ ...initial, name: String(index) });
  assert.equal(history.evictedCount, 0);
  const previous = history.undo();
  assert.equal(previous.name, "9");
  assert.equal(previous.assets[0].data, data);
  previous.assets[0].data = "mutated returned copy";
  assert.equal(history.redo().assets[0].data, data);
  assert.throws(
    () => history.commit({ name: "bad", assets: [{ ...asset, data: "different bytes" }] }),
    /conflitantes/,
  );
  for (let index = 9; index >= 0; index--) {
    const value = history.undo();
    assert.equal(value.name, String(index));
    assert.equal(value.assets[0].data, data);
  }
  assert.equal(history.canUndo, false);
});

test("discarded redo releases uniquely-owned asset blobs and reset preserves generic checkpoint values", () => {
  const a = { id: `asset-${"a".repeat(64)}`, data: "A".repeat(32000) },
    b = { id: `asset-${"b".repeat(64)}`, data: "B".repeat(32000) },
    history = createHistory({ step: 0, assets: [a] }, 100, 70000);
  history.commit({ step: 1, assets: [a] });
  history.commit({ step: 2, assets: [a, b] });
  assert.equal(history.undo().step, 1);
  history.commit({ step: 3, assets: [a] });
  assert.equal(history.evictedCount, 0);
  assert.equal(history.undo().step, 1);
  assert.equal(history.undo().step, 0);
  history.reset({ step: 0, assets: 123 });
  history.commit({ step: 1, assets: 123 });
  assert.deepEqual(history.undo(), { step: 0, assets: 123 });
  history.reset(null);
  history.commit({ step: 1 });
  assert.equal(history.undo(), null);
  assert.equal(history.canRedo, true);
});

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
test("history bounds retained UTF-8 snapshot bytes, not only the number of edits", () => {
  const h = createHistory({ value: "á".repeat(10) }, 100, 100);
  h.commit({ value: "é".repeat(10) });
  h.commit({ value: "í".repeat(10) });
  h.commit({ value: "ó".repeat(10) });
  assert.equal(h.evictedCount, 1);
  assert.deepEqual(h.undo(), { value: "í".repeat(10) });
  assert.deepEqual(h.undo(), { value: "é".repeat(10) });
  assert.equal(h.undo(), null);
  assert.deepEqual(h.redo(), { value: "í".repeat(10) });
  assert.throws(() => createHistory({}, 0));
});

test("a pipeline run is one undo step: squash joins every edit since the mark", () => {
  const h = createHistory({ v: 0 });
  h.commit({ v: 1 });
  const mark = h.mark();
  h.commit({ v: 2 });
  h.commit({ v: 3 });
  h.commit({ v: 4 });
  assert.equal(h.squash(mark), true);
  // One undo goes back to the state before the run; redo brings the run back whole.
  assert.deepEqual(h.undo(), { v: 1 });
  assert.deepEqual(h.redo(), { v: 4 });
  assert.deepEqual(h.undo(), { v: 1 });
  assert.deepEqual(h.undo(), { v: 0 });
  // A mark undone past (it is no longer behind the present) joins nothing.
  const again = createHistory({ v: 0 });
  const early = again.mark();
  again.commit({ v: 1 });
  again.undo();
  assert.equal(again.squash(early), false);
  // Nothing edited since the mark: nothing to join.
  assert.equal(again.squash(again.mark()), false);
});
