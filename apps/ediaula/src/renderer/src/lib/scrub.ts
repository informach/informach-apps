import { clipEnd, clipSpeed, sourceAt } from "@shared/timeline";
import type { Asset, Clip } from "@shared/types";
import { heard, useApp } from "@/state/app";
import { scrubSound } from "@/state/playback";
import { useProject } from "@/state/project";
import { playbackPath } from "./media";
import { listenPath, useVoiceListen } from "./voice";

/**
 * The sound of moments the media elements cannot play: going backwards (J), one frame at a time
 * and dragging the playhead. Each is a grain of GRAIN seconds of what is heard under the
 * playhead (muted tracks and tracks out of a solo stay quiet), read in one-second blocks of PCM
 * from the main process (media:audioSnippet) and kept, so going back and forth over a stretch
 * reads it once. Grains going backwards are played reversed.
 */

const RATE = 24000;
const GRAIN = 0.08;
const BLOCK = 1;
const BLOCKS_KEPT = 160;
/** A grain that arrives later than this is dropped: the playhead is elsewhere by then. */
const STALE_MS = 220;
/** Short fades at both ends, so a grain never clicks. */
const FADE = 0.006;

let context: AudioContext | null = null;
const blocks = new Map<string, Promise<Float32Array | null>>();

function audio(): AudioContext {
  context ??= new AudioContext({ sampleRate: RATE, latencyHint: "interactive" });
  if (context.state === "suspended") void context.resume();
  return context;
}

/** One second of a file's sound (null when it has none there or could not be read). */
function block(path: string, index: number): Promise<Float32Array | null> {
  const key = `${path}|${index}`;
  let known = blocks.get(key);
  if (known) {
    blocks.delete(key);
    blocks.set(key, known);
    return known;
  }
  known = window.api.audioSnippet(path, index * BLOCK, BLOCK).then(
    (bytes) => {
      const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
      const out = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
      return out;
    },
    (error: unknown) => {
      blocks.delete(key);
      console.warn("scrub sound not read", path, error);
      return null;
    },
  );
  blocks.set(key, known);
  while (blocks.size > BLOCKS_KEPT) {
    const oldest = blocks.keys().next().value;
    if (oldest === undefined) break;
    blocks.delete(oldest);
  }
  return known;
}

/** Samples of [from, from + seconds) of a file, from its blocks. */
async function samples(
  path: string,
  from: number,
  seconds: number,
): Promise<Float32Array<ArrayBuffer>> {
  const start = Math.max(0, from);
  const count = Math.max(1, Math.round(seconds * RATE));
  const out = new Float32Array(count);
  const first = Math.floor(start / BLOCK);
  const last = Math.floor((start + seconds) / BLOCK);
  const read = await Promise.all(
    Array.from({ length: last - first + 1 }, (_, k) => block(path, first + k)),
  );
  for (let i = 0; i < count; i++) {
    const t = start + i / RATE;
    const index = Math.floor(t / BLOCK);
    const data = read[index - first];
    const at = Math.round((t - index * BLOCK) * RATE);
    if (data && at < data.length) out[i] = data[at];
  }
  return out;
}

/** What a clip's sound plays from in the editor: the treated voice, else the media (Preview). */
const soundPath = (a: Asset): string =>
  listenPath(a, useVoiceListen.getState().original) ?? playbackPath(a);

/** The clips heard at timeline time `t`. */
function heardAt(t: number): { clip: Clip; asset: Asset }[] {
  const project = useProject.getState().project;
  if (!project) return [];
  const solo = useApp.getState().solo;
  const tracks = new Map(project.tracks.map((tr) => [tr.id, tr]));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const out: { clip: Clip; asset: Asset }[] = [];
  for (const clip of project.clips) {
    if (t < clip.start || t >= clipEnd(clip) || clip.volume <= 0 || clip.mutedFor) continue;
    const track = tracks.get(clip.trackId);
    const asset = assets.get(clip.assetId);
    if (!track || !heard(track, solo) || !asset?.hasAudio || asset.missing) continue;
    out.push({ clip, asset });
  }
  return out;
}

/**
 * A grain at timeline time `t`. `rate` is how fast the playhead moves (negative backwards): the
 * grain covers GRAIN × |rate| seconds of the lesson in GRAIN seconds of sound.
 */
export async function grain(t: number, rate: number): Promise<void> {
  const asked = performance.now();
  const span = GRAIN * Math.max(0.25, Math.min(8, Math.abs(rate)));
  const backwards = rate < 0;
  const parts = await Promise.all(
    heardAt(t).map(async ({ clip, asset }) => {
      const speed = clipSpeed(clip);
      const src = sourceAt(clip, t);
      const length = span * speed;
      const from = backwards ? src - length : src;
      return { clip, data: await samples(soundPath(asset), from, length) };
    }),
  );
  if (!parts.length || performance.now() - asked > STALE_MS) return;
  const ctx = audio();
  const when = ctx.currentTime + 0.01;
  for (const { clip, data } of parts) {
    if (backwards) data.reverse();
    const fade = Math.min(Math.round(FADE * RATE), Math.floor(data.length / 2));
    for (let i = 0; i < fade; i++) {
      data[i] *= i / fade;
      data[data.length - 1 - i] *= i / fade;
    }
    const buffer = ctx.createBuffer(1, data.length, RATE);
    buffer.copyToChannel(data, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // The source seconds of the grain, played in GRAIN seconds.
    source.playbackRate.value = data.length / RATE / GRAIN;
    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, clip.volume);
    source.connect(gain).connect(ctx.destination);
    source.start(when);
  }
}

let lastScrub = 0;
let lastScrubAt = 0;

/** Dragging the playhead: a grain every GRAIN seconds of wall time, in the direction it moves. */
export function scrubTo(t: number): void {
  const now = performance.now();
  if (now - lastScrubAt < GRAIN * 1000) return;
  const moved = t - lastScrub;
  lastScrubAt = now;
  lastScrub = t;
  if (Math.abs(moved) < 1e-4) return;
  void grain(t, Math.sign(moved) * Math.max(0.25, Math.min(4, Math.abs(moved) / GRAIN)));
}

scrubSound.grain = (t, rate) => void grain(t, rate);
