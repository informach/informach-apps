import { buildCues, captionWords, cueLayout } from "@shared/captions";
import {
  type CaptionTranslation,
  type SourceCue,
  staleCues,
  translateCues,
  translatedCues,
} from "@shared/captionTranslate";
import { paragraphs, timelineWords } from "@shared/cleanup";
import {
  generateQuiz,
  type PlatformInput,
  type QuizItem,
  type QuizLine,
} from "@shared/platformPackage";
import { LINE_MISSING } from "@shared/retake";
import { speechItems } from "@shared/script";
import { newId } from "@shared/timeline";
import type { Project } from "@shared/types";
import type { TextCue } from "@shared/webvtt";
import { useApp } from "@/state/app";
import { type Commit, personCommit, useProject } from "@/state/project";
import { currentView, scriptDoc } from "./script";
import { loadProjectTranscripts } from "./transcripts";

/**
 * What goes to the course platform with the video, in the editor: the captions as the
 * export makes them (and their translations), the quiz made from the lesson's lines, the
 * thumbnail and the facts of the platform package (shared/platformPackage.ts). The AI engine is
 * the one the person set up (window.api.aiOneShot); every answer is checked before it is kept.
 */

/** The lesson's captions as the export writes the .srt: only what is heard, each word once. */
export async function lessonCues(project: Project): Promise<SourceCue[]> {
  const transcripts = await loadProjectTranscripts(project);
  if (!transcripts.size) return [];
  const words = captionWords(project, transcripts);
  return buildCues(words, 42, 2, cueLayout(project)).flatMap((cue) =>
    cue.key
      ? [
          {
            key: cue.key,
            start: cue.start,
            end: cue.end,
            text: cue.lines.map((line) => line.map((w) => w.text).join(" ")).join("\n"),
          },
        ]
      : [],
  );
}

/** One prompt to the engine set up, as a job the status bar shows (and job:cancel stops). */
function oneShot(label: string, signal?: AbortSignal): (prompt: string) => Promise<string> {
  return async (prompt) => {
    const { startJob, endJob } = useApp.getState();
    const jobId = newId("job");
    const stop = (): void => {
      void window.api.cancelJob(jobId);
    };
    signal?.throwIfAborted();
    signal?.addEventListener("abort", stop, { once: true });
    startJob(jobId, label);
    try {
      return await window.api.aiOneShot(jobId, prompt);
    } finally {
      signal?.removeEventListener("abort", stop);
      endJob(jobId);
    }
  };
}

/**
 * Translates the captions of the open lesson into `lang` and keeps the translation in it
 * (Project.captionTranslations), replacing an earlier one of the same language. Refused when the
 * lesson changed while translating (the captions translated are no longer the lesson's).
 */
export async function translateLesson(
  lang: string,
  opts: {
    commit?: Commit;
    signal?: AbortSignal;
    progress?: (done: number, total: number) => void;
  } = {},
): Promise<{ count: number; lang: string }> {
  const start = useProject.getState().project;
  if (!start) throw new Error("Nenhuma aula aberta.");
  const cues = await lessonCues(start);
  if (!cues.length)
    throw new Error("A aula ainda não tem legendas: transcreva a narração primeiro.");
  const done = await translateCues(
    cues,
    lang,
    oneShot(`Traduzindo as legendas (${lang})`, opts.signal),
    {
      signal: opts.signal,
      onBatch: opts.progress,
    },
  );
  const translation: CaptionTranslation = { lang, createdAt: Date.now(), cues: done };
  // Another lesson open by now: nothing is kept, and the caller is told.
  if (useProject.getState().project?.id !== start.id)
    throw new Error("A aula aberta mudou enquanto as legendas eram traduzidas: nada foi guardado.");
  const ok = (opts.commit ?? personCommit)((p) => ({
    ...p,
    captionTranslations: [
      ...(p.captionTranslations ?? []).filter((t) => t.lang !== lang),
      translation,
    ],
  }));
  if (!ok) throw new Error("A aula aberta mudou enquanto as legendas eram traduzidas.");
  return { count: done.length, lang };
}

/** The translations of the lesson that are up to date, as the export writes them. */
export async function exportTranslations(
  project: Project,
): Promise<{ lang: string; cues: TextCue[] }[]> {
  if (!project.captionTranslations?.length) return [];
  const cues = await lessonCues(project);
  return project.captionTranslations.flatMap((t) => {
    const out = translatedCues(cues, t);
    return out ? [{ lang: t.lang, cues: out }] : [];
  });
}

