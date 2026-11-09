import { duckingOf, needsSpeech, speechSpans } from "@shared/audio";
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

/** Speech spans, only computed when something steps aside for the voice (needsSpeech). */
export function useSpeechSpans(project: Project | null): [number, number][] {
  const [spans, setSpans] = useState<[number, number][]>([]);
  const hasMusic = !!project && needsSpeech(project);
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
