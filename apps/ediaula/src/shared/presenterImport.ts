import { choosePiece, LOW_CONFIDENCE, type PieceMatch } from "./audioSync.ts";
import type { Project, VoiceMaster, VoiceMasterPiece } from "./types.ts";
import {
  masterIsStale,
  masterPieces,
  type PresenterPlacement,
  pieceMediaExist,
  presenterPlacements,
} from "./voiceMaster.ts";

/**
 * How a presenter's video that comes back is placed (lib/voice.ts runs it with
 * main/presenterVideo.ts finding the sound): it is compared with every voice file exported and
 * still on disk, and goes where the winning file's source map says that voice is on the timeline
 * now, which follows every cut made before or after the export. The voice as it is now is only used
 * when no file sent is left (or the media they were made from are gone). A voice edited after the
 * export is only mentioned; a doubtful match is never placed without the person checking it.
 */

/** A voice file the video may have been made from. */
export interface PresenterCandidate {
  piece: Pick<VoiceMasterPiece, "file" | "label" | "sourceMap">;
  /** The export it came from; absent for the voice as it is now. */
  master?: VoiceMaster;
}

/** The files of the masters that still exist, made from media still in the project. */
export function masterCandidates(
  project: Pick<Project, "assets" | "voiceMasters">,
  existing: ReadonlySet<string>,
): PresenterCandidate[] {
  return masterPieces(project.voiceMasters ?? [])
    .filter(({ piece }) => existing.has(piece.file) && pieceMediaExist(project, piece))
    .map(({ master, piece }) => ({ master, piece }));
}

export interface PresenterPlan {
  candidate: PresenterCandidate;
  match: PieceMatch;
  placements: PresenterPlacement[];
  /** The voice changed since that file was exported (the placement follows it anyway). */
  stale: boolean;
  /** Another file fits about as well and would put the video elsewhere. */
  ambiguous: boolean;
  /** Too unsure to place without the person checking it. */
  doubtful: boolean;
}

/** Two placements land the video at the same place (within a frame). */
const samePlace = (a: PresenterPlacement[], b: PresenterPlacement[]): boolean =>
  a.length === b.length &&
  a.every(
    (p, i) =>
      Math.abs(p.start - b[i].start) < 1 / 30 && Math.abs(p.duration - b[i].duration) < 1 / 30,
  );

/**
 * The plan for one video, from the pieces ranked by their sound (indexes into `candidates`).
 * Two files that are the same voice (exported twice) put the video at the same place: that is
 * not a doubt. Null when nothing was compared.
 */
export function planPresenterVideo(
  project: Pick<Project, "tracks" | "clips" | "assets">,
  candidates: readonly PresenterCandidate[],
  ranked: readonly PieceMatch[],
  duration: number,
): PresenterPlan | null {
  const placed = (m: PieceMatch): PresenterPlacement[] => {
    const c = candidates[m.piece];
    return c
      ? presenterPlacements(project, c.piece, m.result.offset, m.result.scale, duration)
      : [];
  };
  const chosen = choosePiece(ranked, (a, b) => samePlace(placed(a), placed(b)));
  if (!chosen) return null;
  const candidate = candidates[chosen.piece];
  if (!candidate) return null;
  const placements = placed(chosen);
  return {
    candidate,
    match: { piece: chosen.piece, result: chosen.result },
    placements,
    stale: candidate.master ? masterIsStale(project, candidate.master) : false,
    ambiguous: chosen.ambiguous,
    doubtful:
      chosen.result.confidence < LOW_CONFIDENCE || chosen.ambiguous || placements.length === 0,
  };
}
