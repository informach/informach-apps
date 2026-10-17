const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chooseDisplay, frameEdges, controlPosition } = require("./displays.cjs");
const a = {
  id: 11,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};
const b = {
  id: 22,
  bounds: { x: -1280, y: -200, width: 1280, height: 720 },
  workArea: { x: -1280, y: -200, width: 1280, height: 680 },
};
test("monitor explícito independe da posição do cursor", () => {
  assert.equal(chooseDisplay([a, b], "22", 11), b);
  assert.equal(chooseDisplay([a, b], "cursor", 11), a);
  assert.throws(() => chooseDisplay([a], "22", 11), /não está conectado/);
});
test("moldura fica fora da região em monitor com coordenadas negativas", () => {
  const edges = frameEdges({ x: 100, y: 80, width: 500, height: 300 }, b.bounds);
  assert.deepEqual(edges[0], { x: -1181, y: -121, width: 502, height: 1 });
  assert.equal(edges[3].x, -680);
  assert.equal(edges[1].y, 180);
});
test("moldura de tela inteira permanece visível nos quatro limites", () => {
  const edges = frameEdges({ x: 0, y: 0, width: 1280, height: 720 }, b.bounds);
  for (const e of edges) {
    assert.ok(e.x >= -1280 && e.y >= -200);
    assert.ok(e.x + e.width <= 0 && e.y + e.height <= 520);
    assert.ok(e.width > 0 && e.height > 0);
  }
});
test("coordenadas fracionárias de DPI geram limites inteiros", () => {
  for (const e of frameEdges({ x: 50.25, y: 23.6, width: 333.4, height: 99.25 }, a.bounds))
    for (const n of Object.values(e)) assert.ok(Number.isInteger(n));
});
test("controles ficam abaixo da região quando há espaço", () => {
  assert.deepEqual(
    controlPosition({ x: 100, y: 100, width: 500, height: 300 }, a, [a, b], 410, 210),
    { x: 100, y: 412 },
  );
});
test("captura de tela inteira move controles para o segundo monitor", () => {
  const pos = controlPosition({ x: 0, y: 0, width: 1920, height: 1080 }, a, [a, b], 410, 210);
  assert.ok(pos.x < 0 && pos.x >= b.workArea.x && pos.y >= b.workArea.y);
});
