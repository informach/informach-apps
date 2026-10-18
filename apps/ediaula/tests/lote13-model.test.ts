import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deviceGeometry,
  gradientAt,
  kelvinRgb,
  regionPixels,
  spotlightAlpha,
} from "../src/shared/look.ts";
import { alignWords, lengthMismatch, replaceAsset, timeMap } from "../src/shared/replaceAsset.ts";
import { revealAt, revealTimes, revealWords, withRevealSprites } from "../src/shared/reveal.ts";
import { buildSnapIndex, sentenceStarts, stepTo } from "../src/shared/snap.ts";
import type { Asset, Clip, Project, Word } from "../src/shared/types.ts";

test("moving by word, by sentence and by silence through the magnet's index", () => {
  const words = [
    { start: 1, end: 1.4, text: "Oi," },
    { start: 1.5, end: 2, text: "turma." },
    { start: 3, end: 3.5, text: "Vamos" },
    { start: 3.6, end: 4, text: "começar?" },
    { start: 6, end: 6.5, text: "Agora" },
  ];
  const sentences = sentenceStarts(words);
  assert.deepEqual(sentences, [1, 3, 6]);
  const index = buildSnapIndex({ clips: [], words, silences: [[4, 6]], sentences });
  assert.equal(stepTo(index, 0, 1, ["word"]), 1);
  assert.equal(stepTo(index, 1, 1, ["word"]), 1.4);
  assert.equal(stepTo(index, 3.5, -1, ["word"]), 3);
  assert.equal(stepTo(index, 1, 1, ["sentence", "silence"]), 3);
  assert.equal(stepTo(index, 3, 1, ["sentence", "silence"]), 4);
  assert.equal(stepTo(index, 4, 1, ["sentence", "silence"]), 6);
  assert.equal(stepTo(index, 6, 1, ["sentence", "silence"]), null);
  assert.equal(stepTo(index, 6, -1, ["sentence", "silence"]), 4);
});

test("an annotation comes in word by word on the words said, or one after the other", () => {
  const a = { kind: "balloon" as const, text: "Clique em Salvar agora" };
  const clip = { start: 10, duration: 5 };
  // "Salvar" and "agora" are said at 12.1 and 12.5 s; the first two words are not.
  const times = revealTimes(a, clip, [
    { start: 12.1, text: "Salvar," },
    { start: 12.5, text: "agora!" },
    { start: 30, text: "Clique" },
  ]);
  assert.deepEqual(
    times.map((t) => Math.round(t * 100) / 100),
    [0, 0.28, 2.1, 2.5],
  );
  assert.deepEqual(revealAt({ ...a, reveal: "words" }, times, 5, 2.2), { words: 3 });
  assert.equal(revealAt(a, times, 5, 2.2), null);
  const arrow = { kind: "arrow" as const, reveal: "draw" as const };
  assert.deepEqual(revealAt(arrow, [], 4, 0.4), { draw: 0.5 });
  assert.deepEqual(revealAt(arrow, [], 4, 2), { draw: 1 });
  assert.deepEqual(revealWords({ kind: "lowerthird", text: "Ana Lima", subtitle: "Professora" }), [
    "Ana",
    "Lima",
    "Professora",
  ]);
});

test("the export reads an animated annotation from its sprite", () => {
  const asset: Asset = {
    id: "n",
    name: "Balão",
    path: "C:/cache/balao.png",
    kind: "image",
    duration: 0,
    width: 400,
    height: 200,
    fps: 0,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none",
    generated: "annotation",
  };
  const clip: Clip = {
    id: "c",
    assetId: "n",
    trackId: "t",
    start: 3,
    in: 0,
    duration: 4,
    volume: 1,
    annotation: { kind: "balloon", color: "#3D6BFF", text: "Oi", reveal: "words" },
  };
  const p = { assets: [asset], clips: [clip] };
  const out = withRevealSprites(p, {
    c: { sprite: "C:/cache/rv.webm", fps: 30, width: 400, height: 200 },
  });
  const played = out.assets.find((a) => a.id === out.clips[0].assetId);
  assert.equal(played?.kind, "video");
  assert.equal(played?.path, "C:/cache/rv.webm");
  assert.equal(played?.alpha, true);
  assert.equal(out.clips[0].in, 0);
  assert.equal(withRevealSprites(p, undefined), p);
});

