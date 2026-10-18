import { clipEnd, sourceEnd, timelineAt } from "./clipTime.ts";
import type { Clip, Project } from "./types.ts";

/**
 * "Continuar da etapa k": the take recorded from step k carries on the take that stopped there.
 * Both follow the same narration, so the new take's second 0 is a second of the narration
 * (`-narrationOffset` of the new take), and that second falls at a known second of the earlier
 * take's video (its own narrationOffset after it). The earlier take is cut there, on every track
 * it has (screen, narration), and the new take goes right at the cut: the narration goes on
 * without a jump. When something else follows the earlier take on its tracks, the cut is only
 * proposed and the new take goes where takes go.
 */

export interface ResumeJoin {
  /** Timeline second where the new take starts. */
  at: number;
  /** Clips of the earlier take and how long they become (0: removed). */
  trims: { clipId: string; duration: number }[];
  /** Nothing else follows the earlier take on its tracks: the cut can be made right away. */
  clear: boolean;
  /** The stretch of the timeline the cut takes away. */
  cut: [number, number];
}

const EPS = 1e-6;

/**
 * Where the take from step k joins the earlier one. `earlier` is the take's id
 * (Asset.recording.id), `screen` its screen media, and the narrationOffsets those of the two
 * guided-run.json files. Null when the earlier take's video does not reach that second on the
 * timeline (it was cut or moved away).
 */
export function resumeJoin(
  project: Pick<Project, "clips" | "assets">,
  earlier: { take: string; screen: string; narrationOffset: number },
  nextNarrationOffset: number,
): ResumeJoin | null {
  // The narration second where the new take starts, in seconds of the earlier take's video.
  const source = earlier.narrationOffset - nextNarrationOffset;
  const screenClip = project.clips.find(
    (c) => c.assetId === earlier.screen && c.in <= source + EPS && sourceEnd(c) > source + EPS,
  );
  if (!screenClip) return null;
  const at = timelineAt(screenClip, source);
  const takeAssets = new Set(
    project.assets.filter((a) => a.recording?.id === earlier.take).map((a) => a.id),
  );
  takeAssets.add(earlier.screen);
  const ofTake = project.clips.filter((c) => takeAssets.has(c.assetId));
  const trims = ofTake.flatMap((c): ResumeJoin["trims"] => {
    if (clipEnd(c) <= at + EPS) return [];
    return [{ clipId: c.id, duration: Math.max(0, at - c.start) }];
  });
  const end = Math.max(at, ...ofTake.map(clipEnd));
  const tracks = new Set(ofTake.map((c) => c.trackId));
  const clear = !project.clips.some(
    (c: Clip) => !takeAssets.has(c.assetId) && tracks.has(c.trackId) && clipEnd(c) > at + EPS,
  );
  return { at, trims, clear, cut: [at, end] };
}

/** The project with the earlier take cut where the new one joins. */
export function applyResumeJoin<P extends Pick<Project, "clips">>(project: P, join: ResumeJoin): P {
  const trims = new Map(join.trims.map((t) => [t.clipId, t.duration]));
  return {
    ...project,
    clips: project.clips.flatMap((c) => {
      const duration = trims.get(c.id);
      if (duration === undefined) return [c];
      return duration > EPS ? [{ ...c, duration }] : [];
    }),
  };
}
