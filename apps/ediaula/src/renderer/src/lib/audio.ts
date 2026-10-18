import { duckingOf, speechSpans } from "@shared/audio";
import { captionWords } from "@shared/captions";
import type { Project } from "@shared/types";
import { useEffect, useState } from "react";
import { loadProjectTranscripts } from "./transcripts";

/**
 * Moments someone speaks on the timeline: the words heard (the same ones the captions use, each
 * once), whole clips when there is no transcript; with the project's ramp and hold.
 */
export async function projectSpeech(p: Project): Promise<[number, number][]> {
  const transcripts = await loadProjectTranscripts(p);
  const { ramp, hold } = duckingOf(p);
  return speechSpans(p, captionWords(p, transcripts), new Set(transcripts.keys()), ramp, hold);
}

/** Speech spans, only computed when the project has a music track. */
export function useSpeechSpans(project: Project | null): [number, number][] {
  const [spans, setSpans] = useState<[number, number][]>([]);
  const hasMusic = !!project?.tracks.some((t) => t.music);
  useEffect(() => {
    let alive = true;
    if (!project || !hasMusic) return setSpans([]);
    void projectSpeech(project).then((s) => alive && setSpans(s));
    return () => {
      alive = false;
    };
  }, [project, hasMusic]);
  return spans;
}