test("device frames keep the picture's shape; the frame and the region math", () => {
  for (const device of ["laptop", "phone"] as const)
    for (const [w, h] of [
      [1280, 720],
      [600, 1066],
    ] as const) {
      const g = deviceGeometry(device, w, h);
      assert.ok(Math.abs(g.screen.w / g.screen.h - w / h) < 1e-9, `${device} ${w}x${h}`);
      assert.ok(g.body.x >= -1e-9 && g.body.x + g.body.w <= w + 1e-9);
      const bottom = (g.base ?? g.body).y + (g.base ?? g.body).h;
      assert.ok(bottom <= h + 1e-9);
    }
  // Neutral light changes almost nothing; warm light takes blue away.
  const [r, g, b] = kelvinRgb(6500);
  assert.ok(r === 1 && g > 0.99 && b > 0.97);
  assert.ok(kelvinRgb(3000)[2] < 0.6);
  // CSS gradients: 90° goes from left to right, 180° from top to bottom.
  assert.equal(gradientAt(90, 100, 50, 0, 25), 0);
  assert.equal(gradientAt(90, 100, 50, 100, 25), 1);
  assert.equal(gradientAt(180, 100, 50, 50, 25), 0.5);
  // The spotlight is half dark at its edge and dark a feather out.
  assert.equal(spotlightAlpha(0, 10), 0);
  assert.equal(spotlightAlpha(10, 10), 1);
  assert.ok(Math.abs(spotlightAlpha(0.001, 10) - 0.5) < 1e-3);
  const px = regionPixels(
    { kind: "blur", rect: { x: 0.95, y: 0.1, w: 0.2, h: 0.3 }, feather: 0, strength: 1 },
    1920,
    1080,
  );
  assert.ok(px.x + px.w <= 1920 && px.w % 2 === 0 && px.h % 2 === 0 && px.x % 2 === 0);
});

const word = (text: string, start: number): Word => ({ text, start, end: start + 0.3, p: 1 });

test("substituir mídia: the clips follow the words in the new file and keep their edits", () => {
  const before = ["Oi", "turma", "hoje", "vamos", "falar", "de", "frações", "e", "decimais"].map(
    (t, i) => word(t, 1 + i),
  );
  // Made again: a second earlier at the start and a pause added before "frações".
  const after = ["Oi", "turma", "hoje", "vamos", "falar", "de", "frações", "e", "decimais"].map(
    (t, i) => word(t, i + (i >= 6 ? 2 : 0)),
  );
  assert.equal(alignWords(before, after).length, 9);
  const map = timeMap(before, after);
  assert.ok(map);
  assert.ok(Math.abs(map(7) - 8) < 1e-9, "frações");
  const old: Asset = {
    id: "av",
    name: "avatar.mp4",
    path: "C:/heygen/avatar.mp4",
    kind: "video",
    duration: 12,
    width: 1080,
    height: 1920,
    fps: 30,
    hasVideo: true,
    hasAudio: true,
    size: 1,
    proxyStatus: "ready",
    key: { color: "#00B140", threshold: 0.4, softness: 0.1, despill: 0.5, choke: 0 },
  };
  const next: Asset = {
    ...old,
    id: "av2",
    path: "C:/heygen/avatar-2.mp4",
    duration: 13,
    proxyStatus: "none",
  };
  delete next.key;
  const clip: Clip = {
    id: "c",
    assetId: "av",
    trackId: "t",
    start: 20,
    in: 7,
    duration: 2,
    volume: 1,
    transform: { x: 0.8, y: 0.6, scale: 0.4, opacity: 1 },
    keyframes: [{ t: 0, x: 0.8, y: 0.6, scale: 0.4 }],
    fadeIn: 0.3,
  };
  const p: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [old],
    tracks: [{ id: "t", kind: "video", name: "t", muted: false, hidden: false, locked: false }],
    clips: [clip],
  };
  const { project, remapped } = replaceAsset(p, "av", next, map);
  assert.equal(remapped, 1);
  const moved = project.clips[0];
  assert.equal(moved.assetId, "av2");
  assert.ok(Math.abs(moved.in - 8) < 1e-9);
  assert.ok(Math.abs(moved.duration - 2) < 1e-9);
  assert.deepEqual(moved.transform, clip.transform);
  assert.deepEqual(moved.keyframes, clip.keyframes);
  assert.equal(moved.fadeIn, 0.3);
  assert.deepEqual(project.assets.find((a) => a.id === "av2")?.key, old.key);
  assert.equal(
    project.assets.some((a) => a.id === "av"),
    false,
  );
  // Without transcripts only a file of the same length takes the place.
  assert.match(lengthMismatch(old, { kind: "video", duration: 13 }) ?? "", /mesma duração/);
  assert.equal(lengthMismatch(old, { kind: "video", duration: 12.3 }), null);
  // Files that say something else are not aligned.
  assert.equal(
    timeMap(
      before,
      ["bom", "dia", "pessoal", "tudo", "bem"].map((t, i) => word(t, i)),
    ),
    null,
  );
});
