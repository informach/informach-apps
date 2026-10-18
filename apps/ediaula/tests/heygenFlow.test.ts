import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { exportVoice, HEYGEN_FOLDER, locateVideo } from "../src/main/heygen.ts";
import { treatVoice } from "../src/main/voiceTreat.ts";
import { LOW_CONFIDENCE } from "../src/shared/audioSync.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";
import { heygenPlacements, lessonPieces } from "../src/shared/voiceMaster.ts";
import { lessonVoice, readWav, writeWav } from "./helpers/voice.ts";

/**
 * The whole trip with synthetic files: a voice, treated; the lesson cut; the voice exported for
 * HeyGen; a "HeyGen" MP4 made of a color video and that voice 0.7 s late, encoded to H.264 and
 * AAC; found again by its sound and placed on the timeline within one frame.
 */

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const FFMPEG = createRequire(import.meta.url)("ffmpeg-static") as string;
const MODEL = join(here, "..", "resources", "rnnoise", "sh.rnnn");
const tmp = mkdtempSync(join(tmpdir(), "ediaula-heygen-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

test("voz gravada, tratada, exportada e o MP4 do HeyGen encaixado dentro de um quadro", {
  timeout: 180000,
}, async (t) => {
  const R = 48000;
  const source = join(tmp, "voz.wav");
  writeWav(source, lessonVoice(40, R, 21), R);
  const treated = await treatVoice({
    ffmpeg: FFMPEG,
    source,
    preset: "teacher",
    cacheRoot: join(tmp, "cache"),
    model: MODEL,
  });
  const voice: Asset = {
    id: "voz",
    name: "Voz",
    path: source,
    kind: "audio",
    duration: 40,
    width: 0,
    height: 0,
    fps: 0,
    hasVideo: false,
    hasAudio: true,
    size: 1,
    proxyStatus: "none",
    recording: { id: "take", role: "mic" },
    voicePreset: "teacher",
    treated: { path: treated.path, preset: "teacher", version: treated.version },
  };
  const track: Track = {
    id: "ta",
    kind: "audio",
    name: "Voz",
    muted: false,
    hidden: false,
    locked: false,
  };
  // Cut before the export: 12–16 s of the recording is out.
  const clips: Clip[] = [
    { id: "a", assetId: "voz", trackId: "ta", start: 0, in: 0, duration: 12, volume: 1 },
    { id: "b", assetId: "voz", trackId: "ta", start: 12, in: 16, duration: 24, volume: 1 },
  ];
  const project: Project = {
    version: 1,
    id: "p",
    name: "Aula de teste",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1280, height: 720, fps: 30 },
    assets: [voice],
    tracks: [track],
    clips,
  };
  const dir = join(tmp, HEYGEN_FOLDER);
  const master = await exportVoice({
    ffmpeg: FFMPEG,
    project,
    pieces: lessonPieces(project, "aula inteira"),
    scope: "lesson",
    dir,
  });
  assert.equal(master.pieces.length, 1);
  const wav = master.pieces[0].file;
  assert.ok(existsSync(wav));
  const exported = readWav(wav);
  assert.equal(exported.rate, 48000);
  assert.ok(Math.abs(exported.samples.length / 48000 - 36) < 0.01, "36 s: a voz já cortada");

  // "HeyGen": a color video, the voice 0.7 s late, H.264 + AAC at 25 fps.
  const mp4 = join(tmp, "heygen.mp4");
  await run(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=green:s=320x240:r=25:d=37",
    "-i",
    wav,
    "-filter_complex",
    "[1:a]adelay=700:all=1,apad=whole_dur=37[a]",
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    mp4,
  ]);
  const found = await locateVideo(FFMPEG, mp4, [wav]);
  t.diagnostic(
    `encaixe do MP4: erro ${(Math.abs(found.result.offset + 0.7) * 1000).toFixed(2)} ms (deslocamento ${found.result.offset} s, esperado -0,7), confiança ${found.result.confidence}, fator ${found.result.scale}`,
  );
  assert.equal(found.piece, 0);
  assert.ok(found.result.confidence >= LOW_CONFIDENCE);
  const frame = 1 / project.settings.fps;
  assert.ok(Math.abs(found.result.offset + 0.7) < frame, String(found.result.offset));

  // A cut after the export (2–4 s of the timeline): the video follows it.
  const later: Project = {
    ...project,
    clips: [
      { id: "a1", assetId: "voz", trackId: "ta", start: 0, in: 0, duration: 2, volume: 1 },
      { id: "a2", assetId: "voz", trackId: "ta", start: 2, in: 4, duration: 8, volume: 1 },
      { id: "b", assetId: "voz", trackId: "ta", start: 10, in: 16, duration: 24, volume: 1 },
    ],
  };
  const placed = heygenPlacements(
    later,
    master.pieces[0],
    found.result.offset,
    found.result.scale,
    found.duration,
  );
  assert.equal(placed.length, 2);
  assert.ok(Math.abs(placed[0].start - 0) < frame && Math.abs(placed[0].in - 0.7) < frame);
  // Timeline 2 s plays the voice of the recording's 4 s: video second 0.7 + 4.
  assert.ok(Math.abs(placed[1].start - 2) < frame && Math.abs(placed[1].in - 4.7) < frame);
});
