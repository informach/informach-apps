import { clipEnd } from "./timeline.ts";
import type { Asset, Project } from "./types.ts";

/**
 * Media worth transcribing: assets with audio used on the timeline. Recordings with picture come
 * first, then audio on the upper audio tracks (voice), and music beds on lower tracks last.
 */
export function speechCandidates(project: Project): { asset: Asset; used: number }[] {
  const used = new Map<string, number>();
  const trackRank = new Map<string, number>();
  const order = new Map(project.tracks.map((t, i) => [t.id, i]));
  for (const c of project.clips) {
    used.set(c.assetId, (used.get(c.assetId) ?? 0) + (clipEnd(c) - c.start));
    const r = order.get(c.trackId) ?? 99;
    trackRank.set(c.assetId, Math.min(trackRank.get(c.assetId) ?? 99, r));
  }
  return project.assets
    .filter((a) => a.hasAudio && used.has(a.id) && !a.missing)
    .map((asset) => ({ asset, used: used.get(asset.id) ?? 0 }))
    .sort(
      (x, y) =>
        (x.asset.kind === "video" ? 0 : 1) - (y.asset.kind === "video" ? 0 : 1) ||
        (trackRank.get(x.asset.id) ?? 99) - (trackRank.get(y.asset.id) ?? 99) ||
        y.used - x.used,
    );
}

const fileOf = (path: string): string => path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
const stem = (path: string): string => fileOf(path).replace(/\.[^.]+$/, "");

/**
 * Everything still to transcribe so the whole lesson can be read as text: every candidate that
 * is heard on the timeline and has no transcript, except
 * - media whose clips are all silent (volume 0 or a muted track: a camera duplicating the
 *   microphone, an avatar video played without its sound);
 * - the voice extracted from a video ("<video>-voz.wav", made when a HeyGen MP4 is imported)
 *   and that video: the same speech is transcribed once, from the extracted voice, and not at
 *   all when either one already has a transcript.
 * `busy` holds the assets being transcribed right now.
 */
export function pendingSpeech(project: Project, busy: ReadonlySet<string> = new Set()): Asset[] {
  const muted = new Set(project.tracks.filter((t) => t.muted).map((t) => t.id));
  const heard = new Set(
    project.clips.filter((c) => c.volume > 0 && !muted.has(c.trackId)).map((c) => c.assetId),
  );
  const candidates = speechCandidates(project).map((c) => c.asset);
  const done = (a: Asset): boolean => a.transcriptStatus === "ready" || busy.has(a.id);
  // Each extracted voice with the video it came from.
  const pairs = new Map<string, Asset>();
  for (const voice of project.assets) {
    const match = /^(.*)-voz$/.exec(stem(voice.path));
    if (voice.kind !== "audio" || !match) continue;
    const video = project.assets.find((a) => a.kind === "video" && stem(a.path) === match[1]);
    if (video) {
      pairs.set(voice.id, video);
      pairs.set(video.id, voice);
    }
  }
  return candidates.filter((a) => {
    if (done(a) || !heard.has(a.id)) return false;
    const twin = pairs.get(a.id);
    if (!twin) return true;
    if (done(twin)) return false;
    // Neither is transcribed: the extracted voice is the one transcribed.
    return a.kind === "audio" || !candidates.includes(twin) || !heard.has(twin.id);
  });
}
