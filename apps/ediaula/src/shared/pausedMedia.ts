import type { RecordingPiece, RecordingResult } from "./recording.ts";
import type { Transcript } from "./types.ts";

/**
 * What a take recorded during its pauses. Pausing never stops the capture (the resume is
 * instant: main/recording/session.ts), so the files hold those stretches too; importing the take
 * cuts them, and nothing may bring them back: a clip is never trimmed into them
 * (clipTime.ts sourceRoom), and the lesson package carries the files with them blanked (black
 * picture, silence) and the transcript without the words said there (main/package.ts).
 */

type Ranges = [number, number][];

const samePath = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Ranges sorted and joined where they touch or overlap. */
export function mergeSpans(ranges: readonly (readonly [number, number])[]): Ranges {
  const sorted = ranges.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Ranges = [];
  for (const [a, b] of sorted) {
    const last = out.at(-1);
    if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Source seconds of the file at `path` recorded during the take's pauses: the whole files (the
 * screen, the microphone and the computer's sound on the take's clock) by the pauses as they
 * are, the parts (a camera, files kept in parts) by where each one sits on the take's clock.
 */
export function pausedInMedia(
  result: Pick<
    RecordingResult,
    | "duration"
    | "pauses"
    | "screen"
    | "microphone"
    | "systemAudio"
    | "screenParts"
    | "microphoneParts"
    | "systemParts"
    | "cameraParts"
  >,
  path: string,
): Ranges {
  if (!result.pauses.length) return [];
  const pieces: RecordingPiece[] = [];
  for (const whole of [result.screen, result.microphone, result.systemAudio])
    if (whole && samePath(whole, path))
      pieces.push({ path, at: 0, in: 0, duration: result.duration });
  for (const list of [
    result.screenParts,
    result.microphoneParts,
    result.systemParts,
    result.cameraParts,
  ])
    for (const p of list ?? []) if (samePath(p.path, path)) pieces.push(p);
  const out: Ranges = [];
  for (const p of pieces)
    for (const [a, b] of result.pauses) {
      const from = Math.max(a, p.at);
      const to = Math.min(b, p.at + p.duration);
      if (to - from > 0.001) out.push([round(p.in + from - p.at), round(p.in + to - p.at)]);
    }
  return mergeSpans(out);
}

/** FFmpeg's `enable` expression for the ranges (seconds of the file). */
export function enableExpression(ranges: readonly (readonly [number, number])[]): string {
  return mergeSpans(ranges)
    .map(([a, b]) => `between(t,${round(a)},${round(b)})`)
    .join("+");
}

/**
 * FFmpeg's arguments for a copy of `input` with the ranges blanked: black picture and silence
 * there, everything else as it is, at the same times and the same length (every stream is kept
 * on its timestamps, so the clips over the copy show the same moments).
 */
export function blankPausesArgs(
  input: string,
  output: string,
  ranges: readonly (readonly [number, number])[],
  media: { video: boolean; audio: boolean },
): string[] {
  const when = enableExpression(ranges);
  if (!when) throw new Error("Nenhum trecho a apagar.");
  const ext = /\.([A-Za-z0-9]+)$/.exec(output)?.[1]?.toLowerCase() ?? "";
  // The voice of "Só voz" stays PCM (WAV, Matroska); the computer's sound from Chromium is Opus.
  const audioCodec =
    ext === "wav" || ext === "mkv"
      ? ["-c:a", "pcm_s16le"]
      : ext === "webm"
        ? ["-c:a", "libopus", "-b:a", "160k"]
        : ["-c:a", "aac", "-b:a", "192k"];
  return [
    "-hide_banner",
    "-v",
    "error",
    "-y",
    "-i",
    input,
    "-map",
    "0:v?",
    "-map",
    "0:a?",
    ...(media.video
      ? [
          "-vf",
          `drawbox=c=black:t=fill:enable='${when}'`,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
        ]
      : []),
    ...(media.audio ? ["-af", `volume=0:enable='${when}'`, ...audioCodec] : []),
    ...(ext === "mp4" || ext === "m4a" || ext === "mov" ? ["-movflags", "+faststart"] : []),
    output,
  ];
}

/** The transcript without the words said in the ranges: there it is silence, as the copy is. */
export function transcriptWithoutPauses(
  transcript: Transcript,
  ranges: readonly (readonly [number, number])[],
): Transcript {
  const paused = mergeSpans(ranges);
  const inside = (a: number, b: number): boolean => paused.some(([x, y]) => a < y && b > x);
  const speech = (list: readonly [number, number][]): Ranges =>
    list.flatMap(([a, b]) => {
      let parts: Ranges = [[a, b]];
      for (const [x, y] of paused)
        parts = parts.flatMap(([p, q]): Ranges => {
          if (q <= x || p >= y) return [[p, q]];
          const kept: Ranges = [];
          if (p < x) kept.push([p, x]);
          if (q > y) kept.push([y, q]);
          return kept;
        });
      return parts;
    });
  return {
    ...transcript,
    words: transcript.words.filter((w) => !inside(w.start, w.end)),
    silences: mergeSpans([...transcript.silences, ...paused]),
    ...(transcript.speech ? { speech: speech(transcript.speech) } : {}),
  };
}
