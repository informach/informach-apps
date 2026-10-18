import { clipEnd, makeClip, newId } from "./timeline.ts";
import type { Asset, Project, Track } from "./types.ts";

/** The track narrations recorded over the lesson go on. */
export const NARRATION_TRACK = "Narração";

const EPS = 1e-6;

/**
 * The "Narração" track free over every one of `ranges` (timeline seconds): an existing one that
 * is not locked and has nothing there, or a new one when none is free. Takes recorded one after
 * another go on the same track, and never over each other.
 */
export function narrationTrack(
  project: Pick<Project, "tracks" | "clips">,
  ranges: readonly [number, number][],
): { track: Track; created: boolean } {
  const free = (track: Track): boolean =>
    !track.locked &&
    !project.clips.some(
      (c) =>
        c.trackId === track.id &&
        ranges.some(([a, b]) => c.start < b - EPS && clipEnd(c) > a + EPS),
    );
  const existing = project.tracks.find(
    (t) => t.kind === "audio" && t.name === NARRATION_TRACK && free(t),
  );
  if (existing) return { track: existing, created: false };
  return {
    track: {
      id: newId("t"),
      name: NARRATION_TRACK,
      kind: "audio",
      muted: false,
      hidden: false,
      locked: false,
    },
    created: true,
  };
}

export function insertNarration(
  project: Project,
  projectId: string,
  asset: Asset,
  start: number,
  end: number,
): Project {
  if (project.id !== projectId) throw new Error("O projeto da narração foi fechado.");
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    !Number.isFinite(asset.duration) ||
    asset.duration <= 0 ||
    !asset.hasAudio
  )
    throw new Error("Intervalo ou áudio inválido.");
  const duration = Math.min(asset.duration, end - start);
  const { track, created } = narrationTrack(project, [[start, start + duration]]);
  const clip = { ...makeClip(asset, track.id, start), duration };
  return {
    ...project,
    assets: [...project.assets, asset],
    tracks: created ? [...project.tracks, track] : project.tracks,
    clips: [...project.clips, clip],
  };
}
