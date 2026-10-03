import { describe, expect, it } from "vitest";
import { assessmentBanks, courses, lessons, recoveryLessons } from "@/features/content/catalog";
import { algebraConceptLinks } from "./algebra/concept-links";
import { eligibleExperiences, experiencesForItem, labCurriculum, labExperiences } from "./catalog";
import { elementaryConceptLinks } from "./elementary/concept-links";
import { loadTool } from "./modules";
import { reasoningConceptLinks } from "./reasoning/concept-links";

describe("laboratory curriculum sidecar", () => {
  it("covers every teaching item exactly once and never includes reserved items", () => {
    const mapped = labCurriculum.lessons.flatMap((lesson) => lesson.items.map((item) => item.id));
    const teaching = [...lessons, ...recoveryLessons].flatMap((lesson) =>
      lesson.items.map((item) => item.id),
    );
    expect(labCurriculum.lessons).toHaveLength(407);
    expect(new Set(labCurriculum.lessons.map((lesson) => lesson.skillId)).size).toBe(58);
    expect([...mapped].sort()).toEqual([...teaching].sort());
    expect(new Set(mapped).size).toBe(2972);
    expect(
      assessmentBanks.flatMap((lesson) => lesson.items).some((item) => mapped.includes(item.id)),
    ).toBe(false);
    for (const lesson of [...lessons, ...recoveryLessons])
      for (const item of lesson.items) {
        const experiences = experiencesForItem(lesson.id, item.id);
        expect(experiences.length, item.id).toBeGreaterThan(0);
        expect(
          experiences.every((experience) => experience.familyIds.includes(item.familyId)),
        ).toBe(true);
      }
  });
  it("uses exact course paths and grade pairs, including Canguru E's shorter path", () => {
    const entries = eligibleExperiences({
      grade: 5,
      courseId: "canguru-e",
      paid: true,
      profileAllowed: true,
    });
    expect(entries.some((entry) => entry.lessonId === "fracoes-5")).toBe(false);
    expect(entries.some((entry) => entry.lessonId === "fracoes-formatos")).toBe(true);
    expect(
      eligibleExperiences({ grade: 3, courseId: "canguru-e", paid: true, profileAllowed: true }),
    ).toEqual([]);
    for (const course of courses)
      for (const grade of course.grades) {
        const eligible = eligibleExperiences({
          grade,
          courseId: course.id,
          paid: true,
          profileAllowed: true,
        });
        expect(
          new Set(eligible.filter((entry) => !entry.recovery).map((entry) => entry.lessonId)),
        ).toEqual(new Set(course.path));
        expect(eligible.every((entry) => course.skills.includes(entry.skillId))).toBe(true);
      }
  });
  it("links concrete question concepts instead of assigning every item the mission's default tool", () => {
    const items = labCurriculum.lessons.flatMap((lesson) => lesson.items);
    const modesFor = (family: string) => [
      ...new Set(items.filter((item) => item.familyId === family).flatMap((item) => item.modes)),
    ];
    expect(modesFor("fracoes:learn:soma-com-denominador-comum")).toContain(
      "L02.operacoes-e-receitas",
    );
    expect(modesFor("fracoes:learn:escala-de-receita")).toContain("L03.parte-parte-e-todo");
    expect(modesFor("fracoes:inverso")).toContain("L02.recuperar-inteiro");
    expect(modesFor("fracoes:learn:divisao-em-partes")).toContain("L02.dividir-por-fracao");
    const families = new Set(items.map((item) => item.familyId));
    const explicit = new Set(
      [elementaryConceptLinks, algebraConceptLinks, reasoningConceptLinks].flatMap((links) =>
        Object.keys(links),
      ),
    );
    for (const family of families) {
      const reflection =
        /:learn:(metodo-organizado|argumentacao-[123]|verificacao-de-solucao|comparacao-de-metodos)$/.test(
          family,
        );
      expect(
        explicit.has(family) || reflection,
        `Concrete family requires a reviewed representation: ${family}`,
      ).toBe(true);
    }
    for (const links of [elementaryConceptLinks, algebraConceptLinks, reasoningConceptLinks])
      for (const family of Object.keys(links)) expect(families.has(family), family).toBe(true);
  });
  it("validates both variants at every exact school year where each mode is offered", async () => {
    const checked = new Set<string>();
    for (const course of courses)
      for (const grade of course.grades) {
        const entries = eligibleExperiences({
          grade,
          courseId: course.id,
          paid: true,
          profileAllowed: true,
        });
        for (const entry of entries) {
          const key = `${entry.family}.${entry.mode}:${grade}`;
          if (checked.has(key)) continue;
          checked.add(key);
          const tool = await loadTool(entry.family);
          for (const variant of [0, 1] as const) {
            const launch = { family: entry.family, mode: entry.mode, grade, variant };
            const activity = tool.activity(launch);
            expect(() => tool.parse(launch, activity.initialState), key).not.toThrow();
            expect(activity.rubric.length, key).toBeGreaterThan(0);
            expect(tool.summarize(launch, activity.initialState).length, key).toBeGreaterThan(10);
          }
        }
      }
  });
  it("enforces publication, plan and active-profile restrictions", () => {
    const input = { grade: 6, courseId: "canguru-e", paid: true, profileAllowed: true };
    const entries = eligibleExperiences({
      ...input,
      contentStates: new Map([["fracoes-1", { status: "suspended" }]]),
    });
    expect(entries.some((entry) => entry.lessonId === "fracoes-1")).toBe(false);
    const free = new Set(
      [...lessons, ...recoveryLessons].filter((lesson) => lesson.free).map((lesson) => lesson.id),
    );
    for (const entry of eligibleExperiences({ ...input, paid: false }))
      expect(free.has(entry.lessonId)).toBe(true);
    for (const entry of eligibleExperiences({ ...input, profileAllowed: false }))
      expect(free.has(entry.lessonId)).toBe(true);
  });
  it("every declared mode has a valid authored investigation and a different transfer", async () => {
    for (const entry of labExperiences) {
      const tool = await loadTool(entry.family);
      expect(tool.modes, entry.id).toContain(entry.mode);
      const first = { family: entry.family, mode: entry.mode, grade: 6, variant: 0 as const };
      const next = { ...first, variant: 1 as const };
      const activity = tool.activity(first);
      const transfer = tool.activity(next);
      expect(activity.prompt.length, entry.id).toBeGreaterThan(15);
      expect(() => tool.parse(first, activity.initialState), entry.id).not.toThrow();
      expect(() => tool.parse(next, transfer.initialState), entry.id).not.toThrow();
      expect({ prompt: transfer.prompt, state: transfer.initialState }, entry.id).not.toEqual({
        prompt: activity.prompt,
        state: activity.initialState,
      });
    }
  });
});
