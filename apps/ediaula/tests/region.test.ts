import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRecorderSettings } from "../src/shared/recorderSettings.ts";
import {
  dipToPhysical,
  fitSize,
  monitorOfWindow,
  physicalToDip,
  presetRegion,
  resizeRegion,
  snapToWindow,
  windowProblem,
} from "../src/shared/region.ts";

const fullHd = { width: 1920, height: 1080 };
const qhd = { width: 2560, height: 1440 };

test("os presets dão o tamanho exato em pixels da tela, no centro", () => {
  assert.deepEqual(presetRegion("full", qhd), { x: 0, y: 0, width: 2560, height: 1440 });
  assert.deepEqual(presetRegion("1080p", qhd), { x: 320, y: 180, width: 1920, height: 1080 });
  assert.deepEqual(presetRegion("720p", qhd), { x: 640, y: 360, width: 1280, height: 720 });
  // 16:9 in the middle of a 16:10 screen: the whole width.
  assert.deepEqual(presetRegion("16:9", { width: 1920, height: 1200 }), {
    x: 0,
    y: 60,
    width: 1920,
    height: 1080,
  });
  // The lesson's own size; a vertical lesson keeps its proportion on a wide screen.
  assert.deepEqual(presetRegion("lesson", qhd, { width: 1280, height: 720 }), {
    x: 640,
    y: 360,
    width: 1280,
    height: 720,
  });
  const vertical = presetRegion("lesson", fullHd, { width: 1080, height: 1920 });
  assert.ok(vertical);
  assert.equal(vertical.height, 1080);
  assert.ok(Math.abs(vertical.width / vertical.height - 1080 / 1920) < 0.01);
  assert.equal(vertical.width % 2, 0);
  assert.equal(presetRegion("lesson", qhd), null);
  assert.equal(presetRegion("custom", qhd), null);
});

test("um preset maior que a tela encolhe na mesma proporção, com lados pares", () => {
  const r = presetRegion("1080p", { width: 1366, height: 768 });
  assert.ok(r);
  assert.ok(r.width <= 1366 && r.height <= 768);
  assert.equal(r.width % 2, 0);
  assert.equal(r.height % 2, 0);
  assert.ok(Math.abs(r.width / r.height - 16 / 9) < 0.01);
  assert.deepEqual(fitSize({ width: 1000, height: 500 }, { width: 400, height: 400 }), {
    width: 400,
    height: 200,
  });
});

test("a região em pixels da janela volta exata em pixels físicos, mesmo com escala de 150%", () => {
  const dip = { width: 1280, height: 720 };
  const want = { x: 320, y: 180, width: 1280, height: 720 };
  const there = physicalToDip(want, fullHd, dip);
  assert.ok(Math.abs(there.width - 853.333) < 0.001);
  assert.deepEqual(dipToPhysical(there, fullHd, dip), want);
  // The whole monitor needs no crop.
  assert.equal(dipToPhysical({ x: 0, y: 0, width: 1280, height: 720 }, fullHd, dip), undefined);
  // Inside the monitor and even, whatever was drawn.
  const odd = dipToPhysical({ x: 1000, y: 600, width: 500, height: 500 }, fullHd, dip);
  assert.ok(odd);
  assert.ok(odd.x + odd.width <= 1920 && odd.y + odd.height <= 1080);
  assert.equal(odd.width % 2, 0);
  assert.equal(odd.height % 2, 0);
});

test("digitar a largura com a proporção travada leva a altura junto, em volta do mesmo centro", () => {
  const region = { x: 320, y: 180, width: 1280, height: 720 };
  const wider = resizeRegion(region, { width: 1600 }, true, fullHd);
  assert.deepEqual(wider, { x: 160, y: 90, width: 1600, height: 900 });
  const free = resizeRegion(region, { width: 1601 }, false, fullHd);
  assert.equal(free.width, 1600);
  assert.equal(free.height, 720);
  // Larger than the screen: both sides shrink together, and it stays on screen.
  const huge = resizeRegion(region, { height: 2000 }, true, fullHd);
  assert.ok(huge.width <= 1920 && huge.height <= 1080);
  assert.ok(Math.abs(huge.width / huge.height - 16 / 9) < 0.01);
  assert.ok(huge.x >= 0 && huge.y >= 0);
  // Never smaller than a usable region.
  assert.equal(resizeRegion(region, { width: 10 }, false, fullHd).width, 80);
});

test("encaixar na janela corta o que sai da tela e deixa os lados pares", () => {
  const monitor = { x: 1920, y: 0, width: 2560, height: 1440 };
  // A window partly to the left of the second monitor, odd sizes.
  const w = { x: 1800, y: 101, width: 1001, height: 701 };
  assert.deepEqual(snapToWindow(w, monitor), { x: 0, y: 101, width: 880, height: 700 });
  // Fully inside: the window itself.
  assert.deepEqual(snapToWindow({ x: 2000, y: 50, width: 800, height: 600 }, monitor), {
    x: 80,
    y: 50,
    width: 800,
    height: 600,
  });
  // Off this monitor: nothing to fit.
  assert.equal(snapToWindow({ x: 0, y: 0, width: 800, height: 600 }, monitor), null);
  const monitors = [{ x: 0, y: 0, ...fullHd }, monitor];
  assert.equal(monitorOfWindow(w, monitors), 1);
  assert.equal(monitorOfWindow({ x: -5000, y: 0, width: 10, height: 10 }, monitors), -1);
});

test("a janela seguida avisa quando é minimizada, fechada ou sai da região", () => {
  const capture = { x: 100, y: 100, width: 800, height: 600 };
  const inside = { rect: { x: 100, y: 100, w: 800, h: 600 } };
  assert.equal(windowProblem(inside, capture), null);
  assert.equal(windowProblem({ ...inside, min: true }, capture), "minimized");
  assert.equal(windowProblem({ gone: true }, capture), "gone");
  assert.equal(windowProblem({ rect: { x: 600, y: 100, w: 800, h: 600 } }, capture), "outside");
  // Maximized over the region: it still fills it.
  assert.equal(windowProblem({ rect: { x: 0, y: 0, w: 1920, h: 1080 } }, capture), null);
});

test("as opções guardam o preset novo e a trava; um preset desconhecido volta à tela inteira", () => {
  const s = parseRecorderSettings({ region: { preset: "720p" }, regionLock: false });
  assert.equal(s.region.preset, "720p");
  assert.equal(s.regionLock, false);
  assert.equal(parseRecorderSettings({}).regionLock, true);
  assert.equal(parseRecorderSettings({ region: { preset: "janela" } }).region.preset, "full");
});
