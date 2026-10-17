const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { frameWindows } = require("./displays.cjs");
test("linha visível tem um pixel físico em escalas de 100% a 250%", () => {
  for (const scale of [1, 1.25, 1.5, 2, 2.5])
    for (const [width, height] of [
      [500, 1],
      [1, 300],
    ]) {
      const calls = [],
        canvas = { getContext: () => ({ fillRect: (...args) => calls.push(args) }) };
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, "frame.js"), "utf8"), {
        URLSearchParams,
        location: { search: `?x=0&y=0&width=${width}&height=${height}` },
        innerWidth: 500,
        innerHeight: 300,
        document: { getElementById: () => canvas },
        window: { devicePixelRatio: scale, addEventListener() {} },
      });
      assert.equal(calls.length, 1);
      assert.equal(Math.min(calls[0][2], calls[0][3]), 1);
    }
});
test("janelas transparentes e linhas permanecem no monitor de coordenadas negativas", () => {
  const display = { x: -1280, y: -200, width: 1280, height: 720 };
  for (const { bounds, line } of frameWindows({ x: 0, y: 0, width: 1280, height: 720 }, display)) {
    assert.ok(bounds.width >= 32 && bounds.height >= 32);
    assert.ok(
      bounds.x >= display.x &&
        bounds.y >= display.y &&
        bounds.x + bounds.width <= 0 &&
        bounds.y + bounds.height <= 520,
    );
    assert.ok(
      line.x >= 0 &&
        line.y >= 0 &&
        line.x + line.width <= bounds.width &&
        line.y + line.height <= bounds.height,
    );
  }
});
