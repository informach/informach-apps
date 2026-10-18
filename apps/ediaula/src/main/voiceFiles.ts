import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { desktopFiles } from "@informach/edi-desktop/main";
import { app } from "electron";
import { z } from "zod";
import type { VoiceSegment } from "../shared/voiceMaster.ts";
import { NARRATION_CACHE_BYTES, pruneCache, touch } from "./cachePrune.ts";
import { FFMPEG } from "./ffmpeg.ts";
import { renderVoice } from "./presenterVideo.ts";

/**
 * The lesson's voice rendered to one file in the cache (userData/cache/narracao), named by what
 * it holds: the narration the screen is recorded over, and the current voice an edited lesson's
 * presenter video is matched against. Every media file read must be one the editor may read.
 */

const time = z
  .number()
  .min(0)
  .max(7 * 86400);
export const voiceSegmentsSchema = z
  .array(
    z.strictObject({
      path: z.string().min(1).max(32768),
      start: time,
      in: time,
      duration: time,
      speed: z.number().positive().max(16),
      volume: z.number().min(0).max(16),
    }),
  )
  .max(20000);

export async function renderVoiceCached(
  raw: unknown,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<string> {
  const segments: VoiceSegment[] = voiceSegmentsSchema.parse(raw);
  const from = time.parse(start);
  const to = time.parse(end);
  if (!(to > from)) throw new Error("Trecho de voz vazio.");
  for (const s of segments) s.path = await desktopFiles.assertRead(s.path);
  // A file written again under the same name is another voice.
  const stamps = [...new Set(segments.map((s) => s.path))].map((p) => {
    const st = statSync(p);
    return [p, st.size, st.mtimeMs];
  });
  const key = createHash("sha1")
    .update(JSON.stringify([segments, from, to, stamps]))
    .digest("hex")
    .slice(0, 20);
  const dir = join(app.getPath("userData"), "cache", "narracao");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${key}.wav`);
  if (existsSync(out)) await touch(out);
  else {
    await renderVoice(FFMPEG, segments, from, to, out, signal);
    await pruneCache(dir, NARRATION_CACHE_BYTES, out);
  }
  await desktopFiles.grantRead(out);
  return out;
}
