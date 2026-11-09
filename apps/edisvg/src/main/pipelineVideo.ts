import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { z } from "zod";

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
  const id = stem.split("-")[0] ?? stem;
  for (const name of [`${id}-cursor.json`, `${stem}-cursor.json`, `${stem}.cursor.json`]) {
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
    "-i",
    video,
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
    "-i",
    video,
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
