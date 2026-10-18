import { choosePiece, LOW_CONFIDENCE, type PieceMatch } from "./audioSync.ts";
import type { Project, VoiceMaster, VoiceMasterPiece } from "./types.ts";
import {
  type HeygenPlacement,
  heygenPlacements,
  masterIsStale,
  masterPieces,
  pieceMediaExist,
} from "./voiceMaster.ts";

/**
 * How a HeyGen MP4 that comes back is placed (lib/voice.ts runs it with main/heygen.ts finding
 * the sound): it is compared with every voice file sent to HeyGen and still on disk, and goes
 * where the winning file's source map says that voice is on the timeline now, which follows
 * every cut made before or after the export. The voice as it is now is only used when no file
 * sent is left (or the media they were made from are gone). A voice edited after the export is
 * only mentioned; a doubtful match is never placed without the person checking it.
 */

/** A voice file the video may have been made from. */
export interface HeygenCandidate {
  piece: Pick<VoiceMasterPiece, "file" | "label" | "sourceMap">;
  /** The export it came from; absent for the voice as it is now. */
  master?: VoiceMaster;
}

/** The files of the masters that still exist, made from media still in the project. */
export function masterCandidates(
  project: Pick<Project, "assets" | "voiceMasters">,
  existing: ReadonlySet<string>,
): HeygenCandidate[] {
  return masterPieces(project.voiceMasters ?? [])
    .filter(({ piece }) => existing.has(piece.file) && pieceMediaExist(project, piece))
    .map(({ master, piece }) => ({ master, piece }));
}

export interface HeygenPlan {
  candidate: HeygenCandidate;
  match: PieceMatch;
  placements: HeygenPlacement[];
  /** The voice changed since that file went to HeyGen (the placement follows it anyway). */
  stale: boolean;
  /** Another file fits about as well and would put the video elsewhere. */
  ambiguous: boolean;
  /** Too unsure to place without the person checking it. */
  doubtful: boolean;
}

/** Two placements land the video at the same place (within a frame). */
const samePlace = (a: HeygenPlacement[], b: HeygenPlacement[]): boolean =>
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
export function planHeygenVideo(
  project: Pick<Project, "tracks" | "clips" | "assets">,
  candidates: readonly HeygenCandidate[],
  ranked: readonly PieceMatch[],
  duration: number,
): HeygenPlan | null {
  const placed = (m: PieceMatch): HeygenPlacement[] => {
    const c = candidates[m.piece];
    return c ? heygenPlacements(project, c.piece, m.result.offset, m.result.scale, duration) : [];
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
