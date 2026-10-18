import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFileAuthority } from "@informach/edi-desktop/files";
import { renderFramePng } from "../src/main/export/frame.ts";
import type { RunOptions } from "../src/main/export/renderSegments.ts";
import { type ExportDeps, exportLesson } from "../src/main/export-lesson.ts";
import { ffmpegVersion, filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import type { Asset, ExportSpec, Project } from "../src/shared/types.ts";

/**
 * Lote 13 with the real FFmpeg: a stretch exported on its own (length, captions and chapters
 * counted from its start, the chapters found by ffprobe), the voice and the music as stems, the
 * current frame as a PNG that is the very frame of the video, and a region effect that changes
 * only its region.
 */

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FFPROBE: string = require("@derhuerst/ffprobe-static");
const SCRIPT = await filterScriptOption(FFMPEG);
const VERSION = await ffmpegVersion(FFMPEG);
const dir = mkdtempSync(join(tmpdir(), "ediaula-l13-"));
const ff = (args: string[]): string =>
  execFileSync(FFMPEG, ["-y", "-v", "error", ...args], {
    stdio: "pipe",
    maxBuffer: 1 << 26,
  }).toString();

const screen = join(dir, "tela.mp4");
ff([
  ...["-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=8"],
  ...["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", screen],
]);
const voice = join(dir, "voz.wav");
ff(["-f", "lavfi", "-i", "sine=f=330:d=8", voice]);
const music = join(dir, "musica.wav");
ff(["-f", "lavfi", "-i", "sine=f=220:d=8", music]);

const video = (id: string, path: string): Asset => ({
  id,
  name: id,
  path,
  kind: "video",
  duration: 8,
  width: 320,
  height: 180,
  fps: 30,
  hasVideo: true,
  hasAudio: false,
  size: 1,
  proxyStatus: "none",
});
const sound = (id: string, path: string): Asset => ({
  ...video(id, path),
  kind: "audio",
  width: 0,
  height: 0,
  fps: 0,
  hasVideo: false,
  hasAudio: true,
});

function lesson(): Project {
  return {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 320, height: 180, fps: 30 },
    publish: { title: "Frações" },
    markers: [
      { id: "a", t: 0, label: "Abertura", chapter: true },
      { id: "b", t: 2.5, label: "Exemplo", chapter: true },
      { id: "c", t: 5, label: "Exercício", chapter: true },
    ],
    assets: [video("tela", screen), sound("voz", voice), sound("musica", music)],
    tracks: [
      { id: "v", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
      { id: "a", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
      {
        id: "m",
        kind: "audio",
        name: "Música",
        muted: false,
        hidden: false,
        locked: false,
        music: true,
      },
    ],
    clips: [
      { id: "s", assetId: "tela", trackId: "v", start: 0, in: 0, duration: 8, volume: 1 },
      {
        id: "vo",
        assetId: "voz",
        trackId: "a",
        start: 0,
        in: 0,
        duration: 8,
        volume: 1,
        gain: [
          { t: 0, db: 0 },
          { t: 4, db: -20 },
        ],
      },
      { id: "mu", assetId: "musica", trackId: "m", start: 0, in: 0, duration: 8, volume: 0.5 },
    ],
  };
}

const spec = (outPath: string): ExportSpec => ({
  outPath,
  width: 320,
  height: 180,
  fps: 30,
  videoBitrate: 4000,
  normalizeLoudness: false,
  encoder: "x264",
});

async function deps(
  side: string,
  grant: (a: ReturnType<typeof createFileAuthority>) => Promise<void>,
): Promise<ExportDeps> {
  const authority = createFileAuthority(["ediaula"]);
  for (const path of [screen, voice, music]) await authority.grantRead(path);
  await grant(authority);
  await mkdir(side, { recursive: true });
  return {
    assertRead: (p) => authority.assertRead(p),
    assertWrite: (p) => authority.assertWrite(p, false),
    assertRelatedExport: (p, q) => authority.assertRelatedExport(p, q),
    fontsDirectory: dir,
    filterScriptOption: SCRIPT,
    ffmpegVersion: VERSION,
    cacheDirectory: join(side, "cache"),
    workDirectory: join(side, "work"),
    check: () => {},
    async run(args: string[], options?: RunOptions) {
      const result = spawnSync(FFMPEG, args, { encoding: "utf8", maxBuffer: 1 << 26 });
      if (result.status !== 0) throw new Error(result.stderr);
      return options?.capture === "stderr" ? result.stderr : result.stdout;
    },
  };
}

/** export:framePng as main/index.ts runs it: the spec checked, its PNG destination writable. */
async function exportFramePng(
  project: Project,
  t: number,
  frameSpec: ExportSpec,
  d: ExportDeps,
): Promise<string> {
  const out = await d.assertWrite(frameSpec.outPath);
  return renderFramePng(project, frameSpec, t, out, {
    assertRead: d.assertRead,
    run: (args) => d.run(args),
    filterScriptOption: d.filterScriptOption,
    cacheDirectory: d.cacheDirectory,
    workDirectory: d.workDirectory,
    fontsDirectory: d.fontsDirectory,
  });
}

const probe = (path: string, entries: string[]): Record<string, unknown> =>
  JSON.parse(execFileSync(FFPROBE, ["-v", "error", ...entries, "-of", "json", path]).toString());

test("a stretch exported on its own: length, captions, chapters in the MP4 and the stems", {
  timeout: 180_000,
}, async () => {
  const side = join(dir, "range");
  const out = join(dir, "trecho.mp4");
  const stems = join(dir, "stems");
  await mkdir(stems);
  const d = await deps(side, async (a) => {
    await a.grantWrite(out);
    await a.grantWrite(join(stems, "trecho (voz).wav"));
    await a.grantWrite(join(stems, "trecho (música).wav"));
  });
  await exportLesson(
    lesson(),
    {
      ...spec(out),
      range: { from: 2, to: 6 },
      captionCues: [
        { start: 1, end: 2.5, text: "antes" },
        { start: 3, end: 4, text: "dentro" },
      ],
      stems: { voice: join(stems, "trecho (voz).wav"), music: join(stems, "trecho (música).wav") },
    },
    d,
  );
  const info = probe(out, [
    "-count_frames",
    "-show_entries",
    "stream=codec_type,nb_read_frames,duration",
  ]) as {
    streams: { codec_type: string; nb_read_frames?: string; duration: string }[];
  };
  const v = info.streams.find((s) => s.codec_type === "video");
  const s = info.streams.find((s) => s.codec_type === "audio");
  assert.equal(Number(v?.nb_read_frames), 120);
  assert.ok(Math.abs(Number(s?.duration) - 4) < 0.03, `sound ${s?.duration} s`);
  const chapters = (
    probe(out, ["-show_chapters"]) as {
      chapters: { start_time: string; tags: { title: string } }[];
    }
  ).chapters;
  assert.deepEqual(
    chapters.map((c) => [Number(c.start_time), c.tags.title]),
    [
      [0, "Abertura"],
      [0.5, "Exemplo"],
      [3, "Exercício"],
    ],
  );
  const srt = readFileSync(join(dir, "trecho.srt"), "utf8");
  assert.match(srt, /00:00:00,000 --> 00:00:00,500\nantes/);
  assert.match(srt, /00:00:01,000 --> 00:00:02,000\ndentro/);
  for (const name of ["trecho (voz).wav", "trecho (música).wav"]) {
    const path = join(stems, name);
    assert.ok(existsSync(path), name);
    const stem = probe(path, ["-show_entries", "stream=duration"]) as {
      streams: { duration: string }[];
    };
    assert.ok(
      Math.abs(Number(stem.streams[0].duration) - 4) < 0.01,
      `${name}: ${stem.streams[0].duration}`,
    );
  }
  // The voice's envelope: −10 dB at 2 s of the lesson, −20 dB from 4 s on.
  const level = (at: number): number => {
    const r = spawnSync(
      FFMPEG,
      [
        "-v",
        "info",
        "-ss",
        String(at),
        "-t",
        "0.2",
        "-i",
        join(stems, "trecho (voz).wav"),
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
      ],
      { encoding: "utf8" },
    );
    return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1]);
  };
  const drop = level(0.1) - level(2.9);
  assert.ok(drop > 8 && drop < 11, `envelope ${level(0.1)} and ${level(2.9)} dB`);
});

