import assert from "node:assert/strict";
import { test } from "node:test";
import { fittedSize, IMAGE_LIMIT, IMAGE_SIDE, referenceImages } from "./assistantImages";

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
