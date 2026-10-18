import { foldText, scriptTerms } from "@shared/glossary";
import { parseScript } from "@shared/script";
import type { Project } from "@shared/types";
import { useEffect, useMemo } from "react";
import { create } from "zustand";

/**
 * The course glossaries (kept by the main process, main/glossary.ts) as the renderer knows them,
 * and the terms that correct a project's transcripts on reading: the glossary of its course and
 * the names its script spells out.
 */

const courseKey = (course: string | undefined): string => (course ?? "").trim().toLowerCase();

export const useGlossaries = create<{ byCourse: Record<string, string[]> }>(() => ({
  byCourse: {},
}));

const loading = new Map<string, Promise<string[]>>();
/** Saves on their way: a reader waits for them, so a transcription started right away sees them. */
const saving = new Map<string, Promise<string[]>>();

/** The glossary of a course, read once and then kept up to date by saveGlossary(). */
export function courseGlossary(course = ""): Promise<string[]> {
  const key = courseKey(course);
  const writing = saving.get(key);
  if (writing) return writing;
  const known = useGlossaries.getState().byCourse[key];
  if (known) return Promise.resolve(known);
  let pending = loading.get(key);
  if (!pending) {
    pending = window.api
      .getGlossary(course)
      .then((terms) => {
        useGlossaries.setState((s) => ({ byCourse: { ...s.byCourse, [key]: terms } }));
        return terms;
      })
      .finally(() => loading.delete(key));
    loading.set(key, pending);
  }
  return pending;
}

/** Saves a course glossary; every open transcript is corrected again with it. */
export function saveGlossary(course: string, terms: string[]): Promise<string[]> {
  const key = courseKey(course);
  // One save after the other; an earlier failure already went to whoever made that save.
  const earlier = saving.get(key);
  const settled = earlier
    ? earlier.then(
        () => undefined,
        () => undefined,
      )
    : Promise.resolve();
  const write = settled
    .then(() => window.api.setGlossary(course, terms))
    .then(() => window.api.getGlossary(course))
    .then((saved) => {
      useGlossaries.setState((s) => ({ byCourse: { ...s.byCourse, [key]: saved } }));
      return saved;
    })
    .finally(() => {
      if (saving.get(key) === write) saving.delete(key);
    });
  saving.set(key, write);
  return write;
}

/** Adds one term to a course glossary (nothing changes when it is already there). */
export async function addToGlossary(course: string, term: string): Promise<void> {
  const current = await courseGlossary(course);
  if (current.some((t) => foldText(t) === foldText(term))) return;
  await saveGlossary(course, [...current, term]);
}

let scriptCache: { text: string; terms: string[] } | null = null;
const termsOfScript = (text: string | undefined): string[] => {
  if (!text) return [];
  if (scriptCache?.text !== text) scriptCache = { text, terms: scriptTerms(parseScript(text)) };
  return scriptCache.terms;
};

/** Glossary first (the course's own spelling wins), then the names of the script. */
export function correctionTerms(glossary: string[], scriptText: string | undefined): string[] {
  const seen = new Set(glossary.map(foldText));
  return [...glossary, ...termsOfScript(scriptText).filter((t) => !seen.has(foldText(t)))];
}

/** The correction terms of a project, for code that reads its transcripts once. */
export async function projectCorrectionTerms(p: Project): Promise<string[]> {
  return correctionTerms(await courseGlossary(p.course ?? ""), p.script?.text);
}

const NONE: string[] = [];

/** The saved glossary of a course (empty until read). */
export function useCourseGlossary(course: string): string[] {
  const glossary = useGlossaries((s) => s.byCourse[courseKey(course)]);
  useEffect(() => {
    courseGlossary(course).catch((err: unknown) =>
      console.warn("[glossary] could not read the course glossary:", err),
    );
  }, [course]);
  return glossary ?? NONE;
}

/** The correction terms of the open project, updated when its glossary or script changes. */
export function useCorrectionTerms(project: Project | null): string[] {
  const glossary = useCourseGlossary(project?.course ?? "");
  const scriptText = project?.script?.text;
  return useMemo(() => correctionTerms(glossary, scriptText), [glossary, scriptText]);
}
