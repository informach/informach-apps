import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { z } from "zod";
import { fileInput } from "./pipelineMedia.ts";

/**
 * The screen demonstration of a pipeline run, on the main process: the clicks saved with a
 * recording (EdiAula keeps "<id>-cursor.json" beside "<id>-<id>-tela.mp4"), a light copy of the
 * stretch for the preview, frames for the assistant to look at, and the transparent layer (the
 * PNG sequence of the animation encoded as VP9 with alpha). FFmpeg comes from the caller.
 */

/** A click of the recording: its second and where, in the recording's pixels. */
export interface RecordedClick {
  t: number;
  x: number;
  y: number;
}

/** The cursor file of a recording, when one is beside it (EdiAula's names, then plain ones). */
export function findCursorFile(video: string): string | null {
  const dir = dirname(video);
  const stem = basename(video, extname(video));
  // "<id>-<id>-tela": the media folder of an EdiAula lesson keeps "<id>-cursor.json".
  const packaged = /^([a-z0-9]{6,})-\1-/i.exec(stem)?.[1];
  const names = [
    ...(packaged ? [`${packaged}-cursor.json`] : []),
    `${stem}-cursor.json`,
    `${stem}.cursor.json`,
    // A take folder (Gravações/<data>/tela.mp4) keeps its cursor as cursor.json.
    "cursor.json",
  ];
  for (const name of names) {
    const path = join(dir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

const cursorSchema = z.looseObject({
  width: z.number().positive(),
  height: z.number().positive(),
  // [seconds, x, y, button, held] as EdiAula writes them (shared/cursorData.ts).
  clicks: z.array(z.array(z.number()).min(3)).max(100000),
});

/**
 * The clicks of a recording in the video's pixels (the cursor data may be at another size than
 * the video: scaled), in order. Empty when the file cannot be read.
 */
export async function readClicks(
  cursorPath: string,
  video: { width: number; height: number },
): Promise<RecordedClick[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(cursorPath, "utf8"));
  } catch {
    return [];
  }
  const parsed = cursorSchema.safeParse(raw);
  if (!parsed.success) return [];
  const sx = video.width / parsed.data.width;
  const sy = video.height / parsed.data.height;
  return parsed.data.clicks
    .map(([t, x, y]) => ({
      t: t ?? 0,
      x: Math.round((x ?? 0) * sx),
      y: Math.round((y ?? 0) * sy),
    }))
    .filter((c) => Number.isFinite(c.t) && c.t >= 0)
    .sort((a, b) => a.t - b.t);
}

/** A stretch longer than this is not a scene. */
export const DEMO_MAX_SECONDS = 15 * 60;

/** A light copy of the first `seconds` of the video for the preview (540p, no sound). */
export function previewArgs(video: string, seconds: number, out: string): string[] {
  if (!(seconds > 0) || seconds > DEMO_MAX_SECONDS) throw new Error("Trecho de vídeo inválido.");
  return [
    "-y",
    "-v",
    "error",
    "-t",
    seconds.toFixed(3),
    ...fileInput(video),
    "-an",
    "-vf",
    "scale=-2:540",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "30",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ];
}

/** One frame of the video at `at` seconds, 1280 wide, as JPEG (for the assistant to look at). */
export function frameArgs(video: string, at: number, out: string): string[] {
  return [
    "-y",
    "-v",
    "error",
    "-ss",
    Math.max(0, at).toFixed(3),
    ...fileInput(video),
    "-frames:v",
    "1",
    "-vf",
    "scale=1280:-2",
    "-q:v",
    "4",
    out,
  ];
}

/**
 * The PNG frames of `dir` (quadro-00000.png…, as the sequence export names them) as a WebM with
 * alpha (VP9, yuva420p), for a track over the video in EdiAula.
 */
export function alphaWebmArgs(dir: string, fps: number, out: string): string[] {
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw new Error("FPS inválido.");
  return [
    "-y",
    "-v",
    "error",
    "-framerate",
    String(fps),
    "-i",
    join(dir, "quadro-%05d.png"),
    "-c:v",
    "libvpx-vp9",
    "-pix_fmt",
    "yuva420p",
    "-b:v",
    "0",
    "-crf",
    "30",
    "-row-mt",
    "1",
    "-auto-alt-ref",
    "0",
    out,
  ];
}

/* ---------- The screen of a lesson package ---------- */

/** What plays in a stretch of the lesson's screen: a recording from a second of it, or black. */
export interface ScreenPiece {
  /** Seconds from the start of the stretch. */
  at: number;
  duration: number;
  source: {
    path: string;
    /** Source second it starts from, and how fast it plays. */
    in: number;
    speed: number;
    /** The recording's picture size and cursor data (null without one). */
    width: number;
    height: number;
    cursor: string | null;
  } | null;
}

/** The screen of a stretch of the lesson, at the recordings' size. */
export interface LessonScreen {
  width: number;
  height: number;
  fps: number;
  pieces: ScreenPiece[];
}

const screenLessonSchema = z.looseObject({
  settings: z.looseObject({ fps: z.number().positive().optional() }).optional(),
  assets: z.array(
    z.looseObject({
      id: z.string(),
      path: z.string(),
      cursor: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      fps: z.number().optional(),
      hasVideo: z.boolean().optional(),
      recording: z.looseObject({ role: z.string().optional() }).optional(),
    }),
  ),
  tracks: z.array(z.looseObject({ id: z.string(), hidden: z.boolean().optional() })),
  clips: z.array(
    z.looseObject({
      assetId: z.string(),
      trackId: z.string(),
      start: z.number(),
      in: z.number(),
      duration: z.number().positive(),
      speed: z.number().positive().nullish(),
    }),
  ),
});

/** A file of this computer (the lesson was unpacked here): never a URL or a network share. */
const localFile = (path: string): boolean => /^[a-z]:[\\/]/i.test(path) || /^\/(?!\/)/.test(path);

/**
 * The screen recordings that play over [from, to) of an EdiAula lesson, with the cuts of its
 * timeline: where two overlap, the upper track (listed first, as in EdiAula) wins; where none
 * plays, the stretch is black. Throws when no screen recording plays in the stretch.
 */
export async function lessonScreen(
  lessonPath: string,
  from: number,
  to: number,
): Promise<LessonScreen> {
  if (!(to > from) || to - from > DEMO_MAX_SECONDS) throw new Error("Trecho de vídeo inválido.");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(lessonPath, "utf8"));
  } catch {
    raw = null;
  }
  const parsed = screenLessonSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error("A aula do pacote não é uma aula do EdiAula que dê para ler.");
  const lesson = parsed.data;
  const assets = new Map(lesson.assets.map((a) => [a.id, a]));
  const order = new Map(lesson.tracks.map((t, index) => [t.id, t.hidden ? -1 : index]));
  type Screen = {
    clip: (typeof lesson.clips)[number];
    asset: (typeof lesson.assets)[number];
    layer: number;
  };
  const screens: Screen[] = [];
  for (const clip of lesson.clips) {
    const asset = assets.get(clip.assetId);
    const layer = order.get(clip.trackId) ?? -1;
    if (!asset || layer < 0 || asset.hasVideo === false) continue;
    if (asset.recording?.role !== "screen" && !asset.cursor) continue;
    if (!localFile(asset.path) || clip.start >= to || clip.start + clip.duration <= from) continue;
    screens.push({ clip, asset, layer });
  }
  const size = screens.find((c) => c.asset.width && c.asset.height)?.asset;
  if (!size?.width || !size.height)
    throw new Error("O pacote não tem gravação de tela nesse trecho da aula.");
  const width = size.width;
  const height = size.height;
  const cuts = [
    ...new Set([
      from,
      to,
      ...screens.flatMap(({ clip }) => [clip.start, clip.start + clip.duration]),
    ]),
  ]
    .filter((t) => t >= from && t <= to)
    .sort((a, b) => a - b);
  const pieces: ScreenPiece[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i] ?? from;
    const b = cuts[i + 1] ?? to;
    if (b - a < 0.001) continue;
    const top = screens
      .filter(({ clip }) => clip.start <= a + 1e-6 && clip.start + clip.duration >= b - 1e-6)
      .sort((x, y) => x.layer - y.layer)[0];
    const speed = top?.clip.speed ?? 1;
    const source = top
      ? {
          path: top.asset.path,
          in: top.clip.in + (a - top.clip.start) * speed,
          speed,
          width: top.asset.width || width,
          height: top.asset.height || height,
          cursor: top.asset.cursor && localFile(top.asset.cursor) ? top.asset.cursor : null,
        }
      : null;
    const last = pieces.at(-1);
    // The same recording going on without a cut, or black after black: one piece.
    if (
      last?.source &&
      source &&
      last.source.path === source.path &&
      last.source.speed === source.speed &&
      Math.abs(last.source.in + last.duration * last.source.speed - source.in) < 1e-3
    )
      last.duration += b - a;
    else if (last && !last.source && !source) last.duration += b - a;
    else pieces.push({ at: a - from, duration: b - a, source });
  }
  const fps = Math.round(Math.min(60, Math.max(1, lesson.settings?.fps ?? size.fps ?? 30)));
  return { width, height, fps, pieces };
}

