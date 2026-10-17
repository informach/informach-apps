import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { cursorOverlayExpressions } from "../src/shared/cursor-expressions.ts";

function evaluate(expression: string, time: number): number {
  return new Function("t", "iff", "lt", "floor", `return ${expression.replaceAll("if(", "iff(")}`)(
    time,
    (condition: number, yes: number, no: number) => (condition ? yes : no),
    (left: number, right: number) => Number(left < right),
    Math.floor,
  );
}

test("cursor coordinates preserve source trim, speed and the final position", () => {
  const cursor = {
    sprite: "cursor.webm",
    size: 8,
    fps: 4,
    positions: Int32Array.of(1, 2, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24),
  };
  const fast = cursorOverlayExpressions(cursor, { in: 0.25, duration: 1.5, speed: 2 }, 2);
  assert.deepEqual(
    [0, 0.5, 1, 5].map((time) => [evaluate(fast.x, time), evaluate(fast.y, time)]),
    [
      [5, 8],
      [21, 24],
      [21, 24],
      [21, 24],
    ],
  );
  const slow = cursorOverlayExpressions(cursor, { in: 0, duration: 1.5, speed: 0.5 }, 4);
  assert.deepEqual(
    [0, 0.25, 0.5, 0.75, 1, 1.25].map((time) => evaluate(slow.x, time)),
    [1, 5, 5, 9, 9, 13],
  );
});

test("frame lookup is stable around fractional timestamps and compresses stationary coordinates", () => {
  const cursor = {
    sprite: "cursor.webm",
    size: 8,
    fps: 30,
    positions: Int32Array.of(10, 20, 30, 20, 50, 20),
  };
  const expression = cursorOverlayExpressions(cursor, { in: 0, duration: 0.1 }, 30);
  assert.equal(expression.y, "20");
  for (const time of [1 / 30 - 1e-9, 1 / 30, 1 / 30 + 1e-9])
    assert.equal(evaluate(expression.x, time), 30);
});

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FILTER_SCRIPT_OPTION = await filterScriptOption(FFMPEG);

test("FFmpeg parses a long cursor recording and selects a late frame without expression depth overflow", () => {
  const frames = 100_001;
  const positions = Int32Array.from(
    Array.from({ length: frames }, (_, frame) => [frame % 44, (frame * 3) % 44]).flat(),
  );
  const expressions = cursorOverlayExpressions(
    { sprite: "cursor.webm", size: 8, fps: 30, positions },
    { in: 0, duration: frames / 30 },
    30,
  );
  const selectedFrame = 71_357;
  const directory = mkdtempSync(join(tmpdir(), "ediaula-cursor-expression-"));
  try {
    const filter = join(directory, "cursor.txt");
    writeFileSync(
      filter,
      `[0:v]setpts=PTS+${selectedFrame}[base];[1:v]setpts=PTS+${selectedFrame}[sprite];` +
        `[base][sprite]overlay=x='${expressions.x}':y='${expressions.y}':eval=frame[out]`,
    );
    const output = execFileSync(
      FFMPEG,
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=64x64:r=30:d=0.04",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=8x8:r=30:d=0.04",
        FILTER_SCRIPT_OPTION,
        filter,
        "-map",
        "[out]",
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
      ],
      { windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 ** 2 },
    );
    const x = positions[selectedFrame * 2] + 4;
    const y = positions[selectedFrame * 2 + 1] + 4;
    const pixel = output.subarray((y * 64 + x) * 3, (y * 64 + x) * 3 + 3);
    assert.ok(
      pixel[0] > 180 && pixel[1] < 80 && pixel[2] < 80,
      `cursor at late frame: ${Array.from(pixel)}`,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
