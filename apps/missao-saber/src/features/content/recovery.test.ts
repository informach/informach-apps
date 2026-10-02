import { expect, it } from "vitest";
import {
  type Evidence,
  gradeAnswer,
  independenceProgress,
  numericSolution,
  skillStates,
} from "../learning/engine";
import { recommend } from "../learning/recommendation";
import { recoveryRelease } from "../learning/recovery";
import {
  courseLessons,
  coursePracticeLessons,
  courses,
  findLesson,
  lessons,
  recoveryLessons,
  skillNames,
} from "./catalog";
import type { Lesson } from "./types";

function attempts(lesson: Lesson, date: string, correct = true): Evidence[] {
  return lesson.items.map((item) => ({
    itemId: item.id,
    skillId: item.skillId,
    familyId: item.familyId,
    correct,
    helpCount: 0,
    createdAt: new Date(date),
    mode: "review",
    sessionId: lesson.id,
  }));
}

it("supports genuine recovery for every skill with fresh first attempts across three families and two days", () => {
  expect(recoveryLessons).toHaveLength(116);
  const teachingFamilies = new Set(
    lessons.flatMap((lesson) => lesson.items.map((item) => item.familyId)),
  );
  expect(
    recoveryLessons
      .flatMap((lesson) => lesson.items)
      .filter((item) => !teachingFamilies.has(item.familyId))
      .map((item) => item.familyId),
  ).toEqual([]);
  for (const skill of Object.keys(skillNames)) {
    const first = findLesson(`${skill}-recuperacao-1`);
    const second = findLesson(`${skill}-recuperacao-2`);
    if (!first || !second) throw new Error(`Missing recovery ${skill}`);
    const a = attempts(first, "2026-10-01T20:00:00Z");
    const b = attempts(second, "2026-10-02T11:00:00Z");
    expect(new Set(first.items.map((i) => i.familyId)).size, skill).toBe(3);
    expect(second.items.map((i) => i.familyId)).toEqual(first.items.map((i) => i.familyId));
    expect(first.items.map((i) => i.prompt)).not.toEqual(second.items.map((i) => i.prompt));
    expect(skillStates(a)[0]?.level).toBe("building");
    expect(skillStates([...a, ...b])[0]?.level, skill).toBe("independent");
    expect(independenceProgress([...a, ...b], skill)).toEqual({
      families: 3,
      days: 2,
      missingFamilies: 0,
      missingDays: 0,
    });
    const failed = attempts(first, "2026-09-29T20:00:00Z", false);
    expect(skillStates([...failed, ...a])[0]?.independentFamilies).toBe(0);
    expect(skillStates([...failed, ...a, ...b])[0]?.level).toBe("building");
    expect(recoveryRelease(second, a, new Date("2026-10-02T02:00:00Z"))).toEqual({
      ready: false,
      on: "2026-10-02",
    });
    expect(recoveryRelease(second, a, new Date("2026-10-02T11:00:00Z"))).toEqual({
      ready: true,
      on: "2026-10-02",
    });
    expect(recoveryRelease(second, a.slice(0, 2), new Date("2026-10-03T11:00:00Z"))).toEqual({
      ready: false,
      on: null,
    });
    for (const item of [...first.items, ...second.items]) {
      const correct =
        item.type === "numeric"
          ? String(item.grading.value)
          : item.type === "choice"
            ? item.answer
            : "";
      expect(gradeAnswer(item, correct), item.id).toMatchObject({ valid: true, correct: true });
      if (item.type === "numeric")
        expect(gradeAnswer(item, numericSolution(item)), item.id).toMatchObject({
          valid: true,
          correct: true,
        });
    }
  }
});

