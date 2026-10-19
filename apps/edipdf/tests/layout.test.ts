import assert from "node:assert/strict";
import { test } from "node:test";
import { pageLayoutGeometry, visiblePageRows } from "../src/shared/page-layout.ts";
import { renderBudget } from "../src/shared/render-budget.ts";

test("continuous, single and spread layouts share exact page navigation and viewport geometry", () => {
  const sizes = [
    { w: 600, h: 800 },
    { w: 400, h: 300 },
    { w: 500, h: 1000 },
  ];
  const continuous = pageLayoutGeometry(sizes, 2, "continuous", 0);
  assert.deepEqual(continuous.tops, [28, 1646, 2264]);
  assert.equal(continuous.height, 4292);
  const spread = pageLayoutGeometry(sizes, 2, "spread", 0);
  assert.deepEqual(spread.tops, [28, 28, 1646]);
  assert.equal(spread.rows[0].width, 2018);
  assert.equal(spread.height, 3674);
  const single = pageLayoutGeometry(sizes, 2, "single", 1);
  assert.deepEqual(single.rows[0].indices, [1]);
  assert.equal(single.height, 656);
  assert.deepEqual(
    visiblePageRows(continuous.rows, 1650, 2000).flatMap((row) => row.indices),
    [1],
  );
});
test("virtualization selects a bounded slice from a large document without rendering every page", () => {
  const layout = pageLayoutGeometry(
    Array.from({ length: 100000 }, () => ({ w: 600, h: 800 })),
    1,
    "spread",
    0,
  );
  const selected = visiblePageRows(layout.rows, 818 * 25000, 818 * 25000 + 1600);
  assert.ok(selected.length <= 3);
  assert.equal(selected[0].indices[0], 49998);
});
test("preview pixel budget bounds giant zoom while export refuses silent resolution changes", () => {
  const budget = renderBudget(10000, 15000, 2);
  assert.ok(budget.width * budget.height <= 16000000);
  assert.ok(budget.width <= 8192 && budget.height <= 8192);
  assert.equal(budget.limited, true);
  assert.throws(() => renderBudget(10000, 15000, 2, "export"), /resolução/);
  assert.throws(() => renderBudget(NaN, 100, 1), /inválidas/);
  assert.deepEqual(renderBudget(1200, 1800, 1, "export"), {
    width: 1200,
    height: 1800,
    ratio: 1,
    limited: false,
  });
});
