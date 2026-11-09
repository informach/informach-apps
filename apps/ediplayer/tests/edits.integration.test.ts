import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { resolveNativeMedia } from "@informach/edi-desktop/native-media";
import { runJob } from "../src/main/edit-runner.ts";
import { MediaEngine } from "../src/main/engine.ts";
import { type EditJob, NO_TRANSFORM } from "../src/shared/edit.ts";

/** Real FFmpeg on synthetic clips: every edit, and the source left byte for byte as it was. */

const require = createRequire(import.meta.url);
const paths = resolveNativeMedia({
  packaged: false,
  resourcesPath: "",
  developmentRoot: process.cwd(),
  developmentBinary: (name) =>
    require(name === "ffmpeg" ? "ffmpeg-static" : "@derhuerst/ffprobe-static"),
});
let dir = "";
let engine: MediaEngine;
const clip = (name: string) => join(dir, name);
const hash = async (file: string) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const ctx = (jobId: string) => ({
  jobId,
  signal: new AbortController().signal,
  onProgress: () => {},
  encoder: () => Promise.resolve("x264" as const),
});

async function make(name: string, args: string[]) {
  await engine.media.run(
    paths.ffmpeg,
    ["-hide_banner", "-nostdin", "-y", "-v", "error", ...args, clip(name)],
    {
      timeoutMs: 120_000,
    },
  );
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "ediplayer-it-"));
  engine = new MediaEngine(paths, join(dir, "cache"));
  const lavfi = (size: string, seconds: number, rate = 30) => [
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${size}:rate=${rate}:duration=${seconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:sample_rate=48000:duration=${seconds}`,
  ];
  const h264 = [
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-g",
    "30",
    "-keyint_min",
    "30",
    "-sc_threshold",
    "0",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-shortest",
  ];
  await make("a.mp4", [...lavfi("640x360", 10), ...h264]);
  await make("b.mp4", [...lavfi("640x360", 4), ...h264]);
  await make("c.mp4", [...lavfi("320x240", 3, 25), ...h264]);
  await make("d.mkv", [...lavfi("640x360", 4), ...h264]);
  await make("e.avi", [
    ...lavfi("320x240", 3),
    "-c:v",
    "mpeg4",
    "-q:v",
    "5",
    "-c:a",
    "libmp3lame",
    "-shortest",
  ]);
  await make("voz.m4a", [
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:sample_rate=48000:duration=6",
    "-c:a",
    "aac",
  ]);
  await writeFile(
    clip("fala.srt"),
    "1\n00:00:00,500 --> 00:00:03,000\nOlá, turma\n\n2\n00:00:04,000 --> 00:00:06,000\nFrações\n",
  );
  // Files the full review found breaking cuts: B-frames in Matroska (OBS), a stream that does not
  // start at 0 (cameras, MPEG-TS), long picture, VP8 and a timecode track.
  const bframes = [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-g",
    "60",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
  ];
  await make("obs.mkv", [...lavfi("640x360", 20), ...bframes]);
  await make("camera.ts", [
    ...lavfi("640x360", 20),
    ...bframes,
    "-output_ts_offset",
    "1.445",
    "-f",
    "mpegts",
  ]);
  await make("longo.mp4", [...lavfi("320x240", 28), ...h264]);
  await make("vp8.webm", [...lavfi("320x240", 3), "-c:v", "libvpx", "-b:v", "300k", "-an"]);
  await make("tc1.mov", [...lavfi("320x240", 3), ...h264, "-timecode", "00:00:00:00"]);
  await make("tc2.mov", [...lavfi("320x240", 3), ...h264, "-timecode", "00:00:10:00"]);
  await make("musica.mp3", [
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=330:sample_rate=44100:duration=12",
    "-c:a",
    "libmp3lame",
  ]);
});

/** Picture and sound lengths of a file: a cut must keep them together. */
async function streamLengths(file: string): Promise<{ video: number; audio: number }> {
  const text = await engine.media.run(paths.ffprobe, [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,duration",
    "-of",
    "json",
    file,
  ]);
  const data: unknown = JSON.parse(text);
  const streams = data && typeof data === "object" ? Reflect.get(data, "streams") : [];
  const of = (type: string) => {
    const s = Array.isArray(streams)
      ? streams.find((x) => x && Reflect.get(x, "codec_type") === type)
      : undefined;
    return Number(s ? Reflect.get(s, "duration") : Number.NaN);
  };
  return { video: of("video"), audio: of("audio") };
}

const cut = (
  source: string,
  output: string,
  ranges: { start: number; end: number }[],
): EditJob => ({
  kind: "export",
  source: clip(source),
  ranges,
  precise: false,
  transform: NO_TRANSFORM,
  preset: "original",
  output: clip(output),
});

// EdiPlayer is a Windows app: these run on Windows with the development FFmpeg and with the
// suite's bundle (9.0.2). The static Linux FFmpeg 6 used by the Linux CI is killed by a signal on
// the MPEG-TS cut, an FFmpeg build problem the app never meets.
const startsLate = process.platform === "win32" ? ["obs.mkv", "camera.ts"] : ["obs.mkv"];
test("lossless cuts of B-frame Matroska and of a stream that starts late", async () => {
  for (const source of startsLate) {
    const output = `${source}-cut.mkv`;
    await runJob(
      engine,
      cut(source, output, [
        { start: 4.5, end: 8 },
        { start: 10.2, end: 14 },
      ]),
      ctx(`cut-${source}`),
    );
    const f = await engine.probe(clip(output));
    // Starts snap to the keyframes at 4 s and 10 s: (8 - 4) + (14 - 10).
    assert.ok(Math.abs(f.duration - 8) < 0.35, `${source}: ${f.duration}`);
  }
});

test("many lossless cuts keep picture and sound together", async () => {
  const output = "quatro.mp4";
  await runJob(
    engine,
    cut("obs.mkv", output, [
      { start: 1.4, end: 4.6 },
      { start: 6.3, end: 9.2 },
      { start: 11, end: 14.5 },
      { start: 16.2, end: 19 },
    ]),
    ctx("four"),
  );
  const { video, audio } = await streamLengths(clip(output));
  assert.ok(Math.abs(video - audio) < 0.1, `video ${video} vs audio ${audio}`);
});

test("a short new sound ends the file, in copies and in conversions", async () => {
  for (const preset of ["original", "whatsapp"] as const) {
    const output = `curto-${preset}.mp4`;
    await runJob(
      engine,
      {
        ...cut("longo.mp4", output, [{ start: 0, end: 28 }]),
        preset,
        transform: { ...NO_TRANSFORM, replaceAudio: clip("voz.m4a") },
      },
      ctx(`short-${preset}`),
    );
    assert.ok(Math.abs((await engine.probe(clip(output))).duration - 6) < 0.3, preset);
  }
  await runJob(
    engine,
    {
      ...cut("longo.mp4", "normalizado.mp4", [
        { start: 2, end: 12 },
        { start: 14, end: 28 },
      ]),
      preset: "whatsapp",
      transform: { ...NO_TRANSFORM, replaceAudio: clip("voz.m4a"), normalize: true },
    },
    ctx("normalize-replace"),
  );
});

test("burned subtitles work in folders with quotes and graph characters", async () => {
  for (const folder of ["D'Avila", "x',[a];b"]) {
    await mkdir(join(dir, folder), { recursive: true });
    const output = join(dir, folder, "legendado.mp4");
    await runJob(
      engine,
      {
        ...cut("a.mp4", "unused.mp4", [{ start: 0, end: 5 }]),
        output,
        preset: "whatsapp",
        transform: { ...NO_TRANSFORM, burnSubtitles: clip("fala.srt") },
      },
      ctx(`burn-${folder.length}`),
    );
    assert.ok(Math.abs((await engine.probe(output)).duration - 5) < 0.3, folder);
  }
});

test("VP8 plays through a preview; timecode tracks do not stop a join; MP3 stays MP3", async () => {
  const preview = await engine.prepare(
    clip("vp8.webm"),
    "remux",
    0,
    () => {},
    new AbortController().signal,
    true,
  );
  assert.equal((await engine.probe(preview)).videoCodec, "h264");
  const joined = clip("tc.mov");
  await runJob(
    engine,
    {
      kind: "join",
      sources: [clip("tc1.mov"), clip("tc2.mov")],
      preset: "original",
      output: joined,
    },
    ctx("tc"),
  );
  assert.ok(Math.abs((await engine.probe(joined)).duration - 6) < 0.3);
  await runJob(engine, cut("musica.mp3", "musica-cortada.mp3", [{ start: 2, end: 9 }]), ctx("mp3"));
  const m = await engine.probe(clip("musica-cortada.mp3"));
  assert.equal(m.audio.at(0)?.codec, "mp3");
  assert.ok(Math.abs(m.duration - 7) < 0.2, `mp3 ${m.duration}`);
});

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

test("probe, keyframes, frame sheet and waveform", async () => {
  const f = await engine.probe(clip("a.mp4"));
  assert.equal(f.videoCodec, "h264");
  assert.equal(f.width, 640);
  assert.ok(Math.abs(f.duration - 10) < 0.2);
  const keys = await engine.keyframes(clip("a.mp4"));
  assert.ok(keys.length >= 9 && keys.length <= 11, `keyframes: ${keys.length}`);
  assert.ok(Math.abs((keys.at(1) ?? 0) - 1) < 0.05);
  const sheet = await engine.frameSheet(clip("a.mp4"));
  assert.ok(existsSync(sheet.file));
  assert.equal(sheet.tileHeight, 90);
  const wave = await engine.waveform(clip("a.mp4"));
  assert.ok(wave.length >= 30 && wave.some((v) => v > 0.1));
});

test("cut without re-encoding: two stretches joined, source untouched", async () => {
  const before = await hash(clip("a.mp4"));
  const output = clip("cortado.mp4");
  const job: EditJob = {
    kind: "export",
    source: clip("a.mp4"),
    ranges: [
      { start: 1.5, end: 3.2 },
      { start: 5, end: 7 },
    ],
    precise: false,
    transform: NO_TRANSFORM,
    preset: "original",
    output,
  };
  await runJob(engine, job, ctx("cut"));
  const f = await engine.probe(output);
  // Starts snap to the keyframes at 1 s and 5 s: (3.2 - 1) + (7 - 5).
  assert.ok(Math.abs(f.duration - 4.2) < 0.25, `duration ${f.duration}`);
  assert.equal(f.audio.length, 1);
  assert.equal(await hash(clip("a.mp4")), before);
  const left = (await readdir(dir)).filter((n) => n.startsWith(".edi-output-"));
  assert.deepEqual(left, []);
});

test("copy keeps rotation as metadata and can drop the sound", async () => {
  const output = clip("girado.mp4");
  await runJob(
    engine,
    {
      kind: "export",
      source: clip("a.mp4"),
      ranges: [{ start: 0, end: 10 }],
      precise: false,
      transform: { ...NO_TRANSFORM, rotate: 90, removeAudio: true },
      preset: "original",
      output,
    },
    ctx("rotate"),
  );
  const f = await engine.probe(output);
  assert.equal(f.rotation, 90);
  assert.equal(f.width, 360);
  assert.equal(f.audio.length, 0);
});

test("re-encoded export: crop, speed, normalize and burned subtitles", async () => {
  const output = clip("whats.mp4");
  await runJob(
    engine,
    {
      kind: "export",
      source: clip("a.mp4"),
      ranges: [
        { start: 0, end: 4 },
        { start: 6, end: 10 },
      ],
      precise: false,
      transform: {
        ...NO_TRANSFORM,
        crop: { x: 0.25, y: 0, w: 0.5, h: 1 },
        speed: 2,
        normalize: true,
        burnSubtitles: clip("fala.srt"),
      },
      preset: "whatsapp",
      output,
    },
    ctx("recode"),
  );
  const f = await engine.probe(output);
  assert.equal(f.videoCodec, "h264");
  assert.equal(f.width, 320);
  assert.equal(f.height, 360);
  assert.ok(Math.abs(f.duration - 4) < 0.3, `duration ${f.duration}`);
  assert.equal(f.audio.at(0)?.codec, "aac");
});

test("precise single cut, GIF and MP3", async () => {
  const precise = clip("preciso.mp4");
  await runJob(
    engine,
    {
      kind: "export",
      source: clip("a.mp4"),
      ranges: [{ start: 2.5, end: 4 }],
      precise: true,
      transform: NO_TRANSFORM,
      preset: "original",
      output: precise,
    },
    ctx("precise"),
  );
  assert.ok(Math.abs((await engine.probe(precise)).duration - 1.5) < 0.15);
  const gif = clip("trecho.gif");
  await runJob(
    engine,
    {
      kind: "export",
      source: clip("a.mp4"),
      ranges: [{ start: 1, end: 3 }],
      precise: false,
      transform: NO_TRANSFORM,
      preset: "gif",
      output: gif,
    },
    ctx("gif"),
  );
  const g = await engine.probe(gif);
  assert.equal(g.videoCodec, "gif");
  // The GIF preset caps the short side at 480: a 640 × 360 clip keeps its size.
  assert.equal(g.width, 640);
  const mp3 = clip("fala.mp3");
  await runJob(
    engine,
    {
      kind: "export",
      source: clip("a.mp4"),
      ranges: [{ start: 0, end: 5 }],
      precise: false,
      transform: NO_TRANSFORM,
      preset: "mp3",
      output: mp3,
    },
    ctx("mp3"),
  );
  const m = await engine.probe(mp3);
  assert.equal(m.hasVideo, false);
  assert.equal(m.audio.at(0)?.codec, "mp3");
});

test("split, join by copy, join by conversion and audio copy", async () => {
  const outputs = await runJob(
    engine,
    {
      kind: "split",
      source: clip("a.mp4"),
      pieces: [
        { start: 0, end: 5 },
        { start: 5, end: 10 },
      ],
      folder: dir,
      baseName: "a",
    },
    ctx("split"),
  );
  assert.deepEqual(outputs, [join(dir, "a (parte 1).mp4"), join(dir, "a (parte 2).mp4")]);
  for (const o of outputs) assert.ok(Math.abs((await engine.probe(o)).duration - 5) < 0.3);

  const joined = clip("junto.mp4");
  await runJob(
    engine,
    { kind: "join", sources: [clip("a.mp4"), clip("b.mp4")], preset: "original", output: joined },
    ctx("join"),
  );
  assert.ok(Math.abs((await engine.probe(joined)).duration - 14) < 0.3);

  const mixed = clip("misto.mp4");
  await runJob(
    engine,
    { kind: "join", sources: [clip("b.mp4"), clip("c.mp4")], preset: "original", output: mixed },
    ctx("mix"),
  );
  const m = await engine.probe(mixed);
  assert.equal(m.width, 640);
  assert.ok(Math.abs(m.duration - 7) < 0.3, `duration ${m.duration}`);

  const sound = clip("som.m4a");
  await runJob(
    engine,
    {
      kind: "audio",
      source: clip("a.mp4"),
      ranges: [{ start: 0, end: 10 }],
      audioIndex: 0,
      format: "copy",
      output: sound,
    },
    ctx("audio"),
  );
  const s = await engine.probe(sound);
  assert.equal(s.hasVideo, false);
  assert.equal(s.audio.at(0)?.codec, "aac");
});

test("replacing the sound keeps the picture and ends with the shorter one", async () => {
  const output = clip("novo-som.mp4");
  await runJob(
    engine,
    {
      kind: "export",
      source: clip("a.mp4"),
      ranges: [{ start: 0, end: 10 }],
      precise: false,
      transform: { ...NO_TRANSFORM, replaceAudio: clip("voz.m4a") },
      preset: "original",
      output,
    },
    ctx("replace"),
  );
  const f = await engine.probe(output);
  assert.ok(f.duration < 7, `duration ${f.duration}`);
  assert.equal(f.videoCodec, "h264");
});

test("the result never replaces its source", async () => {
  await assert.rejects(
    runJob(
      engine,
      {
        kind: "export",
        source: clip("a.mp4"),
        ranges: [{ start: 0, end: 2 }],
        precise: false,
        transform: NO_TRANSFORM,
        preset: "original",
        // Another spelling of the same file on Windows (names ignore case there); the very same
        // path on case-sensitive systems.
        output: process.platform === "win32" ? clip("A.MP4") : clip("a.mp4"),
      },
      ctx("self"),
    ),
    /arquivo usado na edição/,
  );
  // A hard link is the same file under another name: still refused.
  const { link } = await import("node:fs/promises");
  await link(clip("a.mp4"), clip("outro-nome.mp4"));
  await assert.rejects(
    runJob(engine, cut("a.mp4", "outro-nome.mp4", [{ start: 0, end: 2 }]), ctx("link")),
    /arquivo usado na edição/,
  );
  // Split parts never replace files already in the folder.
  await writeFile(join(dir, "partes (parte 1).mp4"), "existing");
  await assert.rejects(
    runJob(
      engine,
      {
        kind: "split",
        source: clip("a.mp4"),
        pieces: [
          { start: 0, end: 5 },
          { start: 5, end: 10 },
        ],
        folder: dir,
        baseName: "partes",
      },
      ctx("split-existing"),
    ),
    /Já existe/,
  );
});

test("playable copies: Matroska by copy, AVI through a preview", async () => {
  const signal = new AbortController().signal;
  const mkv = await engine.prepare(clip("d.mkv"), "remux", 0, () => {}, signal, true);
  const r = await engine.probe(mkv);
  assert.equal(r.videoCodec, "h264");
  assert.match(r.container, /mp4/);
  let last = 0;
  const avi = await engine.prepare(clip("e.avi"), "preview", 0, (v) => (last = v), signal, true);
  const p = await engine.probe(avi);
  assert.equal(p.videoCodec, "h264");
  assert.equal(p.audio.at(0)?.codec, "aac");
  assert.ok(last > 0);
});

test("deleting a stretch that ends off a keyframe: exact when re-encoded, early by copy", async () => {
  // Screen and phone recordings: a keyframe every 2 s. Deleting 5 to 7.3 s keeps 0-5 and 7.3-20.
  await make("gop2.mp4", [
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=30:duration=20",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=20",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-g",
    "60",
    "-keyint_min",
    "60",
    "-sc_threshold",
    "0",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
  ]);
  const ranges = [
    { start: 0, end: 5 },
    { start: 7.3, end: 20 },
  ];
  const lengths: Record<string, number> = {};
  for (const precise of [true, false]) {
    const output = clip(`gop2-${precise}.mp4`);
    await runJob(
      engine,
      {
        kind: "export",
        source: clip("gop2.mp4"),
        ranges,
        precise,
        transform: NO_TRANSFORM,
        preset: "original",
        output,
      },
      ctx(`gop2-${precise}`),
    );
    lengths[String(precise)] = (await engine.probe(output)).duration;
  }
  // What the person asked for: 5 + 12.7 s.
  assert.ok(Math.abs((lengths.true ?? 0) - 17.7) < 0.05, `exact: ${lengths.true}`);
  // By copy the second stretch starts on the keyframe at 6 s: 1.3 s of the deleted part stays.
  // This is why the exact cut is the default.
  assert.ok(Math.abs((lengths.false ?? 0) - 19) < 0.1, `copy: ${lengths.false}`);
});