/** Each translation of the lesson and how many of its captions are out of date. */
export async function translationState(
  project: Project,
): Promise<{ lang: string; stale: number; total: number; createdAt: number }[]> {
  if (!project.captionTranslations?.length) return [];
  const cues = await lessonCues(project);
  return project.captionTranslations.map((t) => ({
    lang: t.lang,
    stale: staleCues(cues, t),
    total: cues.length,
    createdAt: t.createdAt,
  }));
}

/**
 * The lines the quiz is made from: the script lines that are in the lesson (all of them while
 * the lesson is not transcribed), numbered as the script's speech lines; without a script, the
 * paragraphs said, in order.
 */
export async function quizLines(project: Project): Promise<QuizLine[]> {
  const view = await currentView(project);
  if (view) {
    const share = new Map(
      view.alignment.lines.map((l) => [l.item, l.matched / Math.max(1, l.total)]),
    );
    return speechItems(view.section).flatMap((it, i) => {
      const s = share.get(view.section.items.indexOf(it)) ?? 0;
      return view.words.length && s < LINE_MISSING
        ? []
        : [{ n: i + 1, speaker: it.speaker, text: it.text }];
    });
  }
  const transcripts = await loadProjectTranscripts(project);
  const words = timelineWords(project, transcripts).filter((w) => !w.silent);
  return paragraphs(words).map((para, i) => ({
    n: i + 1,
    text: para.map((w) => w.text).join(" "),
  }));
}

/** Makes the quiz of the open lesson and keeps it in its publishing data (replacing the old). */
export async function makeQuiz(
  count: number,
  opts: { commit?: Commit; signal?: AbortSignal } = {},
): Promise<QuizItem[]> {
  const start = useProject.getState().project;
  if (!start) throw new Error("Nenhuma aula aberta.");
  const lines = await quizLines(start);
  const quiz = await generateQuiz(lines, oneShot("Fazendo o quiz da aula", opts.signal), count);
  if (useProject.getState().project?.id !== start.id)
    throw new Error("A aula aberta mudou enquanto o quiz era feito: nada foi guardado.");
  const ok = (opts.commit ?? personCommit)((p) => ({ ...p, publish: { ...p.publish, quiz } }));
  if (!ok) throw new Error("A aula aberta mudou enquanto o quiz era feito.");
  return quiz;
}

/** Where a question's line ends in the lesson (to put the question template after it). */
export async function quizItemTime(project: Project, item: QuizItem): Promise<number | undefined> {
  const view = await currentView(project);
  if (view) {
    const it = speechItems(view.section)[item.line - 1];
    const line = it && view.alignment.lines.find((l) => l.item === view.section.items.indexOf(it));
    return line?.end !== undefined ? line.end + 0.5 : undefined;
  }
  const transcripts = await loadProjectTranscripts(project);
  const para = paragraphs(timelineWords(project, transcripts).filter((w) => !w.silent))[
    item.line - 1
  ];
  return para ? para[para.length - 1].end + 0.5 : undefined;
}

/** The platform package's facts from the lesson (the export adds the files and the hash). */
export function platformInput(project: Project): PlatformInput {
  const doc = scriptDoc(project);
  const section = doc?.sections[project.script?.section ?? 0];
  const publish = project.publish ?? {};
  const videoId = publish.videoId ?? section?.videoId;
  return {
    lesson: project.name,
    ...(project.course ? { course: project.course } : {}),
    ...(videoId ? { videoId } : {}),
    ...(publish.title
      ? { title: publish.title }
      : section?.videoTitle
        ? { title: section.videoTitle }
        : {}),
    ...(publish.description ? { description: publish.description } : {}),
    ...(publish.summary ? { summary: publish.summary } : {}),
    ...(publish.chapters?.length ? { chapters: publish.chapters } : {}),
    ...(publish.quiz?.length ? { quiz: publish.quiz } : {}),
    ...(publish.thumbnail ? { thumbnail: publish.thumbnail } : {}),
  };
}

/** Whether the lesson has anything for the platform beyond the video itself. */
export const hasPlatformData = (project: Project): boolean => {
  const i = platformInput(project);
  return !!(i.videoId || i.title || i.description || i.summary || i.chapters || i.quiz);
};
