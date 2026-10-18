import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The filmstrip of a long recording (main/ffmpeg.ts): sheets of ten minutes instead of one
 * giant picture, key frames only, and a sheet whose file is gone made again.
 */

const dir = mkdtempSync(join(tmpdir(), "ediaula-strip-"));
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
const { FFMPEG, run, probe, filmstrip, filmstripLayout } = await import("../src/main/ffmpeg.ts");
hook.deregister();

test("sheets of ten minutes hold every picture of a long video", () => {
  const strip = filmstripLayout("C:/cache", 25 * 60);
  assert.equal(strip.step, 2);
  assert.equal(strip.count, 750);
  assert.equal(strip.perSheet, 300);
  assert.equal(strip.sheets.length, 3);
  assert.equal(strip.path, strip.sheets[0]);
  // Five hours: a picture every 7,5 s, still 80 per sheet of ten minutes.
  const long = filmstripLayout("C:/cache", 5 * 3600);
  assert.equal(long.count, 2400);
  assert.equal(long.perSheet, 80);
  assert.equal(long.sheets.length, 30);
  assert.deepEqual(filmstripLayout("C:/cache", 7).sheets.length, 1);
});

test("a 13-minute recording gets two sheets, and a sheet deleted is made again", {
  timeout: 120_000,
}, async () => {
  const video = join(dir, "aula.mp4");
  await run(FFMPEG, [
    ...["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=s=64x36:r=2:d=780"],
    ...["-c:v", "libx264", "-preset", "ultrafast", "-g", "4", video],
  ]);
  // Asked twice at once (two assets of the same file): made once, both get it.
  const [strip, twin] = await Promise.all([
    filmstrip("strip-1", video, video, 780),
    filmstrip("strip-1b", video, video, 780),
  ]);
  assert.deepEqual(twin, strip);
  assert.equal(strip.sheets?.length, 2);
  for (const sheet of strip.sheets ?? []) assert.ok(existsSync(sheet), sheet);
  const [first, second] = await Promise.all((strip.sheets ?? []).map((s) => probe(s)));
  // 300 pictures of 160 × 90, 30 to a row; then the 90 left, three rows.
  assert.deepEqual([first.width, first.height], [4800, 900]);
  assert.deepEqual([second.width, second.height], [4800, 270]);
  const gone = strip.sheets?.[1] ?? "";
  rmSync(gone);
  const again = await filmstrip("strip-2", video, video, 780);
  assert.deepEqual(again, strip);
  assert.ok(existsSync(gone), "the deleted sheet was made again");
});

test("a video with a single key frame still fills its sheet", { timeout: 60_000 }, async () => {
  // Ten seconds with x264's default key frame interval: one key frame, at 0:00.
  const video = join(dir, "heygen.mp4");
  await run(FFMPEG, [
    ...["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x00B140:s=1280x720:r=25:d=10"],
    ...["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", video],
  ]);
  const strip = await filmstrip("strip-3", video, video, 10);
  assert.equal(strip.count, 5);
  const sheet = await probe(strip.path);
  assert.deepEqual([sheet.width, sheet.height], [800, 90]);
});
