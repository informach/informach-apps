import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { exportVoice, locateVideo, VOICE_EXPORT_FOLDER } from "../src/main/presenterVideo.ts";
import { treatVoice } from "../src/main/voiceTreat.ts";
import { LOW_CONFIDENCE } from "../src/shared/audioSync.ts";
import { masterCandidates, planPresenterVideo } from "../src/shared/presenterImport.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";
import { lessonPieces, withMaster } from "../src/shared/voiceMaster.ts";
import { lessonVoice, readWav, writeWav } from "./helpers/voice.ts";

/**
 * The whole trip with synthetic files, the way the editor runs it: a 65 s voice, treated and
 * exported for HeyGen; a "HeyGen" MP4 made of a color video and that voice 0.7 s late, encoded to
 * H.264 and AAC; the voice cut from 5 to 15 s after the export; then the video compared with the
 * files sent (masterCandidates + locateVideo) and placed by the plan (planPresenterVideo), which has
 * to follow the cut within one frame.
 */

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const FFMPEG = createRequire(import.meta.url)("ffmpeg-static") as string;
const MODEL = join(here, "..", "resources", "rnnoise", "sh.rnnn");
const tmp = mkdtempSync(join(tmpdir(), "ediaula-presenter-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

test("o vídeo do apresentador segue um corte feito depois da exportação, dentro de um quadro", {
  timeout: 240000,
}, async (t) => {
  const R = 48000;
  const source = join(tmp, "voz.wav");
  writeWav(source, lessonVoice(65, R, 21), R);
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
    duration: 65,
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
  const exportedClips: Clip[] = [
    { id: "a", assetId: "voz", trackId: "ta", start: 0, in: 0, duration: 65, volume: 1 },
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
    clips: exportedClips,
  };
  const master = await exportVoice({
    ffmpeg: FFMPEG,
    project,
    pieces: lessonPieces(project, "aula inteira"),
    scope: "lesson",
    dir: join(tmp, VOICE_EXPORT_FOLDER),
  });
  assert.equal(master.pieces.length, 1);
  const wav = master.pieces[0].file;
  assert.ok(existsSync(wav));
  assert.equal(dirname(dirname(wav)), join(tmp, VOICE_EXPORT_FOLDER), "uma pasta por exportação");
  const exported = readWav(wav);
  assert.equal(exported.rate, 48000);
  assert.ok(Math.abs(exported.samples.length / 48000 - 65) < 0.01, "65 s de voz");

  // "HeyGen": a color video, the voice 0.7 s late, H.264 + AAC at 25 fps.
  const mp4 = join(tmp, "apresentador.mp4");
  await run(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=green:s=320x240:r=25:d=66",
    "-i",
    wav,
    "-filter_complex",
    "[1:a]adelay=700:all=1,apad=whole_dur=66[a]",
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

  // After the export: 5 to 15 s of the timeline is cut out and the rest closes up.
  const later: Project = {
    ...project,
    clips: [
      { id: "a1", assetId: "voz", trackId: "ta", start: 0, in: 0, duration: 5, volume: 1 },
      { id: "a2", assetId: "voz", trackId: "ta", start: 5, in: 15, duration: 50, volume: 1 },
    ],
    voiceMasters: withMaster([], master),
  };
  const candidates = masterCandidates(later, new Set([wav]));
  assert.equal(candidates.length, 1, "o arquivo exportado, não a voz de agora");
  const located = await locateVideo(
    FFMPEG,
    mp4,
    candidates.map((c) => c.piece.file),
  );
  const plan = planPresenterVideo(later, candidates, located.ranked, located.duration);
  assert.ok(plan);
  const { offset, confidence, scale } = plan.match.result;
  t.diagnostic(
    `encaixe do MP4: erro ${(Math.abs(offset + 0.7) * 1000).toFixed(2)} ms (deslocamento ${offset} s, esperado -0,7), confiança ${confidence}, fator ${scale}`,
  );
  assert.equal(plan.candidate.master?.id, master.id);
  assert.ok(confidence >= LOW_CONFIDENCE);
  assert.equal(plan.ambiguous, false);
  assert.equal(plan.doubtful, false);
  assert.equal(plan.stale, true, "a voz mudou depois da exportação, e o encaixe segue o corte");
  const frame = 1 / project.settings.fps;
  const expected = [
    { start: 0, in: 0.7, duration: 5 },
    { start: 5, in: 15.7, duration: 50 },
  ];
  assert.equal(plan.placements.length, expected.length, JSON.stringify(plan.placements));
  plan.placements.forEach((p, i) => {
    const want = expected[i];
    assert.ok(
      Math.abs(p.start - want.start) < frame &&
        Math.abs(p.in - want.in) < frame &&
        Math.abs(p.duration - want.duration) < frame,
      `${i}: ${JSON.stringify(p)}`,
    );
  });
});
