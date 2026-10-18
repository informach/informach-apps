import { z } from "zod";
import { jsonIn, type RunOneShot } from "./captionTranslate.ts";
import type { PublishInfo } from "./types.ts";

/**
 * What goes up to the Sistema Zero platform with the video, by hand: `<aula>.plataforma.json`
 * beside the exported MP4, with the video id of the script, the title, description and summary,
 * the chapters (only when they are valid), the quiz, the thumbnail, the caption files and the
 * SHA-256 of the video, so the person fills the platform's form from one file and the platform
 * can tell the file is the one exported.
 */

export const PACKAGE_FORMAT = "ediaula-plataforma";
export const PACKAGE_VERSION = 1;
export const PACKAGE_SUFFIX = ".plataforma.json";

/** Chapters: at least this many, each this long, the first at 0:00. */
export const CHAPTER_MIN = 3;
export const CHAPTER_SECONDS = 10;

export type Chapter = NonNullable<PublishInfo["chapters"]>[number];

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Whether the chapters are valid as they are (not sorted for them): the first at 0:00, at least
 * CHAPTER_MIN, in order and each CHAPTER_SECONDS or longer (the last one until the end of the
 * video). The problems are in words for the person.
 */
export function validateChapters(
  chapters: readonly Chapter[],
  duration: number,
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (!chapters.length) return { ok: false, problems: ["não há capítulos"] };
  if (chapters[0].time > 0.5)
    problems.push(`o primeiro começa em ${clock(chapters[0].time)} e não em 0:00`);
  if (chapters.length < CHAPTER_MIN)
    problems.push(`são ${chapters.length}, o mínimo é ${CHAPTER_MIN}`);
  for (let i = 1; i < chapters.length; i++)
    if (chapters[i].time <= chapters[i - 1].time) {
      problems.push(`"${chapters[i].title}" vem antes do capítulo anterior`);
      break;
    }
  const short = chapters.filter(
    (c, i) => (chapters[i + 1]?.time ?? duration) - c.time < CHAPTER_SECONDS,
  );
  if (short.length)
    problems.push(
      short.length === 1
        ? `"${short[0].title}" tem menos de ${CHAPTER_SECONDS} s`
        : `${short.length} capítulos têm menos de ${CHAPTER_SECONDS} s`,
    );
  if (chapters.some((c) => !c.title.trim())) problems.push("um capítulo está sem título");
  return { ok: !problems.length, problems };
}

/* ----- Quiz ----- */

/** A question with four options, one right, made from a line of the lesson. */
export interface QuizItem {
  question: string;
  options: string[];
  /** Index of the right option. */
  correct: number;
  /** The line it was made from: its number and its words. */
  line: number;
  source: string;
}

/** A line the quiz can be made from (a script line in the lesson, or a paragraph said). */
export interface QuizLine {
  /** 1 for the first line. */
  n: number;
  speaker?: string;
  text: string;
}

const normal = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** What is wrong with a question, or null: four distinct options, one right, a line that exists. */
export function quizProblem(item: QuizItem, lines: readonly QuizLine[]): string | null {
  if (!item.question.trim()) return "a pergunta está vazia";
  if (item.options.length !== 4) return `tem ${item.options.length} alternativas, e não 4`;
  const seen = new Set(item.options.map(normal));
  if (seen.size !== 4 || seen.has("")) return "as alternativas se repetem ou estão vazias";
  if (!Number.isInteger(item.correct) || item.correct < 0 || item.correct > 3)
    return "não diz qual alternativa é a certa";
  const line = lines.find((l) => l.n === item.line);
  if (!line) return `a fala ${item.line} não existe`;
  if (normal(line.text) !== normal(item.source)) return `não cita a fala ${item.line} como ela é`;
  return null;
}

export function quizPrompt(lines: readonly QuizLine[], count: number): string {
  return [
    `Write ${count} multiple-choice questions in Brazilian Portuguese to check what children aged 9 to 14 understood of this lesson.`,
    'Each question comes from one line below: say which one in "line" (its number). Exactly 4 options, short and all different, only one right ("correct" is its index, 0 to 3); the wrong ones are plausible, never silly; nothing outside what the lesson says.',
    'Answer with JSON only, no other text: {"questions":[{"question":"...","options":["...","...","...","..."],"correct":0,"line":1}]}',
    "",
    ...lines.map((l) => `${l.n}. ${l.speaker ? `${l.speaker}: ` : ""}${l.text}`),
  ].join("\n");
}

const quizAnswer = z.object({
  questions: z.array(
    z.object({
      question: z.string().max(500),
      options: z.array(z.string().max(200)),
      correct: z.int(),
      line: z.int(),
    }),
  ),
});

