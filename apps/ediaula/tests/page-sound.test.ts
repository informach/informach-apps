import assert from "node:assert/strict";
import { test } from "node:test";
import { soundAlignFilter, soundPieces } from "../src/shared/pageSound.ts";

test("som da página: o que tocou enquanto o vídeo segurava fica de fora", () => {
  // The recording started 0,3 s after the video's clock; the video held 2 s between 4 and 4,5.
  const samples = [
    { w: 0, t: 0 },
    { w: 2, t: 2 },
    { w: 4, t: 4 },
    { w: 6.5, t: 4.5 },
    { w: 8.5, t: 6.5 },
  ];
  assert.deepEqual(soundPieces(samples, 0.3, 6.5), [
    // The first 0,3 s of the video have no sound.
    { from: 0, to: 3.7, at: 0.3 },
    // From the stretch of the hold on, the file is 2 s ahead of the video.
    { from: 5.7, to: 8.2, at: 4 },
  ]);
});

test("som da página: o tremor do relógio não corta o som", () => {
  const samples = [
    { w: 0, t: 0 },
    { w: 1.01, t: 1 },
    { w: 2.02, t: 2 },
    { w: 3.0, t: 3 },
  ];
  assert.deepEqual(soundPieces(samples, 0, 3), [{ from: 0, to: 3, at: 0 }]);
});

test("som da página: o filtro deixa silêncio onde não há som e põe cada pedaço no lugar", () => {
  const filter = soundAlignFilter(
    [
      { from: 0, to: 3.7, at: 0.3 },
      { from: 5.7, to: 8.2, at: 4 },
    ],
    6.5,
  );
  const lines = filter.split(";\n");
  assert.match(lines[0], /^anullsrc=r=48000:cl=stereo,atrim=duration=0\.300\[g0\]$/);
  assert.match(lines[1], /atrim=start=0\.000:end=3\.700/);
  assert.match(lines[2], /atrim=start=5\.700:end=8\.200/);
  assert.equal(lines.at(-1), "[g0][p1][p2]concat=n=3:v=0:a=1[out]");
  // Without anything recorded, the track is silence of the video's length.
  assert.match(soundAlignFilter([], 5), /atrim=duration=5\.000\[g0\];\n\[g0\]concat=n=1/);
});
