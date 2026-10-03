import { expect, it } from "vitest";
import { courseLessons, findCourse } from "@/features/content/catalog";
import { eligibleExperiences } from "./catalog";
import { recommendLabs } from "./recommendation";

it("follows the next unfinished mission instead of repeatedly recommending its skill's first lesson", () => {
  const course = findCourse("canguru-e");
  if (!course) throw new Error("Missing course fixture");
  const experiences = eligibleExperiences({
    grade: 6,
    courseId: course.id,
    paid: true,
    profileAllowed: true,
    contentStates: new Map(),
  });
  const lessons = courseLessons(course);
  const first = lessons[0];
  const next = lessons[1];
  if (!first || !next) throw new Error("Missing lessons");
  const result = recommendLabs({
    experiences,
    lessons,
    attemptedItemIds: first.items.map((item) => item.id),
  });
  expect(experiences.find((entry) => entry.id === result.primaryId)?.lessonId).toBe(next.id);
  expect(result.alternativeIds.length).toBeLessThanOrEqual(3);
  expect(new Set([result.primaryId, ...result.alternativeIds]).size).toBe(
    result.alternativeIds.length + 1,
  );
});

it("prefers an eligible paused mission and never recommends an excluded lesson", () => {
  const course = findCourse("canguru-e");
  if (!course) throw new Error("Missing course fixture");
  const experiences = eligibleExperiences({
    grade: 6,
    courseId: course.id,
    paid: false,
    profileAllowed: true,
    contentStates: new Map(),
  });
  const lessons = courseLessons(course);
  const available = experiences.at(-1);
  if (!available) throw new Error("Missing experience");
  const result = recommendLabs({
    experiences,
    lessons,
    attemptedItemIds: [],
    pausedLessonId: available.lessonId,
  });
  expect(experiences.find((entry) => entry.id === result.primaryId)?.lessonId).toBe(
    available.lessonId,
  );
  const excluded = recommendLabs({
    experiences,
    lessons,
    attemptedItemIds: [],
    pausedLessonId: "fracoes-5",
  });
  expect(experiences.find((entry) => entry.id === excluded.primaryId)?.lessonId).not.toBe(
    "fracoes-5",
  );
});