/** PSNR (dB) of two pictures, optionally of one region of them. */
function psnr(a: string, b: string, crop = ""): number {
  const r = spawnSync(
    FFMPEG,
    [
      "-v",
      "info",
      "-i",
      a,
      "-i",
      b,
      "-lavfi",
      `[0:v]${crop || "null"},format=rgb24[x];[1:v]${crop || "null"},format=rgb24[y];[x][y]psnr`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  const m = /average:(inf|[\d.]+)/.exec(r.stderr);
  assert.ok(m, r.stderr.slice(-500));
  return m[1] === "inf" ? Number.POSITIVE_INFINITY : Number(m[1]);
}

test("the current frame as a PNG is the frame of the video; a region effect changes only its region", {
  timeout: 180_000,
}, async () => {
  const side = join(dir, "frame");
  const mp4 = join(dir, "inteira.mp4");
  const png = join(dir, "quadro.png");
  const blurred = join(dir, "desfocado.png");
  const d = await deps(side, async (a) => {
    for (const p of [mp4, png, blurred]) await a.grantWrite(p);
  });
  const project = lesson();
  await exportLesson(project, { ...spec(mp4), videoBitrate: 20000, quality: "max" }, d);
  // 3.5 s is frame 105.
  await exportFramePng(project, 3.5, spec(png), d);
  const fromVideo = join(dir, "do-video.png");
  // Read in the colors the file is tagged with (BT.709, as a browser or a player shows it).
  ff([
    ...["-i", mp4, "-vf"],
    "select=eq(n\\,105),scale=in_color_matrix=bt709:in_range=tv:flags=accurate_rnd+full_chroma_int,format=rgb24",
    ...["-frames:v", "1", "-update", "1", fromVideo],
  ]);
  const same = psnr(png, fromVideo);
  assert.ok(same > 35, `PSNR ${same} dB`);

  // Blur over the left half, top: only that part changes.
  const blur: Project = {
    ...project,
    assets: [
      ...project.assets,
      { ...video("fx", join(dir, "nada.png")), kind: "image", generated: "effect" },
    ],
    tracks: [
      { id: "r", kind: "video", name: "Efeito", muted: false, hidden: false, locked: false },
      ...project.tracks,
    ],
    clips: [
      ...project.clips,
      {
        id: "rf",
        assetId: "fx",
        trackId: "r",
        start: 3,
        in: 0,
        duration: 1,
        volume: 0,
        regionFx: { kind: "blur", rect: { x: 0, y: 0, w: 0.5, h: 0.5 }, feather: 0, strength: 1 },
      },
    ],
  };
  await exportFramePng(blur, 3.5, spec(blurred), d);
  const outside = psnr(png, blurred, "crop=160:90:160:90");
  const inside = psnr(png, blurred, "crop=150:80:4:4");
  assert.ok(outside > 60, `outside the region ${outside} dB`);
  assert.ok(inside < 30, `inside the region ${inside} dB`);
  await rm(side, { recursive: true, force: true });
});

/** The RGB of one pixel of a PNG (FFmpeg crops it and writes raw bytes). */
function pixel(png: string, x: number, y: number): [number, number, number] {
  const raw = execFileSync(FFMPEG, [
    ...["-v", "error", "-i", png, "-vf", `crop=1:1:${x}:${y},format=rgb24`],
    ...["-f", "rawvideo", "-"],
  ]);
  return [raw[0], raw[1], raw[2]];
}

test("every new look renders: background, device, color, spotlight, pixelate and an annotation sprite", {
  timeout: 180_000,
}, async () => {
  const side = join(dir, "looks");
  const out = join(dir, "looks.png");
  // A transparent VP9 sprite as the renderer writes one for an annotation that comes in (in
  // the app's cache, where the export reads its own files).
  await mkdir(join(side, "cache"), { recursive: true });
  const sprite = join(side, "cache", "rv.webm");
  ff([
    ...[
      "-f",
      "lavfi",
      "-i",
      "color=c=white:s=64x32:r=30:d=2,format=yuva420p,geq=lum=235:cb=128:cr=128:a='if(lt(X,32),255,0)'",
    ],
    ...["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", sprite],
  ]);
  const d = await deps(side, async (a) => {
    await a.grantWrite(out);
  });
  const base = lesson();
  const project: Project = {
    ...base,
    background: { kind: "gradient", from: "#FF0000", to: "#0000FF", angle: 90 },
    assets: [
      ...base.assets,
      { ...video("fx", join(dir, "nada.png")), kind: "image", generated: "effect" },
      {
        ...video("note", join(dir, "nota.png")),
        kind: "image",
        width: 64,
        height: 32,
        generated: "annotation",
      },
    ],
    tracks: [
      { id: "n", kind: "video", name: "Nota", muted: false, hidden: false, locked: false },
      { id: "r", kind: "video", name: "Efeito", muted: false, hidden: false, locked: false },
      ...base.tracks,
    ],
    clips: [
      ...base.clips.map((c) =>
        c.id === "s"
          ? {
              ...c,
              transform: { x: 0.5, y: 0.5, scale: 0.6, opacity: 1, device: "laptop" as const },
              color: { brightness: 0.05, saturation: 1.3, temperature: 4500 },
            }
          : c,
      ),
      {
        id: "sp",
        assetId: "fx",
        trackId: "r",
        start: 0,
        in: 0,
        duration: 4,
        volume: 0,
        regionFx: {
          kind: "spotlight",
          rect: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
          feather: 10,
          strength: 1,
        },
      },
      {
        id: "px",
        assetId: "fx",
        trackId: "r",
        start: 4,
        in: 0,
        duration: 2,
        volume: 0,
        regionFx: {
          kind: "pixelate",
          rect: { x: 0, y: 0, w: 0.3, h: 0.3 },
          feather: 6,
          strength: 0.5,
        },
      },
      {
        id: "an",
        assetId: "note",
        trackId: "n",
        start: 1,
        in: 0,
        duration: 2,
        volume: 0,
        annotation: { kind: "balloon", color: "#3D6BFF", text: "Oi", reveal: "words" },
        transform: { x: 0.85, y: 0.15, scale: 0.2, opacity: 1 },
      },
    ],
  };
  const reveals = { an: { sprite, fps: 30, width: 64, height: 32 } };
  await exportFramePng(project, 2, { ...spec(out), reveals }, d);
  // The gradient shows at the edges: red on the left, blue on the right (around the darkness).
  const left = pixel(out, 1, 90);
  const right = pixel(out, 318, 90);
  assert.ok(left[0] > left[2], `left ${left}`);
  assert.ok(right[2] > right[0], `right ${right}`);
  // Around the spotlight it is dark; inside it, the lesson.
  const outsideLight = pixel(out, 20, 170);
  assert.ok(
    outsideLight.every((v) => v < 40),
    `around the spotlight ${outsideLight}`,
  );
  // The annotation's sprite is drawn over it, on the track above: its opaque half is white.
  const note = pixel(out, 256, 27);
  assert.ok(
    note.every((v) => v > 200),
    `annotation ${note}`,
  );
  // The pixelate region later on, and the device frame, render too.
  const later = join(dir, "looks-4s.png");
  await d.assertWrite(out);
  const authority = createFileAuthority(["ediaula"]);
  await authority.grantWrite(later);
  await exportFramePng(
    project,
    4.5,
    { ...spec(later), reveals },
    {
      ...d,
      assertWrite: (p) => authority.assertWrite(p, false),
    },
  );
  assert.ok(existsSync(later));
  await rm(side, { recursive: true, force: true });
});

test("the frame PNG carries the burned captions and the keys on screen (burnAss)", {
  timeout: 120_000,
}, async () => {
  const side = join(dir, "ass");
  const plain = join(dir, "sem-legenda.png");
  const burned = join(dir, "com-legenda.png");
  const d = await deps(side, async (a) => {
    await a.grantWrite(plain);
    await a.grantWrite(burned);
  });
  // A green box drawn by libass at the top left, as a burned caption would be.
  const ass = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 320",
    "PlayResY: 180",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Arial,20,&H0000FF00,&H0000FF00,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    "Dialogue: 0,0:00:00.00,0:00:08.00,Default,,0,0,0,,{\\pos(0,0)\\p1}m 0 0 l 100 0 100 50 0 50{\\p0}",
    "",
  ].join("\n");
  await exportFramePng(lesson(), 2, spec(plain), d);
  await exportFramePng(lesson(), 2, { ...spec(burned), burnAss: ass }, d);
  const box = pixel(burned, 50, 25);
  assert.ok(box[1] > 200 && box[0] < 80 && box[2] < 80, `caption box ${box}`);
  assert.notDeepEqual(pixel(plain, 50, 25), box);
  // Outside the box both frames are the same frame.
  assert.ok(psnr(plain, burned, "crop=160:90:160:90") > 40);
  await rm(side, { recursive: true, force: true });
});

test("a volume envelope of 500 points exports and shapes the sound", {
  timeout: 180_000,
}, async () => {
  const side = join(dir, "envelope");
  const out = join(dir, "envelope.mp4");
  const stems = join(dir, "envelope-stems");
  await mkdir(stems);
  const voicePath = join(stems, "envelope (voz).wav");
  const musicPath = join(stems, "envelope (música).wav");
  const d = await deps(side, async (a) => {
    await a.grantWrite(out);
    await a.grantWrite(voicePath);
    await a.grantWrite(musicPath);
  });
  // 0 dB for the first four seconds, then −20 dB, each point a hair apart so none is skipped.
  const gain = Array.from({ length: 500 }, (_, i) => {
    const t = i * 0.016;
    return { t, db: (t < 4 ? 0 : -20) + (i % 2 ? -0.01 : 0) };
  });
  const project = lesson();
  project.clips = project.clips.map((c) => (c.id === "vo" ? { ...c, gain } : c));
  await exportLesson(project, { ...spec(out), stems: { voice: voicePath, music: musicPath } }, d);
  const level = (at: number): number => {
    const r = spawnSync(
      FFMPEG,
      [
        "-v",
        "info",
        "-ss",
        String(at),
        "-t",
        "0.5",
        "-i",
        voicePath,
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
      ],
      { encoding: "utf8" },
    );
    return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1]);
  };
  const drop = level(1) - level(6);
  assert.ok(Math.abs(drop - 20) < 1, `envelope ${level(1)} and ${level(6)} dB`);
  await rm(side, { recursive: true, force: true });
});