/**
 * The quiz of the lesson from its lines, by the engine the person set up; the answer is checked
 * (quizProblem) and asked again once with the problems when a question does not pass.
 */
export async function generateQuiz(
  lines: readonly QuizLine[],
  run: RunOneShot,
  count = 5,
): Promise<QuizItem[]> {
  if (!lines.length) throw new Error("A aula ainda não tem falas para fazer o quiz.");
  let prompt = quizPrompt(lines, count);
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await run(prompt);
    let raw: unknown;
    try {
      raw = jsonIn(answer);
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
      prompt = `${quizPrompt(lines, count)}\n\nYour previous answer was refused: ${last}`;
      continue;
    }
    const parsed = quizAnswer.safeParse(raw);
    if (!parsed.success) {
      last = "O JSON não tem o formato pedido.";
      prompt = `${quizPrompt(lines, count)}\n\nYour previous answer was refused: the JSON is not in the shape asked.`;
      continue;
    }
    const items: QuizItem[] = parsed.data.questions.map((q) => ({
      question: q.question.trim(),
      options: q.options.map((o) => o.trim()),
      correct: q.correct,
      line: q.line,
      source: lines.find((l) => l.n === q.line)?.text ?? "",
    }));
    const problems = items.flatMap((q, i) => {
      const p = quizProblem(q, lines);
      return p ? [`pergunta ${i + 1}: ${p}`] : [];
    });
    if (!problems.length && items.length) return items;
    last = problems.join("; ") || "nenhuma pergunta veio";
    prompt = `${quizPrompt(lines, count)}\n\nYour previous answer was refused: ${last}. Answer again following every rule.`;
  }
  throw new Error(`O quiz não passou na conferência: ${last}`);
}

/* ----- The package ----- */

export interface PackageThumbnail {
  /** Timeline second of the frame. */
  time: number;
  title?: string;
}

/** What the export knows before the video exists (the main process adds the file facts). */
export interface PlatformInput {
  videoId?: string;
  title?: string;
  description?: string;
  summary?: string;
  chapters?: Chapter[];
  quiz?: QuizItem[];
  thumbnail?: PackageThumbnail;
  course?: string;
  lesson: string;
}

export interface PlatformPackage {
  format: typeof PACKAGE_FORMAT;
  version: typeof PACKAGE_VERSION;
  createdAt: string;
  course?: string;
  lesson: string;
  videoId?: string;
  title?: string;
  description?: string;
  summary?: string;
  chapters: { time: number; clock: string; title: string }[];
  /** Why the chapters were left out, when they were. */
  chapterProblems?: string[];
  quiz: { question: string; options: string[]; correct: number; line: number }[];
  thumbnail?: { file: string; time: number; title?: string };
  captions: { lang: string; srt?: string; vtt?: string }[];
  video: { file: string; sha256: string; seconds: number; width: number; height: number };
}

/** The package for one exported video: names of the files beside it and the video's facts. */
export function buildPlatformPackage(
  input: PlatformInput,
  facts: {
    video: string;
    sha256: string;
    seconds: number;
    width: number;
    height: number;
    /** The thumbnail beside the video and the second of the lesson it shows. */
    thumbnail?: { file: string; time: number };
    captions: { lang: string; srt?: string; vtt?: string }[];
    now: Date;
  },
): PlatformPackage {
  const chapters = input.chapters ?? [];
  const valid = validateChapters(chapters, facts.seconds);
  const quiz = (input.quiz ?? []).map(({ question, options, correct, line }) => ({
    question,
    options,
    correct,
    line,
  }));
  return {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    createdAt: facts.now.toISOString(),
    ...(input.course ? { course: input.course } : {}),
    lesson: input.lesson,
    ...(input.videoId ? { videoId: input.videoId } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    chapters: valid.ok
      ? chapters.map((c) => ({ time: Math.round(c.time), clock: clock(c.time), title: c.title }))
      : [],
    ...(valid.ok || !chapters.length ? {} : { chapterProblems: valid.problems }),
    quiz,
    ...(facts.thumbnail
      ? {
          thumbnail: {
            file: facts.thumbnail.file,
            time: Math.round(facts.thumbnail.time * 100) / 100,
            ...(input.thumbnail?.title ? { title: input.thumbnail.title } : {}),
          },
        }
      : {}),
    captions: facts.captions,
    video: {
      file: facts.video,
      sha256: facts.sha256,
      seconds: Math.round(facts.seconds * 100) / 100,
      width: facts.width,
      height: facts.height,
    },
  };
}
