import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { locateInPieces, SYNC_RATE, type SyncResult } from "../shared/audioSync.ts";
import { newId } from "../shared/clipTime.ts";
import type { Project, VoiceMaster } from "../shared/types.ts";
import {
  type PieceSpec,
  pieceFileName,
  renderPlan,
  renderSegments,
  sourceMapFor,
  type VoiceSegment,
  voiceHash,
} from "../shared/voiceMaster.ts";
import { pass } from "./voiceTreat.ts";

/**
 * The trip to HeyGen and back, in the main process: the voice pieces written as WAV files next
 * to the project, and the MP4s that come back found in them by their sound (shared/audioSync.ts).
 * Kept apart from Electron so the end-to-end test runs it with a plain FFmpeg.
 */

export const HEYGEN_FOLDER = "Para o HeyGen";

export interface ExportRequest {
  ffmpeg: string;
  project: Project;
  pieces: readonly PieceSpec[];
  scope: VoiceMaster["scope"];
  /** Folder the files go to (`Para o HeyGen` beside the project). */
  dir: string;
  /** Checks that every media file read may be read (the renderer's permissions). */
  assertRead?: (path: string) => Promise<string>;
  signal?: AbortSignal;
  onProgress?: (ratio: number) => void;
}

/** Writes the pieces and says what they hold (the project keeps it as its voice master). */
export async function exportVoice(r: ExportRequest): Promise<VoiceMaster> {
  if (!r.pieces.length) throw new Error("Não há voz na faixa Voz para exportar.");
  await mkdir(r.dir, { recursive: true });
  const total = r.pieces.reduce((s, p) => s + p.end - p.start, 0);
  let done = 0;
  const pieces: VoiceMaster["pieces"] = [];
  for (const p of r.pieces) {
    const file = join(r.dir, pieceFileName(r.project.name, p.label));
    const partial = `${file}.partial.wav`;
    const plan = renderPlan(r.project, p.start, p.end, partial);
    if (r.assertRead) for (const input of plan.inputs) await r.assertRead(input);
    try {
      await pass(r.ffmpeg, plan.args, {
        signal: r.signal,
        duration: plan.duration,
        onProgress: (x) => r.onProgress?.((done + x * (p.end - p.start)) / total),
      });
      await rename(partial, file);
    } finally {
      await rm(partial, { force: true });
    }
    done += p.end - p.start;
    pieces.push({
      file,
      label: p.label,
      start: p.start,
      end: p.end,
      sourceMap: sourceMapFor(r.project, p.start, p.end),
    });
  }
  r.onProgress?.(1);
  return {
    id: newId("vm"),
    hash: voiceHash(r.project),
    createdAt: Date.now(),
    scope: r.scope,
    pieces,
  };
}

/** Writes the voice segments of [start, end] to `out` (the narration the screen is recorded over). */
export async function renderVoice(
  ffmpeg: string,
  segments: readonly VoiceSegment[],
  start: number,
  end: number,
  out: string,
  signal?: AbortSignal,
): Promise<void> {
  const partial = `${out}.partial.wav`;
  try {
    await pass(ffmpeg, renderSegments(segments, start, end, partial).args, { signal });
    await rename(partial, out);
  } finally {
    await rm(partial, { force: true });
  }
}

/** The first audio stream of a file as mono floats at `rate`. */
export async function decodeMono(
  ffmpeg: string,
  path: string,
  rate = SYNC_RATE,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  await pass(
    ffmpeg,
    [
      "-v",
      "error",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-ac",
      "1",
      "-ar",
      String(rate),
      "-f",
      "s16le",
      "pipe:1",
    ],
    {
      signal,
      onBytes: (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
      },
    },
  );
  const all = Buffer.concat(chunks, size);
  const out = new Float32Array(Math.floor(all.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = all.readInt16LE(i * 2) / 32768;
  return out;
}

export interface Located {
  /** Index of the master piece the video was made from. */
  piece: number;
  result: SyncResult;
  /** Seconds of sound in the video. */
  duration: number;
}

/** Which exported piece a HeyGen video was made from, and where it sits in it. */
export async function locateVideo(
  ffmpeg: string,
  video: string,
  masters: readonly string[],
  signal?: AbortSignal,
): Promise<Located> {
  const clip = await decodeMono(ffmpeg, video, SYNC_RATE, signal);
  if (clip.length < SYNC_RATE) throw new Error("O vídeo tem menos de um segundo de som.");
  const pieces: Float32Array[] = [];
  for (const m of masters) pieces.push(await decodeMono(ffmpeg, m, SYNC_RATE, signal));
  const best = locateInPieces(pieces, clip);
  if (!best) throw new Error("Nenhum arquivo de voz exportado para comparar.");
  return { ...best, duration: clip.length / SYNC_RATE };
}
