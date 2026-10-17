const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeRect, pixelRect, stitchedHeight } = require("./geometry.cjs");
test("seleção invertida e limites do monitor", () => {
  assert.deepEqual(
    normalizeRect({ x: 400, y: 300 }, { x: -20, y: 100 }, { width: 800, height: 600 }),
    { x: 0, y: 100, width: 400, height: 200 },
  );
});
test("conversão DPI usa o tamanho real da imagem", () => {
  assert.deepEqual(
    pixelRect(
      { x: 100, y: 40, width: 998, height: 497 },
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ),
    { x: 150, y: 60, width: 1497, height: 746 },
  );
});
test("último pixel e arredondamento não ultrapassam a imagem", () => {
  const r = pixelRect(
    { x: 1000, y: 500, width: 280, height: 220 },
    { width: 1280, height: 720 },
    { width: 1919, height: 1079 },
  );
  assert.ok(r.x + r.width <= 1919 && r.y + r.height <= 1079);
});
test("rejeita valores IPC não finitos ou fora da tela", () => {
  for (const rect of [
    { x: NaN, y: 0, width: 5, height: 5 },
    { x: -1, y: 0, width: 10, height: 10 },
    { x: 0, y: 0, width: 0, height: 50 },
    { x: 0, y: 0, width: 2000, height: 100 },
  ])
    assert.throws(() =>
      pixelRect(rect, { width: 1000, height: 800 }, { width: 1000, height: 800 }),
    );
});
test("união de trechos desconta somente sobreposições posteriores", () => {
  assert.equal(stitchedHeight([500, 500, 500], 100), 1300);
  assert.equal(stitchedHeight([500], 100), 500);
  assert.throws(() => stitchedHeight([500, 500], 500));
  assert.throws(() => stitchedHeight([20000, 20000], 0));
});
