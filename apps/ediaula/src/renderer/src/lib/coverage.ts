import { timelineWords } from "@shared/cleanup";
import {
  recordedStretches,
  type ScreenCoverage,
  screenCoverage,
  scriptGuide,
} from "@shared/screenCues";
import type { Project } from "@shared/types";
import { voiceClips, voiceSpan } from "@shared/voiceMaster";
import { useMemo } from "react";
import { scriptDoc } from "./script";
import { useTranscripts } from "./transcripts";

/**
 * How much of the lesson's voice already has a recorded screen, line by line of the script (when
 * the voice is transcribed): the "Etapas" panel and "Enviar para a edição" read it. Null without
 * a voice.
 */
export function useScreenCoverage(project: Project | null): ScreenCoverage | null {
  const transcripts = useTranscripts(project);
  return useMemo(() => {
    const range = project ? voiceSpan(project) : null;
    if (!project || !range) return null;
    const ids = new Set(voiceClips(project).map((c) => c.id));
    const words = timelineWords(project, transcripts).filter((w) => ids.has(w.clipId));
    const doc = scriptDoc(project);
    const places = doc ? scriptGuide(doc, words).places : [];
    return screenCoverage(places, recordedStretches(project), range[0], range[1]);
  }, [project, transcripts]);
}
