import assert from "node:assert/strict";
import { test } from "node:test";
import { type GuidedLogLine, videoLog } from "../src/shared/guidedCursor.ts";
import { DEFAULT_CAPTURE, newPlan, videoSize } from "../src/shared/guidedPlan.ts";

test("aula ampliada: a página como numa tela de 1280 × 720, o vídeo em 1920 × 1080", () => {
  const plan = newPlan("p", "Parte 1");
  assert.deepEqual(plan.viewport, { width: 1280, height: 720 });
  assert.equal(plan.scale, 1.5);
  assert.deepEqual(videoSize(plan), { width: 1920, height: 1080 });
  assert.equal(DEFAULT_CAPTURE.scale, 1.5);
  // A plan of before, without a scale, records at the page's size.
  assert.deepEqual(videoSize({ viewport: { width: 1920, height: 1080 } }), {
    width: 1920,
    height: 1080,
  });
  // On the screen, the plan keeps the screen's pixels.
  assert.equal(newPlan("s", "Tela", "screen").scale, undefined);
});

test("o cursor do vídeo sai em pixels do vídeo, não da página", () => {
  const log: GuidedLogLine[] = [
    { k: "move", t: 0, x: 100, y: 200 },
    { k: "down", t: 1, x: 10, y: 20, b: 0 },
    {
      k: "glide",
      t: 0,
      until: 1,
      from: { x: 0, y: 0 },
      to: { x: 10, y: 20 },
      path: { c1: { x: 2, y: 4 }, c2: { x: 8, y: 16 }, over: 6 },
    },
    { k: "step", t: 0, index: 0, status: "start" },
  ];
  const [move, down, glide, step] = videoLog(log, 1.5);
  assert.deepEqual(move, { k: "move", t: 0, x: 150, y: 300 });
  assert.deepEqual(down, { k: "down", t: 1, x: 15, y: 30, b: 0 });
  assert.deepEqual(glide, {
    k: "glide",
    t: 0,
    until: 1,
    from: { x: 0, y: 0 },
    to: { x: 15, y: 30 },
    path: { c1: { x: 3, y: 6 }, c2: { x: 12, y: 24 }, over: 9 },
  });
  assert.deepEqual(step, log[3]);
  assert.deepEqual(videoLog(log, 1), log);
});
