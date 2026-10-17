import assert from "node:assert/strict";
import { test } from "node:test";
import type { Clip } from "../src/shared/types.ts";
import { clipCues, webVtt } from "../src/shared/webvtt.ts";

test("caption previews preserve real text, timing, escaping and source speed", () => {
  const clip: Clip = {
    id: "c",
    assetId: "a",
    trackId: "v",
    start: 10,
    in: 5,
    duration: 2,
    speed: 2,
    volume: 1,
  };
  const cues = clipCues(
    [
      { start: 9, end: 11, text: "<Olá> & texto" },
      { start: 11, end: 13, text: "Fim" },
    ],
    clip,
  );
  assert.deepEqual(
    cues.map(({ start, end }) => [start, end]),
    [
      [5, 7],
      [7, 9],
    ],
  );
  assert.match(webVtt(cues) ?? "", /00:00:05.000 --> 00:00:07.000\n&lt;Olá&gt; &amp; texto/);
  assert.equal(webVtt([]), null);
  assert.equal(webVtt([{ start: 0, end: 1, text: " " }]), null);
});
