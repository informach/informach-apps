import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { type PieceMatch, rankPieces, SYNC_RATE } from "../shared/audioSync.ts";
import { newId } from "../shared/clipTime.ts";
import type { Project, VoiceMaster } from "../shared/types.ts";
import {
  exportFolderName,
  type PieceSpec,
  pieceFileName,
  renderPlan,
  renderSegments,
  repeatedLabels,
  sourceMapFor,
  type VoiceSegment,
  voiceHash,
} from "../shared/voiceMaster.ts";
import { pass } from "./voiceTreat.ts";

/**
 * The trip to HeyGen and back, in the main process: the voice pieces written as WAV files next
 * to the project (a folder per export, so an export never overwrites what went before), and the
 * MP4s that come back found in them by their sound (shared/audioSync.ts). Kept apart from
 * Electron so the end-to-end test runs it with a plain FFmpeg.
 */

export const HEYGEN_FOLDER = "Para o HeyGen";

export interface ExportRequest {
  ffmpeg: string;
  project: Project;
  pieces: readonly PieceSpec[];
  scope: VoiceMaster["scope"];
  /** The "Para o HeyGen" folder beside the project: each export gets a folder inside it. */
  dir: string;
  /** When the export is made (the folder's name). */
  now?: Date;
  /** Checks that every media file read may be read (the renderer's permissions). */
  assertRead?: (path: string) => Promise<string>;
  signal?: AbortSignal;
  onProgress?: (ratio: number) => void;
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Writes the pieces and says what they hold (the project keeps it among its voice masters). */
export async function exportVoice(r: ExportRequest): Promise<VoiceMaster> {
  if (!r.pieces.length) throw new Error("Não há voz na faixa Voz para exportar.");
  const repeated = repeatedLabels(r.pieces);
  if (repeated.length)
    throw new Error(
      `Duas partes da voz ficariam com o mesmo nome (${repeated.join(", ")}). Corrija o roteiro para que cada inserção tenha um código só.`,
    );
  const now = r.now ?? new Date();
  let folder = join(r.dir, exportFolderName(now));
  // Two exports in the same second: the second one gets a folder of its own too.
  for (let k = 2; await exists(folder); k++)
    folder = join(r.dir, `${exportFolderName(now)} (${k})`);
  await mkdir(folder, { recursive: true });
  const total = r.pieces.reduce((s, p) => s + p.end - p.start, 0);
  let done = 0;
  const pieces: VoiceMaster["pieces"] = [];
  for (const p of r.pieces) {
    const file = join(folder, pieceFileName(r.project.name, p.label));
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
    createdAt: now.getTime(),
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

/**
 * The first audio stream of a file as mono floats at `rate`, from the file's second 0 (a stream
 * that starts later is padded with silence, so its times are the file's). Shared memory, so a
 * worker can read it without a copy.
 */
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
      "-af",
      "aresample=async=1:first_pts=0",
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
  const out = new Float32Array(new SharedArrayBuffer(Math.floor(all.length / 2) * 4));
  for (let i = 0; i < out.length; i++) out[i] = all.readInt16LE(i * 2) / 32768;
  return out;
}

/** Decoded masters, by path and file stamp: several MP4s in a row compare with the same ones. */
const decoded = new Map<string, Promise<Float32Array>>();
const DECODED_LIMIT = 6;

async function decodeCached(
  ffmpeg: string,
  path: string,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const st = await stat(path);
  const key = `${path}|${st.size}|${st.mtimeMs}`;
  let found = decoded.get(key);
  if (found) {
    // The most recently used goes last.
    decoded.delete(key);
    decoded.set(key, found);
    return found;
  }
  found = decodeMono(ffmpeg, path, SYNC_RATE, signal);
  decoded.set(key, found);
  found.catch(() => decoded.delete(key));
  while (decoded.size > DECODED_LIMIT) {
    const oldest = decoded.keys().next().value;
    if (oldest === undefined) break;
    decoded.delete(oldest);
  }
  return found;
}

export interface Located {
  /** The exported pieces, best match first (at most five). */
  ranked: PieceMatch[];
  /** Seconds of sound in the video. */
  duration: number;
}

/** Ranks the pieces for a clip (main/syncPool.ts runs it in a worker thread). */
export type Ranker = (pieces: Float32Array[], clip: Float32Array) => Promise<PieceMatch[]>;

const inThread: Ranker = async (pieces, clip) => rankPieces(pieces, clip);

/** Which exported pieces a HeyGen video may have been made from, and where it sits in each. */
export async function locateVideo(
  ffmpeg: string,
  video: string,
  masters: readonly string[],
  signal?: AbortSignal,
  rank: Ranker = inThread,
): Promise<Located> {
  if (!masters.length) throw new Error("Nenhum arquivo de voz exportado para comparar.");
  const clip = await decodeMono(ffmpeg, video, SYNC_RATE, signal);
  if (clip.length < SYNC_RATE) throw new Error("O vídeo tem menos de um segundo de som.");
  const pieces: Float32Array[] = [];
  for (const m of masters) pieces.push(await decodeCached(ffmpeg, m, signal));
  const ranked = (await rank(pieces, clip)).slice(0, 5);
  return { ranked, duration: clip.length / SYNC_RATE };
}
