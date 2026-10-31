import assert from "node:assert/strict";
import { test } from "node:test";
import { retriesFromAttempts, retryAt, swapAttempt } from "../src/shared/attempts.ts";
import { clipEnd } from "../src/shared/timeline.ts";
import type { Asset, Project } from "../src/shared/types.ts";

const screen: Asset = {
  id: "tela",
  name: "tela",
  path: "C:/g/tela.mp4",
  kind: "video",
  duration: 40,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: false,
  size: 1,
  proxyStatus: "none",
  // Take 8..12 was the first attempt of voice 18..22; the second one shows it from take 22.
  retries: [{ earlier: [8, 12], later: 22 }],
};

const lesson = (): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [screen],
  tracks: [{ id: "v1", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
  clips: [
    { id: "a", assetId: "tela", trackId: "v1", start: 10, in: 0, duration: 8, volume: 1 },
    { id: "b", assetId: "tela", trackId: "v1", start: 18, in: 22, duration: 18, volume: 1 },
  ],
});

const shown = (p: Pick<Project, "clips">) =>
  [...p.clips].sort((x, y) => x.start - y.start).map((c) => [c.start, clipEnd(c), c.in]);

test("a tentativa anterior volta no lugar da última e a última volta depois, sem mexer no resto", () => {
  const p = lesson();
  const retry = screen.retries?.[0];
  assert.ok(retry);
  assert.equal(retryAt(p, "tela", retry), 18);
  const earlier = swapAttempt(p, "tela", 0);
  assert.ok(earlier);
  assert.deepEqual(shown(earlier), [
    [10, 18, 0],
    [18, 22, 8],
    [22, 36, 26],
  ]);
  assert.equal(earlier.assets[0].retries?.[0]?.using, "earlier");
  const back = swapAttempt({ ...p, ...earlier }, "tela", 0);
  assert.ok(back);
  assert.deepEqual(shown(back), [
    [10, 18, 0],
    [18, 22, 22],
    [22, 36, 26],
  ]);
  assert.equal(back.assets[0].retries?.[0]?.using, undefined);
  // The stretch cut from the lesson: nothing to swap.
  assert.equal(swapAttempt({ ...p, clips: [p.clips[0]] }, "tela", 0), null);
});

test("as tentativas anteriores do take viram retries da mídia da tela certa", () => {
  const map = retriesFromAttempts(
    [
      { from: 8, to: 12, start: 18, later: 22 },
      // Across two parts: left out.
      { from: 28, to: 33, start: 30, later: 31 },
    ],
    [
      { assetId: "p1", at: 0, duration: 30 },
      { assetId: "p2", at: 30, in: 0, duration: 20 },
    ],
  );
  assert.deepEqual([...map.byAsset], [["p1", [{ earlier: [8, 12], later: 22 }]]]);
  assert.equal(map.kept.length, 1);
});

test("a troca nunca passa do que as duas tentativas mostram nem do clipe da última", () => {
  // The new attempt lasted 3 s (stopped at 21); the next part starts at 21 from another file.
  const short: Project = {
    ...lesson(),
    assets: [
      { ...screen, retries: [{ earlier: [8, 13], later: 22, length: 3 }] },
      { ...screen, id: "parte2" },
    ],
    clips: [
      { id: "a", assetId: "tela", trackId: "v1", start: 10, in: 0, duration: 8, volume: 1 },
      { id: "b", assetId: "tela", trackId: "v1", start: 18, in: 22, duration: 3, volume: 1 },
      { id: "c", assetId: "parte2", trackId: "v1", start: 21, in: 0, duration: 10, volume: 1 },
    ],
  };
  const swapped = swapAttempt(short, "tela", 0);
  assert.ok(swapped);
  assert.deepEqual(shown(swapped), [
    [10, 18, 0],
    [18, 21, 8],
    [21, 31, 0],
  ]);
});
