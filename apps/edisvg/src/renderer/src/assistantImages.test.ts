import assert from "node:assert/strict";
import { test } from "node:test";
import { panelImages } from "../../main/engines.js";
import {
  fittedSize,
  frameAttachment,
  IMAGE_LIMIT,
  IMAGE_SIDE,
  referenceImages,
} from "./assistantImages";

test("a pipeline's video frames (base64 from the main process) go back as bytes it accepts", () => {
  // The start of a JPEG, as the frames step returns it.
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0xff, 0xd9,
  ]);
  const frame = { mediaType: "image/jpeg" as const, data: Buffer.from(jpeg).toString("base64") };
  const attached = frameAttachment(frame, "Quadro 1 do vídeo");
  assert.deepEqual(attached.data, jpeg);
  assert.equal(attached.url, `data:image/jpeg;base64,${frame.data}`);
  // What ai:send checks: before, the base64 text itself went and was refused ("Imagens inválidas").
  const sent = referenceImages([{ images: [attached] }]);
  assert.deepEqual(panelImages(sent)[0]?.data, jpeg);
  assert.throws(() => panelImages([frame]), /Imagens inválidas/);
});

test("large reference images shrink to the side the engines look at, small ones stay", () => {
  assert.deepEqual(fittedSize(800, 600), { width: 800, height: 600, scaled: false });
  assert.deepEqual(fittedSize(4000, 2000), { width: IMAGE_SIDE, height: 784, scaled: true });
  assert.deepEqual(fittedSize(10, 40000), { width: 1, height: IMAGE_SIDE, scaled: true });
});

test("a turn sends the most recent images of the conversation, at most the limit", () => {
  const image = (n: number) => ({
    mediaType: "image/png" as const,
    data: new Uint8Array([n]),
    url: `blob:${n}`,
    name: `${n}.png`,
  });
  const sent = referenceImages([
    { images: [image(1), image(2)] },
    {},
    { images: [image(3), image(4), image(5)] },
  ]);
  assert.equal(sent.length, IMAGE_LIMIT);
  assert.deepEqual(
    sent.map((item) => item.data[0]),
    [2, 3, 4, 5],
  );
  assert.deepEqual(Object.keys(sent[0] ?? {}), ["mediaType", "data"]);
  assert.deepEqual(referenceImages([{}]), []);
});
