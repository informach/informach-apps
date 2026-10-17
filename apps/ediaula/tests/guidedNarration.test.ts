import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("HeyGen-style MP4 becomes audio-only narration with its timing and original preserved", {
  timeout: 20000,
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-guided-voice-"));
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "electron")
        return {
          url:
            "data:text/javascript," +
            encodeURIComponent(`export const app = { getPath: () => ${JSON.stringify(dir)} };`),
          shortCircuit: true,
        };
      return nextResolve(specifier, context);
    },
  });
  try {
    const { FFMPEG, run, probe, prepareGuidedNarration } = await import("../src/main/ffmpeg.ts");
    const video = join(dir, "HeyGen aula.mp4");
    await run(FFMPEG, [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=s=160x90:r=25:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      "-shortest",
      video,
    ]);
    const original = readFileSync(video);
    const audio = await prepareGuidedNarration(video);
    const info = await probe(audio);
    assert.equal(info.hasVideo, false);
    assert.equal(info.hasAudio, true);
    assert.equal(info.kind, "audio");
    assert.ok(Math.abs(info.duration - 2) < 0.05);
    assert.deepEqual(readFileSync(video), original);
    assert.equal(await prepareGuidedNarration(video), audio, "reuses the prepared source");
    assert.equal(await prepareGuidedNarration(audio), audio, "audio-only inputs remain supported");
    const silent = join(dir, "sem-voz.mp4");
    await run(FFMPEG, ["-y", "-v", "error", "-i", video, "-an", "-c:v", "copy", silent]);
    await assert.rejects(prepareGuidedNarration(silent), /não tem faixa de áudio/);
  } finally {
    hook.deregister();
  }
});
