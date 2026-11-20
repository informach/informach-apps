import assert from "node:assert/strict";
import { test } from "node:test";
import { presenterPreviewArgs, rawFrameArgs } from "./pipelineVideo.ts";
import { personBounds, type RgbFrame, screenColor } from "./presenterKey.ts";

/** A frame of `fill`, with a block of `person` colour in [x0, x1) × [y0, y1). */
function frame(
  fill: [number, number, number],
  person?: { x0: number; x1: number; y0: number; y1: number; color: [number, number, number] },
  width = 96,
  height = 54,
): RgbFrame {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inside = person && x >= person.x0 && x < person.x1 && y >= person.y0 && y < person.y1;
      data.set(inside ? person.color : fill, (y * width + x) * 3);
    }
  return { width, height, data };
}

const green: [number, number, number] = [20, 180, 60];
const skin: [number, number, number] = [210, 160, 130];

test("the green screen's colour is read from the sides and top of the picture", () => {
  const frames = [
    frame(green, { x0: 36, x1: 60, y0: 10, y1: 54, color: skin }),
    frame(green, { x0: 40, x1: 64, y0: 12, y1: 54, color: skin }),
  ];
  assert.equal(screenColor(frames), "#14b43c");
  // A blue screen too.
  assert.equal(screenColor([frame([30, 60, 200])]), "#1e3cc8");
  // A room behind her, not a screen: no colour.
  assert.equal(screenColor([frame([128, 120, 110])]), null);
});

test("where she stands is the union of the frames, with a little margin", () => {
  const frames = [
    frame(green, { x0: 36, x1: 60, y0: 10, y1: 54, color: skin }),
    frame(green, { x0: 40, x1: 66, y0: 12, y1: 54, color: skin }),
  ];
  const bounds = personBounds(frames, "#14b43c");
  assert.deepEqual(bounds, {
    left: Math.round((36 / 96 - 0.02) * 1000) / 1000,
    top: Math.round((10 / 54 - 0.02) * 1000) / 1000,
    right: Math.round((66 / 96 + 0.02) * 1000) / 1000,
    bottom: 1,
  });
  // A couple of stray pixels on the screen are not her.
  const noisy = frame(green);
  noisy.data.set(skin, (5 * 96 + 5) * 3);
  assert.equal(personBounds([noisy], "#14b43c"), null);
});

test("the preview takes the screen out as VP9 with alpha, from the stretch's start", () => {
  const args = presenterPreviewArgs("C:/aula/prof.mp4", 62.5, 30, "#14b43c", "out.webm");
  assert.deepEqual(args.slice(0, 7), ["-y", "-v", "error", "-ss", "62.500", "-t", "30.000"]);
  assert.ok(args.includes("-an"));
  const filter = args[args.indexOf("-vf") + 1];
  assert.match(filter ?? "", /chromakey=0x14b43c:/);
  assert.equal(args[args.indexOf("-c:v") + 1], "libvpx-vp9");
  assert.equal(args[args.indexOf("-pix_fmt") + 1], "yuva420p");
  assert.equal(args.at(-1), "out.webm");
  assert.throws(() => presenterPreviewArgs("v.mp4", 0, 0, "#14b43c", "o.webm"), /inválido/);
  assert.throws(() => presenterPreviewArgs("v.mp4", 0, 5, "verde", "o.webm"), /Cor do fundo/);
  const raw = rawFrameArgs("v.mp4", 3, 192, "q.rgb");
  assert.ok(raw.join(" ").includes("scale=192:-2,format=rgb24 -f rawvideo q.rgb"));
});
