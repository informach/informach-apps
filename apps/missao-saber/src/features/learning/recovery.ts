import type { Lesson } from "../content/types";
import { type Evidence, localDay, reviewDateAfter } from "./engine";

/** Release the second set only after all three first-set attempts and a local day change. */
export function recoveryRelease(
  lesson: Lesson,
  evidence: Evidence[],
  now: Date,
): { ready: boolean; on: string | null } {
  if (lesson.kind !== "recovery" || !lesson.id.endsWith("-recuperacao-2"))
    return { ready: true, on: null };
  const prefix = `${lesson.skillId}-recuperacao-1-`;
  const firstDates = [1, 2, 3].map(
    (index) =>
      evidence
        .filter((row) => row.itemId === `${prefix}${index}`)
        .map((row) => localDay(row.createdAt))
        .sort()[0],
  );
  if (firstDates.some((date) => !date)) return { ready: false, on: null };
  const on = reviewDateAfter(
    firstDates
      .filter((date): date is string => !!date)
      .sort()
      .at(-1) ?? localDay(now),
    1,
  );
  return { ready: localDay(now) >= on, on };
}

export function releasedPractice(lessons: Lesson[], evidence: Evidence[], now: Date) {
  return lessons.filter((lesson) => recoveryRelease(lesson, evidence, now).ready);
}
