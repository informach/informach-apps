import { applyCuts } from "./cleanup.ts";
import { clipEnd, newId } from "./clipTime.ts";
import { presenterTransform } from "./compose.ts";
import { transformAt } from "./keyframes.ts";
import { PRESENTER_TRACK } from "./recordingImport.ts";
import { insertClips } from "./ripple.ts";
import type { Asset, Clip, Project, Track } from "./types.ts";
import { voiceClips, voiceTracks } from "./voiceMaster.ts";

/**
 * "Trocar uma fala": a line said again after the lesson was put together (the script changed, the
 * new line was generated as audio and as a short presenter video) takes the old one's place.
 * The old stretch [start, end] leaves every track text cuts reach, as "Excluir o intervalo" does;
 * a gap as long as the new line opens there on the same tracks, and the new line goes in it: the
 * voice on the voice track the old line was on, the presenter's video where the presenter was
 * (placed by the sound, with the old one's position and background removal), and on the screen
 * tracks the last frame before the line held for its length, until the screen is recorded again.
 * Everything after moves along together; a music bed that played to the end follows the new end.
 */

type Lesson = Pick<Project, "tracks" | "clips" | "assets" | "settings">;

const EPS = 1e-6;

export interface SpeechSwap {
  start: number;
  end: number;
  /** The new line's sound. */
  voice: Asset;
  /**
   * The presenter's video of the new line: `offset` is where, in the new voice, the video's second
   * 0 is heard (shared/audioSync.ts), `scale` how much faster or slower it runs.
   */
  presenter?: { asset: Asset; offset: number; scale?: number };
  /** Held frames: a clip on the screen tracks showing at `start` → the still of its frame there. */
  stills?: ReadonlyMap<string, string>;
}

export interface SpeechSwapResult {
  tracks: Track[];
  clips: Clip[];
  /** Where the new line is on the timeline. */
  at: [number, number];
}

const overlaps = (c: Clip, a: number, b: number): boolean =>
  c.start < b - EPS && clipEnd(c) > a + EPS;

/** The presenter's clips: videos marked as the presenter. */
function isPresenter(c: Clip, assets: ReadonlyMap<string, Asset>): boolean {
  const a = assets.get(c.assetId);
  return !!a && a.kind === "video" && a.origin === "presenter";
}

/**
 * The clips on the screen tracks that show at `start` (or end right there), whose frame is held
 * while the new line plays: videos and pictures of unlocked video tracks among `targets`, not the
 * presenter, not annotations or effects over the picture.
 */
export function heldClips(p: Lesson, targets: ReadonlySet<string>, start: number): Clip[] {
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const video = new Set(p.tracks.filter((t) => t.kind === "video").map((t) => t.id));
  return p.clips.filter((c) => {
    const a = assets.get(c.assetId);
    return (
      targets.has(c.trackId) &&
      video.has(c.trackId) &&
      !!a &&
      a.kind === "video" &&
      !a.missing &&
      !isPresenter(c, assets) &&
      !c.annotation &&
      !c.zoomLayer &&
      !c.regionFx &&
      !c.soundOnly &&
      c.start < start - EPS &&
      clipEnd(c) >= start - 0.05
    );
  });
}

const newTrack = (kind: Track["kind"], name: string): Track => ({
  id: newId("t"),
  kind,
  name,
  muted: false,
  hidden: false,
  locked: false,
});

export function swapSpeech(
  p: Lesson,
  targets: ReadonlySet<string>,
  swap: SpeechSwap,
): SpeechSwapResult {
  const { start, voice } = swap;
  const end = Math.max(start, swap.end);
  const length = voice.duration;
  if (!(length > 0)) throw new Error("O áudio novo da fala não tem duração.");
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  assets.set(voice.id, voice);
  if (swap.presenter) assets.set(swap.presenter.asset.id, swap.presenter.asset);
  const locked = new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));
  let tracks = [...p.tracks];

  // The voice goes where the old line was said, with its volume.
  const oldVoice = voiceClips(p).find(
    (c) => !locked.has(c.trackId) && overlaps(c, start, Math.max(end, start + 0.01)),
  );
  let voiceTrack = oldVoice
    ? tracks.find((t) => t.id === oldVoice.trackId)
    : voiceTracks(p).find((t) => !locked.has(t.id));
  if (!voiceTrack) {
    voiceTrack = newTrack("audio", "Voz");
    tracks = [...tracks, voiceTrack];
  }
  const inserted: Clip[] = [
    {
      id: newId("c"),
      assetId: voice.id,
      trackId: voiceTrack.id,
      start,
      in: 0,
      duration: length,
      volume: oldVoice?.volume ?? 1,
    },
  ];

  // The presenter: where it was during the old line, with its place on the frame.
  if (swap.presenter) {
    const { asset, offset } = swap.presenter;
    const scale = swap.presenter.scale && swap.presenter.scale > 0 ? swap.presenter.scale : 1;
    const oldPresenter = p.clips
      .filter(
        (c) =>
          isPresenter(c, assets) &&
          !locked.has(c.trackId) &&
          overlaps(c, start - 0.05, Math.max(end, start + 0.05) + 0.05),
      )
      .sort((a, b) => Math.abs(a.start - start) - Math.abs(b.start - start))[0];
    let track = oldPresenter ? tracks.find((t) => t.id === oldPresenter.trackId) : undefined;
    if (!track) {
      track = newTrack("video", PRESENTER_TRACK);
      tracks = [track, ...tracks];
    }
    // Video second v is heard at offset + v * scale of the new voice: only what falls inside it.
    const from = Math.max(0, offset);
    const to = Math.min(length, offset + asset.duration * scale);
    if (to - from > 1 / 30) {
      // Where the old presenter stood as the old line began (its keyframes there, if it moves).
      const transform = oldPresenter
        ? transformAt(
            oldPresenter,
            Math.max(oldPresenter.start, Math.min(start, clipEnd(oldPresenter) - EPS)),
          )
        : presenterTransform(asset, p.settings);
      inserted.push({
        id: newId("c"),
        assetId: asset.id,
        trackId: track.id,
        start: start + from,
        in: (from - offset) / scale,
        duration: to - from,
        volume: 0,
        ...(Math.abs(scale - 1) > 1e-4 ? { speed: 1 / scale } : {}),
        ...(transform ? { transform } : {}),
      });
    }
  }

  // The screen holds its last frame before the line while the new one plays.
  for (const c of heldClips(p, targets, start)) {
    const still = swap.stills?.get(c.id);
    if (!still) continue;
    inserted.push({
      id: newId("c"),
      assetId: still,
      trackId: c.trackId,
      start,
      in: 0,
      duration: length,
      volume: 0,
      transform: transformAt(c, Math.min(start, clipEnd(c))),
    });
  }

  // The old line leaves every track the new one goes on too: the voice and the presenter are cut
  // there even if the lesson's cuts would not reach them, so the old line never plays after the new.
  const all = new Set([...targets, ...inserted.map((c) => c.trackId)]);
  for (const id of locked) all.delete(id);
  const cut = end - start > EPS ? applyCuts(p.clips, [[start, end]], all, locked) : p.clips;
  const clips = insertClips({ ...p, tracks, clips: cut }, all, inserted, start);
  return { tracks, clips, at: [start, start + length] };
}
