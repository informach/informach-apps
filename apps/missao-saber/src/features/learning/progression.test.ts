import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { courseLessons, courses } from "../content/catalog";
import { CourseCompletion } from "./components/course-completion";
import { type Evidence, skillStates } from "./engine";
import { courseProgress, recommend } from "./recommendation";

it("does not restart any fully traversed course without a due review", () => {
  const now = new Date("2026-10-02T15:00:00Z");
  for (const course of courses) {
    const lessons = courseLessons(course);
    const ids = new Set(lessons.flatMap((lesson) => lesson.items.map((item) => item.id)));
    expect(recommend(lessons, [], [], now, ids), course.id).toBeNull();
    expect(courseProgress(lessons, ids)).toEqual({
      total: lessons.length,
      completed: lessons.length,
      finished: true,
    });
    const firstId = lessons[0]?.items[0]?.id;
    if (!firstId) throw new Error("Missing first item");
    ids.delete(firstId);
    expect(courseProgress(lessons, ids).finished).toBe(false);
  }
});

it("communicates completion separately from autonomy and offers valid next routes", () => {
  const html = renderToStaticMarkup(
    createElement(CourseCompletion, { nextReviewOn: "2026-10-04" }),
  );
  expect(html).toContain("Você percorreu toda a trilha!");
  expect(html).toContain("04/10/2026");
  expect(html).toContain("mais de um dia");
  expect(html).toContain('href="/revisao"');
  expect(html).toContain('href="/laboratorio"');
});

it("advances a review in the morning of its displayed local date", () => {
  const evidence: Evidence[] = [
    {
      itemId: "a",
      skillId: "fracoes",
      familyId: "partes",
      correct: true,
      helpCount: 0,
      createdAt: new Date("2026-09-30T23:00:00Z"),
      mode: "mission",
      sessionId: "a",
    },
    {
      itemId: "b",
      skillId: "fracoes",
      familyId: "partes",
      correct: true,
      helpCount: 0,
      createdAt: new Date("2026-10-01T11:00:00Z"),
      mode: "review",
      sessionId: "b",
    },
  ];
  expect(skillStates(evidence)[0]).toMatchObject({ dueOn: "2026-10-04" });
  // 02:30 UTC is still the previous day in São Paulo.
  const first = evidence[0];
  const second = evidence[1];
  if (!first || !second) throw new Error("Missing evidence fixture");
  const beforeMidnight = { ...second, createdAt: new Date("2026-10-01T02:30:00Z") };
  expect(skillStates([first, beforeMidnight])[0]).toMatchObject({ dueOn: "2026-10-01" });
});