/**
 * The stretch as one MP4 at the recordings' size: each piece read from its second and at its
 * speed, fitted into the frame (letterboxed when its size differs), black where nothing plays. A
 * recording that ends early holds its last picture, so every piece keeps its place.
 */
export function stretchVideoArgs(screen: LessonScreen, out: string): string[] {
  const { width: w, height: h, fps } = screen;
  if (!screen.pieces.length) throw new Error("Trecho de vídeo inválido.");
  const fit = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p`;
  const inputs: string[] = [];
  const chains: string[] = [];
  let input = 0;
  for (const [index, piece] of screen.pieces.entries()) {
    const d = piece.duration.toFixed(3);
    if (!piece.source) {
      chains.push(`color=c=black:s=${w}x${h}:r=${fps}:d=${d},setsar=1,format=yuv420p[p${index}]`);
      continue;
    }
    inputs.push(
      "-ss",
      piece.source.in.toFixed(3),
      "-t",
      (piece.duration * piece.source.speed).toFixed(3),
      ...fileInput(piece.source.path),
    );
    chains.push(
      `[${input}:v]setpts=(PTS-STARTPTS)/${piece.source.speed.toFixed(6)},fps=${fps},${fit},tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS[p${index}]`,
    );
    input++;
  }
  const labels = screen.pieces.map((_, index) => `[p${index}]`).join("");
  return [
    "-y",
    "-v",
    "error",
    ...inputs,
    "-filter_complex",
    [...chains, `${labels}concat=n=${screen.pieces.length}:v=1:a=0[out]`].join(";"),
    "-map",
    "[out]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ];
}

/**
 * The clicks of the stretch in its own seconds and pixels: each piece's from its recording's
 * cursor data, moved to where the piece plays and scaled into the frame as the video is.
 */
export async function stretchClicks(screen: LessonScreen): Promise<RecordedClick[]> {
  const out: RecordedClick[] = [];
  const read = new Map<string, z.infer<typeof cursorSchema> | null>();
  for (const piece of screen.pieces) {
    const source = piece.source;
    if (!source?.cursor) continue;
    let cursor = read.get(source.cursor);
    if (cursor === undefined) {
      try {
        const parsed = cursorSchema.safeParse(JSON.parse(await readFile(source.cursor, "utf8")));
        cursor = parsed.success ? parsed.data : null;
      } catch {
        cursor = null;
      }
      read.set(source.cursor, cursor);
    }
    if (!cursor) continue;
    const k = Math.min(screen.width / source.width, screen.height / source.height);
    const ox = (screen.width - source.width * k) / 2;
    const oy = (screen.height - source.height * k) / 2;
    const end = source.in + piece.duration * source.speed;
    for (const [t, x, y] of cursor.clicks) {
      if (t === undefined || x === undefined || y === undefined) continue;
      if (!(t >= source.in && t < end)) continue;
      out.push({
        t: piece.at + (t - source.in) / source.speed,
        x: Math.round(ox + ((x * source.width) / cursor.width) * k),
        y: Math.round(oy + ((y * source.height) / cursor.height) * k),
      });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** The cursor data of a stretch video, beside it as EdiAula names it (findCursorFile reads it). */
export function stretchCursorFile(
  video: string,
  screen: LessonScreen,
  clicks: readonly RecordedClick[],
): { path: string; text: string } {
  return {
    path: join(dirname(video), `${basename(video, extname(video))}-cursor.json`),
    text: JSON.stringify({
      version: 2,
      width: screen.width,
      height: screen.height,
      clicks: clicks.map((c) => [Number(c.t.toFixed(3)), c.x, c.y]),
    }),
  };
}
