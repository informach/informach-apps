import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The sound of scrubbing (main/ffmpeg.ts audioSnippet): a fast drag asks for many grains, the
 * reads take two scrub slots of the scheduler, and what only older grains wait for is stopped.
 */

const dir = mkdtempSync(join(tmpdir(), "ediaula-scrub-"));
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "electron")
      return {
        url: `data:text/javascript,${encodeURIComponent(`export const app = { getPath: () => ${JSON.stringify(dir)} };`)}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const { FFMPEG, run, audioSnippet, SNIPPET_RATE } = await import("../src/main/ffmpeg.ts");
const { scheduler } = await import("../src/main/scheduler.ts");
hook.deregister();

const sound = join(dir, "voz.wav");
await run(FFMPEG, [
  ...["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=30", sound],
]);

test("a fast drag reads two grains at a time and drops the ones it left behind", {
  timeout: 30_000,
}, async () => {
  let most = 0;
  const off = scheduler.onChange((s) => {
    most = Math.max(most, s.running.scrub);
  });
  try {
    // Stopped reads are not failures: they give no sound.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => audioSnippet(sound, 2 + i, 0.25, i + 1)),
    );
    const done = results.flatMap((bytes, i) => (bytes ? [i + 1] : []));
    assert.deepEqual(done, [9, 10], "only the two newest grains are read");
    for (const bytes of results)
      if (bytes) assert.equal(bytes.byteLength, Math.round(0.25 * SNIPPET_RATE) * 2);
    assert.ok(most <= 2, `at most two reads at once (${most})`);
  } finally {
    off();
  }
});

test("a stretch an old grain asked for and a newer one asks again is read for the newer", async () => {
  const old = audioSnippet(sound, 1, 0.25, 50);
  const again = audioSnippet(sound, 1, 0.25, 52);
  assert.equal(again, old, "the same read, joined");
  const other = audioSnippet(sound, 5, 0.25, 52);
  assert.equal((await again)?.byteLength, Math.round(0.25 * SNIPPET_RATE) * 2);
  await other;
});

test("a stretch read before comes from what was kept", async () => {
  const first = await audioSnippet(sound, 20, 0.25, 100);
  const second = await audioSnippet(sound, 20, 0.25, 101);
  assert.equal(second, first);
});
