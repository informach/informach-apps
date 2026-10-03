import type { LabExperience } from "./catalog";

export function recommendLabs({
  experiences,
  lessons,
  attemptedItemIds,
  pausedLessonId,
}: {
  experiences: LabExperience[];
  lessons: { id: string; items: { id: string }[] }[];
  attemptedItemIds: string[];
  pausedLessonId?: string;
}) {
  const available = new Set(experiences.map((entry) => entry.lessonId));
  const attempted = new Set(attemptedItemIds);
  const nextLesson =
    (pausedLessonId && available.has(pausedLessonId) ? pausedLessonId : undefined) ??
    lessons.find(
      (lesson) => available.has(lesson.id) && lesson.items.some((item) => !attempted.has(item.id)),
    )?.id;
  const primary =
    experiences.find((entry) => entry.lessonId === nextLesson) ??
    experiences.find((entry) => !entry.recovery) ??
    experiences[0];
  const modes = new Set(primary ? [`${primary.family}.${primary.mode}`] : []);
  const alternatives = [...experiences]
    .sort((a, b) => Number(b.skillId === primary?.skillId) - Number(a.skillId === primary?.skillId))
    .filter((entry) => {
      const key = `${entry.family}.${entry.mode}`;
      if (entry.recovery || modes.has(key)) return false;
      modes.add(key);
      return true;
    })
    .slice(0, 3);
  return { primaryId: primary?.id, alternativeIds: alternatives.map((entry) => entry.id) };
}
