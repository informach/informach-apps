import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import { type DerivedClip, withTransitions } from "../src/shared/transitions.ts";
import type { Asset, Project } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FILTER_SCRIPT_OPTION = await filterScriptOption(FFMPEG);

const video = (id: string, path: string, duration: number): Asset => ({
  id,
  name: id,
  path,
  kind: "video",
  duration,
  width: 640,
  height: 360,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
});

function project(a: string, b: string, kind: "dissolve" | "black", inA = 0): Project {
  return {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 30 },
    assets: [video("A", a, 4), video("B", b, 4)],
    tracks: [{ id: "t", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
    clips: [
      { id: "a", assetId: "A", trackId: "t", start: 0, in: inA, duration: 2, volume: 1 },
      {
        id: "b",
        assetId: "B",
        trackId: "t",
        start: 2,
        in: 0,
        duration: 2,
        volume: 1,
        transition: { kind, duration: 1 },
      },
    ],
  };
}

test("dissolve: the outgoing clip runs past the cut, picture only, fading over the next one", () => {
  const p = withTransitions(project("a.mp4", "b.mp4", "dissolve"));
  const a = p.clips.find((c) => c.id === "a") as DerivedClip;
  assert.equal(a.tail, 1);
  assert.equal(a.duration, 3);
  assert.equal(a.fadeOut, 1);
  assert.ok(a.drawAfter);
  // Without extra picture in the source (A ends at its last frame), the tail holds that frame
  // (the export pads the stream with it) instead of turning into a dip to black.
  const q = withTransitions(project("a.mp4", "b.mp4", "dissolve", 2));
  const a2 = q.clips.find((c) => c.id === "a") as DerivedClip;
  const b2 = q.clips.find((c) => c.id === "b")!;
  assert.equal(a2.tail, 1);
  assert.equal(b2.fadeIn, undefined);
});

test("export: halfway through a dissolve both scenes are mixed, and the sound of A stops at the cut", {
  timeout: 60_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-tr-"));
  const a = join(dir, "a.mp4");
  const b = join(dir, "b.mp4");
  for (const [path, color] of [
    [a, "red"],
    [b, "blue"],
  ])
    execFileSync(FFMPEG, [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=640x360:r=30:d=4`,
      "-f",
      "lavfi",
      "-i",
      "sine=d=4",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      path,
    ]);
  const p = project(a, b, "dissolve");
  const out = join(dir, "out.mp4");
  const plan = buildExportPlan(p, {
    outPath: out,
    width: 640,
    height: 360,
    fps: 30,
    videoBitrate: 2000,
    normalizeLoudness: false,
    encoder: "x264",
  });
  assert.match(plan.filter, /atrim=0:2,/, "audio of A trimmed to the real cut");
  const script = join(dir, "f.txt");
  writeFileSync(script, plan.filter);
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    ...plan.inputArgs,
    FILTER_SCRIPT_OPTION,
    script,
    ...plan.outputArgs,
  ]);
  const px = (t: number): number[] =>
    Array.from(
      execFileSync(FFMPEG, [
        "-v",
        "error",
        "-ss",
        String(t),
        "-i",
        out,
        "-frames:v",
        "1",
        "-vf",
        "crop=4:4:318:178,scale=1:1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]),
    );
  const [before, mid, after] = [px(1.5), px(2.5), px(3.5)];
  assert.ok(before[0] > 200 && before[2] < 60, `red before: ${before}`);
  assert.ok(mid[0] > 60 && mid[2] > 60, `red and blue mixed at the middle: ${mid}`);
  assert.ok(after[2] > 200 && after[0] < 60, `blue after: ${after}`);
});
