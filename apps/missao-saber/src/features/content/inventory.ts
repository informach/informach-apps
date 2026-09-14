import "server-only";
import { assessmentBanks, courseLessons, courses, lessons, progressionBySkill } from "./catalog";
import type { Item } from "./types";

function countBy<T>(values: T[], key: (value: T) => string) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const group = key(value);
    counts[group] = (counts[group] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function solutionSignature(item: Item) {
  switch (item.type) {
    case "choice":
      return { type: item.type, answer: item.answer, options: [...item.options].sort() };
    case "numeric":
      return { type: item.type, grading: item.grading };
    case "ordering":
      return { type: item.type, steps: item.steps, grading: item.grading };
    case "justification":
      return { type: item.type, rubric: item.rubric, sampleResponse: item.sampleResponse };
  }
}

function semanticShape(prompt: string) {
  return prompt
    .toLocaleLowerCase("pt-BR")
    .replace(/r\$\s*[\d.,]+/g, "<valor>")
    .replace(/-?\d+(?:[.,]\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}

export function catalogInventory() {
  const teachingItems = lessons.flatMap((lesson) => lesson.items);
  const reservedItems = assessmentBanks.flatMap((bank) => bank.items);
  const allItems = [...teachingItems, ...reservedItems];
  const signatures = allItems.map((item) =>
    JSON.stringify({ prompt: item.prompt, solution: solutionSignature(item) }),
  );
  const signatureItems = new Map<string, string[]>();
  for (const [index, signature] of signatures.entries())
    signatureItems.set(signature, [
      ...(signatureItems.get(signature) ?? []),
      allItems[index]?.id ?? "",
    ]);
  const duplicateSignatures = signatures.filter(
    (signature, index) => signatures.indexOf(signature) !== index,
  );
  const teachingFamilies = new Set(teachingItems.map((item) => item.familyId));
  const assessmentFamilies = new Set(reservedItems.map((item) => item.familyId));
  const familyShapes = new Map<string, Set<string>>();
  const shapeFamilies = new Map<string, Set<string>>();
  for (const item of reservedItems) {
    const shape = semanticShape(item.prompt);
    familyShapes.set(item.familyId, new Set([...(familyShapes.get(item.familyId) ?? []), shape]));
    shapeFamilies.set(shape, new Set([...(shapeFamilies.get(shape) ?? []), item.familyId]));
  }
  const teachingShapes = new Set(teachingItems.map((item) => semanticShape(item.prompt)));
  return {
    totals: {
      missions: lessons.length,
      assessmentBanks: assessmentBanks.length,
      teachingItems: teachingItems.length,
      reservedItems: reservedItems.length,
      uniqueItemIds: new Set(allItems.map((item) => item.id)).size,
      distinctActivitySignatures: new Set(signatures).size,
      justificationItems: allItems.filter((item) => item.type === "justification").length,
      teachingFamilies: teachingFamilies.size,
      assessmentFamilies: assessmentFamilies.size,
    },
    byDomain: countBy(allItems, (item) => item.domain),
    byFormat: countBy(allItems, (item) => item.type),
    byPurpose: countBy(allItems, (item) => item.purpose),
    bySkill: countBy(allItems, (item) => item.skillId),
    courses: Object.fromEntries(
      courses.map((course) => [
        course.id,
        {
          label: course.label,
          grades: course.grades,
          skills: course.skills,
          missions: courseLessons(course).length,
          diagnosticItems:
            assessmentBanks.find((bank) => bank.id === `bank:diagnostic:${course.id}`)?.items
              .length ?? 0,
          examItems:
            assessmentBanks.find((bank) => bank.id === `bank:exam:${course.id}`)?.items.length ?? 0,
        },
      ]),
    ),
    lots: Array.from({ length: 6 }, (_, index) => {
      const start = index * Math.ceil(allItems.length / 6);
      const end = Math.min(allItems.length, (index + 1) * Math.ceil(allItems.length / 6));
      return {
        number: index + 1,
        firstItemId: allItems[start]?.id ?? null,
        lastItemId: allItems[end - 1]?.id ?? null,
        items: Math.max(0, end - start),
      };
    }),
    integrity: {
      duplicateItemIds: allItems.length - new Set(allItems.map((item) => item.id)).size,
      duplicateActivitySignatures: duplicateSignatures.length,
      duplicateActivityGroups: [...signatureItems.values()].filter((ids) => ids.length > 1),
      familyOverlap: [...assessmentFamilies].filter((family) => teachingFamilies.has(family)),
      unresolvedCoursePaths: courses.flatMap((course) =>
        course.path.filter((id) => !lessons.some((lesson) => lesson.id === id)),
      ),
      unresolvedPrerequisites: lessons.flatMap((lesson) =>
        lesson.prerequisites.filter((id) => !lessons.some((candidate) => candidate.id === id)),
      ),
      skillsWithoutProgression: Object.keys(progressionBySkill).filter(
        (skill) => !(progressionBySkill[skill]?.length ?? 0),
      ),
      nonAssessmentItemsInReservedBanks: reservedItems.filter(
        (item) => item.purpose !== "assessment",
      ).length,
      assessmentItemsExposedInMissions: teachingItems.filter(
        (item) => item.purpose === "assessment",
      ).length,
      reservedFamilyShapeConflicts: [...familyShapes.entries()]
        .filter(([, shapes]) => shapes.size > 1)
        .map(([family]) => family),
      reservedStructuralAliases: [...shapeFamilies.entries()]
        .filter(([, families]) => families.size > 1)
        .map(([shape, families]) => ({ shape, families: [...families].sort() })),
      trainingAssessmentStructuralOverlap: [...shapeFamilies.keys()].filter((shape) =>
        teachingShapes.has(shape),
      ),
      duplicateFamiliesWithinBanks: assessmentBanks
        .filter(
          (bank) => new Set(bank.items.map((item) => item.familyId)).size !== bank.items.length,
        )
        .map((bank) => bank.id),
    },
  };
}

export const inventory = catalogInventory();
