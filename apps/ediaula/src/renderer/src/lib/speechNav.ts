import { audibleClips, timelineSilences, timelineWords } from "@shared/cleanup";
import { buildSnapIndex, type SnapIndex, sentenceStarts, stepTo } from "@shared/snap";
import type { Project } from "@shared/types";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { loadProjectTranscripts } from "./transcripts";

/**
 * Moving by speech (Alt+arrows: word by word; Alt+Shift+arrows: sentence by sentence and from
 * silence to silence), through the magnet's own index (shared/snap.ts): the words, sentences and
 * silences of what is heard, made once per state of the lesson.
 */

let cached: { project: Project; index: Promise<SnapIndex> } | null = null;

function indexOf(project: Project): Promise<SnapIndex> {
  if (cached?.project === project) return cached.index;
  const index = loadProjectTranscripts(project).then((transcripts) => {
    const heard = { ...project, clips: audibleClips(project) };
    const words = timelineWords(heard, transcripts).filter((w) => !w.silent);
    return buildSnapIndex({
      clips: [],
      words,
      silences: timelineSilences(heard, transcripts),
      sentences: sentenceStarts(words),
    });
  });
  cached = { project, index };
  return index;
}

/** Goes to the next (or previous) word, or sentence and silence; tells when there is no speech. */
export async function speechStep(dir: 1 | -1, by: "word" | "sentence"): Promise<void> {
  const project = useProject.getState().project;
  if (!project) return;
  const index = await indexOf(project);
  if (index.times.length <= 1) {
    useApp.getState().toast("Transcreva a aula para andar por palavra, frase ou silêncio.", "info");
    return;
  }
  const t = usePlayback.getState().time;
  const to = stepTo(index, t, dir, by === "word" ? ["word"] : ["sentence", "silence"]);
  if (to !== null) {
    playback.pause();
    playback.seek(to);
  }
}
