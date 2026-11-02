import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { z } from "zod";
import {
  fillSounds,
  type PlacedSound,
  SOUND_EFFECT_IDS,
  SOUND_EFFECTS,
  SOUND_RATE,
  SOUND_VERSION,
  type SoundEffectId,
  soundSamples,
  wavFile,
} from "../shared/soundEffects.ts";

/**
 * The sound effects written to disk: a track of placed sounds as FLAC (the cursor's clicks of a
 * recording, the automatic whooshes of a lesson), streamed to FFmpeg a second at a time so a
 * long lesson never sits whole in memory and its silence takes almost no room; and the library's
 * effects as WAV files a person can place on the timeline (or use anywhere else). FFmpeg comes
 * from the caller (main/ffmpeg.ts in the app), so this runs outside Electron in the tests.
 */

/**
 * Writes `sounds` (sorted by `at`) on a track `duration` seconds long, as stereo FLAC with the
 * same sound in both channels at full level, as the preview plays it (an upmix of mono would
 * take 3 dB off).
 */
export async function writeSoundTrack(
  ffmpeg: string,
  out: string,
  sounds: readonly PlacedSound[],
  duration: number,
): Promise<void> {
  const tmp = out.replace(/\.flac$/, ".part.flac");
  const proc = spawn(
    ffmpeg,
    [
      ...["-y", "-v", "error", "-f", "f32le", "-ar", String(SOUND_RATE), "-ac", "1"],
      ...["-i", "-", "-af", "pan=stereo|c0=c0|c1=c0", "-c:a", "flac", tmp],
    ],
    { windowsHide: true },
  );
  let err = "";
  proc.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
  proc.stdin.on("error", () => undefined);
  const done = new Promise<void>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg saiu com código ${code}`)),
    );
  });
  const total = Math.ceil(duration * SOUND_RATE);
  try {
    for (let from = 0; from < total; from += SOUND_RATE) {
      const chunk = new Float32Array(Math.min(SOUND_RATE, total - from));
      fillSounds(chunk, from, sounds, SOUND_RATE);
      const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      if (!proc.stdin.write(bytes)) await new Promise((res) => proc.stdin.once("drain", res));
    }
    proc.stdin.end();
    await done;
    await rename(tmp, out);
  } catch (error) {
    proc.kill("SIGKILL");
    await done.catch(() => undefined);
    await rm(tmp, { force: true });
    throw error;
  }
}

/** The samples of each sound, made once per process. */
const made = new Map<SoundEffectId, Float32Array>();
export function samplesOf(id: SoundEffectId): Float32Array {
  let samples = made.get(id);
  if (!samples) {
    samples = soundSamples(id, SOUND_RATE);
    made.set(id, samples);
  }
  return samples;
}

/** The longest lesson (a week, like the project) and the most sounds in one track. */
const duration = z
  .number()
  .positive()
  .max(7 * 86400);
const events = z
  .array(
    z.strictObject({
      at: z
        .number()
        .min(0)
        .max(7 * 86400),
      sound: z.enum(SOUND_EFFECT_IDS),
      volume: z.number().min(0).max(1),
    }),
  )
  .max(100_000);

/**
 * The automatic whooshes of a lesson as one FLAC in `cacheDir` (the export's own cache, which it
 * reads without asking), named by what it holds: the same whooshes are written once.
 */
export async function autoSoundTrack(
  ffmpeg: string,
  cacheDir: string,
  rawEvents: unknown,
  rawDuration: unknown,
): Promise<string> {
  const list = [...events.parse(rawEvents)].sort((a, b) => a.at - b.at);
  const seconds = duration.parse(rawDuration);
  const key = createHash("sha256")
    .update(JSON.stringify({ v: SOUND_VERSION, seconds, list }))
    .digest("hex")
    .slice(0, 24);
  const dir = join(cacheDir, "sounds");
  await mkdir(dir, { recursive: true });
  const out = join(dir, `auto-${key}.flac`);
  if (existsSync(out)) return out;
  await writeSoundTrack(
    ffmpeg,
    out,
    list.map((e) => ({ at: e.at, samples: samplesOf(e.sound), volume: e.volume })),
    seconds,
  );
  return out;
}

/** The file name of a library effect, the name shown in the library. */
export const soundFileName = (name: string): string => `${name}.wav`;

/**
 * The library's sound effects as WAV files in `dir`: a file that is missing, or is not what this
 * version makes (another size, or other bytes after a change of SOUND_VERSION, kept beside it in
 * a small stamp), is written again. Files of the person's own in that folder are left alone.
 */
export async function ensureSoundLibrary(
  dir: string,
): Promise<{ id: SoundEffectId; path: string }[]> {
  await mkdir(dir, { recursive: true });
  const stampFile = join(dir, ".versao");
  const stamp = await readFile(stampFile, "utf8").catch(() => "");
  const current = stamp.trim() === String(SOUND_VERSION);
  const out: { id: SoundEffectId; path: string }[] = [];
  for (const effect of SOUND_EFFECTS) {
    const path = join(dir, soundFileName(effect.name));
    const bytes = wavFile(samplesOf(effect.id), SOUND_RATE);
    const size = await stat(path).then(
      (s) => s.size,
      () => -1,
    );
    if (!current || size !== bytes.length) await atomicWrite(path, bytes);
    out.push({ id: effect.id, path });
  }
  if (!current) await atomicWrite(stampFile, String(SOUND_VERSION));
  return out;
}
