import assert from "node:assert/strict";
import { test } from "node:test";
import { onePass, parseLoudness, secondPass, soundFilter } from "../src/main/export/renderAudio.ts";

const summary = (i: string, tp: string, lra: string): string =>
  `[Parsed_loudnorm_0 @ 0000] \n{\n\t"input_i" : "${i}",\n\t"input_tp" : "${tp}",\n\t"input_lra" : "${lra}",\n\t"input_thresh" : "-33.10",\n\t"output_i" : "-14.02",\n\t"target_offset" : "0.02"\n}\n`;

test("the measured pass is one gain when the lesson allows it, loudnorm when it does not", () => {
  const steady = parseLoudness(summary("-23.10", "-9.80", "4.20"));
  assert.deepEqual(steady, {
    input_i: -23.1,
    input_tp: -9.8,
    input_lra: 4.2,
    input_thresh: -33.1,
    target_offset: 0.02,
  });
  assert.ok(steady);
  // +9.1 dB keeps the peak at −0.7 dBTP: over −1.5, so loudnorm levels it.
  assert.match(secondPass({}, steady), /^loudnorm=I=-14:.*measured_I=-23\.1:.*linear=true/);
  const quiet = parseLoudness(summary("-23.10", "-12.00", "4.20"));
  assert.ok(quiet);
  assert.equal(secondPass({}, quiet), "volume=9.1dB");
  assert.equal(secondPass({ loudness: { target: -16, mode: "two-pass" } }, quiet), "volume=7.1dB");
  // A wide range is left to loudnorm too.
  const wide = parseLoudness(summary("-23.10", "-12.00", "14.00"));
  assert.ok(wide);
  assert.match(secondPass({}, wide), /^loudnorm=/);
  // A failed or silent measurement is not used.
  assert.equal(parseLoudness("Error opening input"), null);
  assert.equal(parseLoudness(summary("-inf", "-inf", "0.00")), null);
});

test("the assembly keeps exactly the lesson's samples after any loudness pass", () => {
  assert.deepEqual(soundFilter({ wav: "a.wav", master: "", samples: 480 }), []);
  assert.deepEqual(soundFilter({ wav: "a.wav", master: onePass({}), samples: 72000722 }), [
    "-af",
    "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,atrim=end_sample=72000722",
  ]);
});