test("a region that follows the recording is blurred where the zoom took what it covers", {
  timeout: 180_000,
}, async () => {
  const side = join(dir, "follow");
  const plain = join(dir, "zoom-sem-regiao.png");
  const followed = join(dir, "zoom-seguindo.png");
  const still = join(dir, "zoom-parada.png");
  const d = await deps(side, async (a) => {
    for (const p of [plain, followed, still]) await a.grantWrite(p);
  });
  const base = lesson();
  // The screen zooms 200% on its top left quarter from 1 s to 7 s.
  const zoomed: Project = {
    ...base,
    assets: [
      ...base.assets.map((a) =>
        a.id === "tela"
          ? {
              ...a,
              zooms: [
                {
                  id: "z",
                  start: 1,
                  end: 7,
                  scale: 2,
                  ease: 0.3,
                  auto: true,
                  focus: [{ t: 1, x: 0.25, y: 0.25 }],
                },
              ],
            }
          : a,
      ),
      { ...video("fx", join(dir, "nada.png")), kind: "image", generated: "effect" },
    ],
    tracks: [
      { id: "r", kind: "video", name: "Efeito", muted: false, hidden: false, locked: false },
      ...base.tracks,
    ],
  };
  const withRegion = (follow: boolean): Project => ({
    ...zoomed,
    clips: [
      ...zoomed.clips,
      {
        id: "rf",
        assetId: "fx",
        trackId: "r",
        start: 0,
        in: 0,
        duration: 8,
        volume: 0,
        regionFx: {
          kind: "blur",
          rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
          feather: 0,
          strength: 1,
          ...(follow ? { follow: true } : {}),
        },
      },
    ],
  });
  await exportFramePng(zoomed, 4, spec(plain), d);
  await exportFramePng(withRegion(true), 4, spec(followed), d);
  await exportFramePng(withRegion(false), 4, spec(still), d);
  // Drawn at 32,18 to 96,54 on the screen at rest; at 200% on the top left quarter it shows at
  // 64,36 to 192,108. The one that stays is blurred where it was drawn.
  const followIn = psnr(plain, followed, "crop=120:64:68:40");
  const followOut = psnr(plain, followed, "crop=100:60:210:115");
  assert.ok(followIn < 30, `inside the followed region ${followIn} dB`);
  assert.ok(followOut > 60, `outside it ${followOut} dB`);
  const stillIn = psnr(plain, still, "crop=56:30:36:20");
  const stillAtFollow = psnr(plain, still, "crop=80:50:104:52");
  assert.ok(stillIn < 30, `where the still one was drawn ${stillIn} dB`);
  assert.ok(stillAtFollow > 60, `the still one past its rectangle ${stillAtFollow} dB`);
  await rm(side, { recursive: true, force: true });
});
