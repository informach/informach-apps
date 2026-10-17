import { clipEnd } from "./timeline.ts";
import type { Project } from "./types.ts";

/**
 * Background music that steps aside for the voice. The moments someone speaks come from the
 * transcript (or the whole clip, when it has none); the music volume follows an envelope over
 * them, the same curve in the preview and in the export.
 */

/** Music level while someone speaks (0.25 = −12 dB) and seconds of each ramp. */
export const DUCKING = { depth: 0.25, ramp: 0.35 };

/** Pauses shorter than this keep the music down, so it does not pump between sentences. */
const HOLD = 0.8;

interface SpeechWord {
  clipId: string;
  start: number;
  end: number;
}

/** Timeline ranges with someone speaking on the tracks that are not music, merged. */
export function speechSpans(
  project: Pick<Project, "clips" | "tracks" | "assets">,
  words: SpeechWord[] = [],
  transcribed: Set<string> = new Set(),
  ramp = DUCKING.ramp,
): [number, number][] {
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const raw: [number, number][] = [];
  for (const c of project.clips) {
    const track = tracks.get(c.trackId);
    const asset = assets.get(c.assetId);
    if (
      !track ||
      !asset ||
      track.music ||
      track.muted ||
      !asset.hasAudio ||
      asset.kind === "image" ||
      c.volume <= 0
    )
      continue;
    if (transcribed.has(asset.id)) {
      for (const w of words) if (w.clipId === c.id) raw.push([w.start, w.end]);
    } else raw.push([c.start, clipEnd(c)]);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of raw) {
    const last = out[out.length - 1];
    // Spans closer than two ramps would overlap their envelopes: they become one.
    if (last && a - last[1] < 2 * ramp + HOLD) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** How far down the music is at t: 0 = full volume, 1 = all the way to `depth`. */
function duckAmount(spans: [number, number][], t: number, ramp: number): number {
  for (const [a, b] of spans) {
    if (t < a - ramp) break;
    if (t <= b + ramp)
      return Math.min(1, Math.max(0, (t - (a - ramp)) / ramp), Math.max(0, (b + ramp - t) / ramp));
  }
  return 0;
}

export function duckGain(
  spans: [number, number][],
  t: number,
  depth = DUCKING.depth,
  ramp = DUCKING.ramp,
): number {
  return 1 - (1 - depth) * duckAmount(spans, t, ramp);
}

const n = (v: number): string => String(Math.round(v * 1000) / 1000);

/** ffmpeg volume expression of the same envelope (the spans never overlap, so the ramps add up). */
export function duckExpr(
  spans: [number, number][],
  depth = DUCKING.depth,
  ramp = DUCKING.ramp,
): string {
  if (!spans.length) return "1";
  const terms = spans.map(
    ([a, b]) => `clip((t-${n(a - ramp)})/${n(ramp)},0,1)*clip((${n(b + ramp)}-t)/${n(ramp)},0,1)`,
  );
  return `1-${n(1 - depth)}*min(1,${terms.join("+")})`;
}
