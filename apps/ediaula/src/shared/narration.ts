import { makeClip, newId } from "./timeline.ts";
import type { Asset, Project } from "./types.ts";

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
  const track = {
    id: newId("t"),
    name: "Narração",
    kind: "audio" as const,
    muted: false,
    hidden: false,
    locked: false,
  };
  const clip = {
    ...makeClip(asset, track.id, start),
    duration: Math.min(asset.duration, end - start),
  };
  return {
    ...project,
    assets: [...project.assets, asset],
    tracks: [...project.tracks, track],
    clips: [...project.clips, clip],
  };
}