it("recommends recovery after regular material, preserves course completion and never counts replay as fresh", () => {
  for (const course of courses) {
    const regular = courseLessons(course);
    const all = coursePracticeLessons(course);
    const seen = new Set(regular.flatMap((l) => l.items.map((i) => i.id)));
    const next = recommend(all, [], [], new Date("2026-10-02T15:00:00Z"), seen);
    expect(next?.lesson.kind, course.id).toBe("recovery");
    expect(regular.map((l) => l.id)).toEqual(course.path);
    const exhausted = new Set(all.flatMap((l) => l.items.map((i) => i.id)));
    expect(recommend(all, [], [], new Date(), exhausted)).toBeNull();
  }
});

function answer(id: string) {
  const item = recoveryLessons.flatMap((l) => l.items).find((i) => i.id === id);
  if (item?.type !== "numeric") throw new Error(`Missing numeric ${id}`);
  return item.grading.value;
}

it("independently enumerates combinatorial, probability and recurrence answers", () => {
  const choose = (n: number, k: number): number =>
    k === 0 ? 1 : n < k ? 0 : choose(n - 1, k - 1) + choose(n - 1, k);
  expect(answer("combinacoes-recuperacao-1-1")).toBe(choose(12, 3));
  expect(answer("combinacoes-recuperacao-2-1")).toBe(choose(14, 4));
  const pairs = Array.from({ length: 36 }, (_, i) => [Math.floor(i / 6) + 1, (i % 6) + 1]);
  expect(answer("probabilidade-em-recuperacao-2-3")).toBe(
    pairs.filter(([a, b]) => (a ?? 0) + (b ?? 0) === 10).length / 36,
  );
  const multiples = Array.from({ length: 50 }, (_, i) => i + 1).filter(
    (n) => n % 4 === 0 || n % 6 === 0,
  );
  expect(answer("contagem-casos-recuperacao-2-2")).toBe(multiples.length);
  let a = 2;
  for (let i = 1; i < 4; i++) a = 3 * a - 1;
  expect(answer("recorrencias-recuperacao-1-3")).toBe(a);
  const divisors = Array.from({ length: 540 }, (_, i) => i + 1).filter((n) => 540 % n === 0);
  expect(answer("estruturas-numericas-recuperacao-2-1")).toBe(divisors.length);
  expect(answer("restos-recuperacao-1-3")).toBe(Number(7n ** 11n % 10n));
  expect(answer("restos-recuperacao-2-3")).toBe(Number(2n ** 10n % 7n));
});

it("checks inverse equations, geometry and dated financial cash flows independently", () => {
  const root = answer("equacoes-em-recuperacao-1-1");
  expect(root * root - 13 * root + 36).toBe(0);
  expect(root).toBeGreaterThan(13 - root);
  const k = answer("polinomios-recuperacao-2-1");
  expect((-2) ** 3 + k * -2 + 2).toBe(0);
  const d = answer("coordenadas-em-recuperacao-1-1");
  expect(d * d).toBe((8 + 4) ** 2 + (7 - 2) ** 2);
  const x = answer("trigonometria-recuperacao-1-2");
  expect(x * x).toBeCloseTo(5 ** 2 + 8 ** 2 - 2 * 5 * 8 * Math.cos(Math.PI / 3));
  const initial = answer("equivalencia-temporal-recuperacao-1-1");
  let future = initial;
  for (let i = 0; i < 3; i++) future *= 1.1;
  expect(future).toBeCloseTo(1331);
  expect(answer("equivalencia-temporal-recuperacao-1-2") * 1.1 ** 2).toBeCloseTo(220 * 1.1 + 242);
  expect((1 + answer("inflacao-recuperacao-1-2") / 100) * 1.1).toBeCloseTo(1.21);
  expect((1 + answer("inflacao-recuperacao-2-2") / 100) * 1.2).toBeCloseTo(1.08);
  expect(answer("juros-recuperacao-1-3") + 540).toBe(90 + 6 * 85);
  expect(answer("renda-fixa-recuperacao-2-2") - 900).toBe(120 * (1 - 0.2));
});
