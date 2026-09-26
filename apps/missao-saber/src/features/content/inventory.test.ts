import { describe, expect, it } from "vitest";
import { homeSupport, homeSupportFor } from "./apoio-em-casa";
import { catalogReviewAudit } from "./authoring-review";
import {
  assessment,
  assessmentBanks,
  catalogGrades,
  contentUnits,
  courseLessons,
  courses,
  coursesForGrade,
  findLesson,
  legacyLessonIds,
  lessons,
  progressionBySkill,
  skillNames,
  successorCourse,
} from "./catalog";
import { deepChallengeFor, deepChallenges } from "./desafios-profundos";
import { inventory } from "./inventory";
import { skillPacks } from "./skills";
import { publicLesson } from "./types";

/*
 * Invariantes do catálogo: valem para qualquer quantidade de trilhas e nunca
 * mudam com a autoria. Os números (missões, itens, famílias, lotes) ficam no
 * snapshot ao lado, atualizado de propósito com `vitest -u` junto do registro
 * do lote de autoria.
 */
describe("catálogo: invariantes", () => {
  const allItems = contentUnits.flatMap((lesson) => lesson.items);

  it("não repete id, assinatura nem família entre ensino e avaliação", () => {
    expect(inventory.integrity).toEqual({
      duplicateItemIds: 0,
      duplicateActivitySignatures: 0,
      duplicateActivityGroups: [],
      familyOverlap: [],
      unresolvedCoursePaths: [],
      unresolvedPrerequisites: [],
      skillsWithoutProgression: [],
      nonAssessmentItemsInReservedBanks: 0,
      assessmentItemsExposedInMissions: 0,
      reservedFamilyShapeConflicts: [],
      reservedStructuralAliases: [],
      trainingAssessmentStructuralOverlap: [],
      reservedNumericTwins: [],
      duplicateFamiliesWithinBanks: [],
      itemsOutsideLots: [],
      itemsInSeveralLots: 0,
      unresolvedLots: [],
    });
  });

  it("mantém todo item revisado e nenhum sem revisão", () => {
    expect(catalogReviewAudit(contentUnits)).toEqual({
      reviewed: allItems.length,
      missing: [],
      changed: [],
      orphaned: [],
    });
  });

  it("entrega itens completos e nunca expõe gabarito no DTO público", () => {
    for (const lesson of contentUnits) {
      for (const item of lesson.items) {
        if (item.type === "choice") {
          expect(new Set(item.options).size).toBe(item.options.length);
          expect(item.options.filter((option) => option === item.answer)).toHaveLength(1);
        }
        expect(item.hints).toHaveLength(3);
        if (lesson.kind === "assessment-bank") expect(item.purpose).toBe("assessment");
        else expect(item.purpose).not.toBe("assessment");
      }
      const dto = publicLesson(lesson);
      expect(
        dto.items.every(
          (item) => !("answer" in item) && !("hints" in item) && !("explanation" in item),
        ),
      ).toBe(true);
    }
  });

  it("dá a cada trilha diagnóstico e simulado de 12 questões, disjuntos, no domínio da olimpíada", () => {
    for (const course of courses) {
      expect(courseLessons(course).map((lesson) => lesson.id)).toEqual(course.path);
      expect(courseLessons(course).length).toBeGreaterThan(20);
      expect(course.grades.length).toBeGreaterThan(0);
      for (const grade of course.grades) expect(grade).toBeGreaterThanOrEqual(2);
      for (const grade of course.grades) expect(grade).toBeLessThanOrEqual(12);
      // Toda trilha tem uma primeira unidade gratuita, como a página de venda promete.
      expect(courseLessons(course).some((lesson) => lesson.free)).toBe(true);
      const diagnostic = assessment(course, "diagnostic");
      const exam = assessment(course, "exam");
      expect(diagnostic.items).toHaveLength(12);
      expect(exam.items).toHaveLength(12);
      for (const item of [...diagnostic.items, ...exam.items]) {
        expect(item.purpose).toBe("assessment");
        expect(item.domain).toBe(course.olympiad);
      }
      expect(new Set(diagnostic.items.map((item) => item.id))).not.toEqual(
        new Set(exam.items.map((item) => item.id)),
      );
      expect(new Set(diagnostic.items.map((item) => item.skillId))).toEqual(new Set(course.skills));
      expect(diagnostic.assessmentNovelty).toBe("fresh");
      const seen = new Set(diagnostic.items.map((item) => item.familyId));
      expect(assessment(course, "diagnostic", new Set(), seen).assessmentNovelty).toBe("practice");
      expect(assessment(course, "exam", new Set(), seen).assessmentNovelty).toBe("practice");
    }
  });

  it("separa os intervalos de questões reservadas de cada trilha", () => {
    const ranges = courses.flatMap((course) => [
      { id: course.id, from: course.bankSeed, to: course.bankSeed + 11 },
      { id: course.id, from: course.bankSeed + 101, to: course.bankSeed + 112 },
    ]);
    for (const a of ranges)
      for (const b of ranges)
        if (a !== b) expect(a.to < b.from || b.to < a.from, `${a.id} × ${b.id}`).toBe(true);
  });

  it("mantém as questões reservadas distintas sem depender do número exibido", () => {
    const signatures = assessmentBanks.flatMap((bank) =>
      bank.items.map((item) =>
        JSON.stringify({
          prompt: item.prompt.replace(/^Questão \d+\.\s*/, ""),
          answer: item.type === "choice" ? item.answer : null,
          options: item.type === "choice" ? [...item.options].sort() : null,
        }),
      ),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("dá a toda habilidade nome, progressão linear, desafio profundo e apoio em casa", () => {
    for (const skillId of new Set(courses.flatMap((course) => course.skills))) {
      expect(skillNames[skillId], `sem nome para ${skillId}`).toBeTruthy();
      expect(progressionBySkill[skillId]?.length ?? 0).toBeGreaterThanOrEqual(5);
      const challenge = deepChallengeFor(skillId);
      expect(challenge, `sem desafio profundo para ${skillId}`).toBeDefined();
      expect(challenge?.skillId).toBe(skillId);
      expect(challenge?.steps).toHaveLength(3);
      expect(challenge?.rubric).toHaveLength(4);
      for (const criterio of challenge?.rubric ?? []) expect(criterio).toMatch(/\(0–\d\)$/);
      const support = homeSupportFor(skillId);
      expect(support, `sem apoio em casa para ${skillId}`).toBeDefined();
      expect(support).toHaveLength(2);
      for (const idea of support ?? []) expect(idea.length).toBeGreaterThan(40);
    }
    const titulos = Object.values(deepChallenges).map((challenge) => challenge.title);
    expect(new Set(titulos).size).toBe(titulos.length);
    for (const ideas of Object.values(homeSupport))
      for (const idea of ideas) expect(idea).not.toMatch(/\bapp\b|tela|celular|vídeo|site/i);
    for (const [skillId, path] of Object.entries(progressionBySkill)) {
      const visited = new Set<string>();
      for (const [position, lessonId] of path.entries()) {
        const lesson = findLesson(lessonId);
        expect(lesson?.skillId).toBe(skillId);
        expect(visited.has(lessonId)).toBe(false);
        expect(lesson?.prerequisites).toEqual(position ? [path[position - 1]] : []);
        visited.add(lessonId);
      }
    }
  });

  it("exige devolutiva autoral em toda alternativa errada das habilidades novas", () => {
    const genericas = [
      "Essa alternativa usa apenas parte dos dados.",
      "Essa alternativa troca a relação pedida por outra.",
    ];
    for (const lesson of lessons.filter((candidate) => !legacyLessonIds.has(candidate.id)))
      for (const item of lesson.items)
        if (item.type === "choice")
          for (const texto of Object.values(item.misconceptions))
            expect(
              genericas.some((g) => texto.startsWith(g)),
              `${item.id}`,
            ).toBe(false);
    for (const pack of skillPacks) {
      expect(pack.missions).toHaveLength(5);
      expect(pack.deepChallenge.skillId).toBe(pack.id);
    }
  });

  it("deriva os anos escolares oferecidos do próprio catálogo", () => {
    expect(catalogGrades).toEqual([...catalogGrades].sort((a, b) => a - b));
    for (const grade of catalogGrades) expect(coursesForGrade(grade).length).toBeGreaterThan(0);
    for (const course of courses)
      for (const grade of course.grades) expect(successorCourse(course, grade)).toBe(course);
  });
});

describe("catálogo: números", () => {
  it("publica o inventário conferido lote a lote", async () => {
    await expect(
      JSON.stringify(
        {
          totals: inventory.totals,
          byDomain: inventory.byDomain,
          byFormat: inventory.byFormat,
          byPurpose: inventory.byPurpose,
          bySkill: inventory.bySkill,
          courses: inventory.courses,
          lots: inventory.lots,
        },
        null,
        2,
      ),
    ).toMatchFileSnapshot("./__snapshots__/inventory.snapshot.json");
  });
});
