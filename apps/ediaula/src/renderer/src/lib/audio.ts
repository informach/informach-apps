import { speechSpans } from "@shared/audio";
import { timelineWords } from "@shared/cleanup";
import type { Project } from "@shared/types";
import { useEffect, useState } from "react";
import { loadProjectTranscripts } from "./transcripts";

/** Moments someone speaks on the timeline, from the transcripts (whole clips when there is none). */
export async function projectSpeech(p: Project): Promise<[number, number][]> {
  const transcripts = await loadProjectTranscripts(p);
  return speechSpans(p, timelineWords(p, transcripts), new Set(transcripts.keys()));
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
