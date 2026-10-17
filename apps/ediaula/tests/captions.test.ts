import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildAss, buildCues, cueAt, DEFAULT_CAPTION_STYLE } from "../src/shared/captions.ts";
import type { TimelineWord } from "../src/shared/cleanup.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import type { Project } from "../src/shared/types.ts";

const said = (text: string, from = 0, step = 0.4): TimelineWord[] =>
  text.split(/\s+/).map((t, i) => ({
    key: `${from}-${i}`,
    clipId: "c",
    text: t,
    start: from + i * step,
    end: from + i * step + 0.3,
    p: 0.9,
  }));

test("cues: short lines, at most two, split at pauses and sentence ends, capitalized", () => {
  const words = [
    ...said(
      "olha aqui: quando eu seguro a seta da tela para a direita, o personagem anda para a direita.",
    ),
    ...said("e no computador também dá", 20),
  ];
  const cues = buildCues(words, 30);
  assert.ok(
    cues.every(
      (c) =>
        c.lines.length <= 2 && c.lines.every((l) => l.map((w) => w.text).join(" ").length <= 32),
    ),
  );
  assert.equal(cues[0].lines[0][0].text, "Olha", "first word capitalized");
  const last = cues[cues.length - 1];
  assert.equal(last.lines[0][0].text, "E", "new sentence after a long pause starts capitalized");
  assert.ok(last.start >= 20, "the pause starts a new cue");
  assert.equal(cueAt(cues, 20.1), last);
  assert.equal(cueAt(cues, 15), undefined);
});

test("ASS: karaoke times each word, box and outline looks, vertical layout", () => {
  const cues = buildCues(said("olha só que legal"), 42);
  const ass = buildAss(cues, DEFAULT_CAPTION_STYLE, 1920, 1080);
  assert.match(ass, /PlayResX: 1920/);
  assert.match(ass, /\{\\k40\}Olha \{\\k40\}só \{\\k40\}que \{\\k\d+\}legal/);
  assert.match(
    ass,
    /Style: Cap,Segoe UI,56,&H0031F0C8,&H00FFFFFF/,
    "spoken words lime, coming ones white",
  );
  const box = buildAss(cues, { ...DEFAULT_CAPTION_STYLE, look: "box" }, 1920, 1080);
  assert.match(box, /,3,\d+,0,2,/, "opaque box border style");
  assert.doesNotMatch(box, /\\k/);
  const vertical = buildAss(cues, DEFAULT_CAPTION_STYLE, 1080, 1920);
  assert.match(vertical, /,2,65,65,384,1/, "raised above the Reels interface");
});

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");

test("export burns the captions in: spoken words lime, the rest white", { timeout: 60_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-cap-"));
  const bg = join(dir, "bg.png");
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x303030:s=640x360",
    "-frames:v",
    "1",
    bg,
  ]);
  const p: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 30 },
    assets: [
      {
        id: "b",
        name: "b",
        path: bg,
        kind: "image",
        duration: 0,
        width: 640,
        height: 360,
        fps: 0,
        hasVideo: true,
        hasAudio: false,
        size: 1,
        proxyStatus: "none",
      },
    ],
    tracks: [{ id: "t", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
    clips: [{ id: "c", assetId: "b", trackId: "t", start: 0, in: 0, duration: 3, volume: 1 }],
  };
  const ass = buildAss(
    buildCues(said("MMMM WWWW", 0.2, 1.0), 42),
    { ...DEFAULT_CAPTION_STYLE, size: 12 },
    640,
    360,
  );
  const assFile = join(dir, "cap.ass");
  writeFileSync(assFile, ass);
  const out = join(dir, "out.mp4");
  const plan = buildExportPlan(p, {
    outPath: out,
    width: 640,
    height: 360,
    fps: 30,
    videoBitrate: 3000,
    normalizeLoudness: false,
    encoder: "x264",
    assFile,
    fontsDir: "C:/Windows/Fonts",
  });
  const script = join(dir, "f.txt");
  writeFileSync(script, plan.filter);
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    ...plan.inputArgs,
    "-filter_complex_script",
    script,
    ...plan.outputArgs,
  ]);
  // Count lime and white pixels in the caption band at 0.8 s (first word said, second not yet).
  const raw = execFileSync(FFMPEG, [
    "-v",
    "error",
    "-ss",
    "0.8",
    "-i",
    out,
    "-frames:v",
    "1",
    "-vf",
    "crop=640:90:0:250",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-",
  ]);
  let lime = 0;
  let white = 0;
  for (let i = 0; i < raw.length; i += 3) {
    const [r, g, b] = [raw[i], raw[i + 1], raw[i + 2]];
    if (g > 200 && r > 150 && r < 230 && b < 120) lime++;
    else if (r > 220 && g > 220 && b > 220) white++;
  }
  assert.ok(lime > 200, `the spoken word is lime (${lime} px)`);
  assert.ok(white > 200, `the next word is still white (${white} px)`);
});
