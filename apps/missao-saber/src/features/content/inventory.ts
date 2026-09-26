import "server-only";
import {
  assessmentBanks,
  courseLessons,
  courses,
  legacyLessonIds,
  lessons,
  progressionBySkill,
} from "./catalog";
import { authoringLots } from "./lotes";
import { skillPacks } from "./skills";
import { trackWaves } from "./tracks";
import { legacyTracks } from "./tracks/legacy";
import type { Item, Lesson } from "./types";

const legacyCourseIds = new Set(legacyTracks.map((track) => track.id));
const bankCourseId = (bank: Lesson) => bank.id.replace(/^bank:(diagnostic|exam):/, "");
const isLegacyBank = (bank: Lesson) => legacyCourseIds.has(bankCourseId(bank));
const itemsOf = (units: Lesson[]) => units.flatMap((unit) => unit.items);

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
  return (
    prompt
      .toLocaleLowerCase("pt-BR")
      .replace(/r\$\s*[\d.,]+/g, "<valor>")
      // O sinal pode ser o hífen ou o menos tipográfico usado nos itens.
      .replace(/[−-]?\d+(?:[.,]\d+)?/g, "<n>")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Números do enunciado e da resposta, para achar a mesma conta com outra redação. */
function numericKey(item: Item) {
  const numbers = (text: string) =>
    (text.replace(/^Questão \d+\.\s*/, "").match(/[−-]?\d+(?:[.,]\d+)?/g) ?? [])
      .map((value) => value.replace("−", "-").replace(",", "."))
      .sort()
      .join("|");
  const answer =
    item.type === "numeric"
      ? String(item.grading.value)
      : item.type === "choice"
        ? numbers(item.answer)
        : "";
  return `${item.skillId}#${numbers(item.prompt)}#${answer}`;
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
  /* Ordem de autoria: os seis lotes de 6º/7º cobriram missões e depois os
     bancos das quatro trilhas; o que veio depois segue a ordem do registro de
     habilidades, e o banco de cada trilha nova entra logo depois da última
     habilidade que ela usa, para que cada onda feche em faixa contígua. Os
     lotes são faixas contíguas nessa ordem, não na ordem de carga. */
  const packOrder = new Map(skillPacks.map((pack, index) => [pack.id, index]));
  const packLessonUnits = lessons.filter((lesson) => !legacyLessonIds.has(lesson.id));
  const anchorOf = (bank: Lesson) => {
    const wave = trackWaves.find((tracks) =>
      tracks.some((track) => track.id === bankCourseId(bank)),
    );
    const skills = (wave ?? []).flatMap((track) => track.skills);
    return Math.max(-1, ...skills.map((skill) => packOrder.get(skill) ?? -1));
  };
  const newBankUnits = assessmentBanks
    .filter((bank) => !isLegacyBank(bank))
    .map((bank, index) => ({ bank, anchor: anchorOf(bank), index }))
    .sort((a, b) => a.anchor - b.anchor || a.index - b.index);
  const wavedUnits: Lesson[] = [];
  for (const [index, pack] of skillPacks.entries()) {
    wavedUnits.push(...packLessonUnits.filter((lesson) => lesson.skillId === pack.id));
    wavedUnits.push(
      ...newBankUnits.filter((unit) => unit.anchor === index).map((unit) => unit.bank),
    );
  }
  const authoringOrder = [
    ...itemsOf(lessons.filter((lesson) => legacyLessonIds.has(lesson.id))),
    ...itemsOf(assessmentBanks.filter(isLegacyBank)),
    ...itemsOf(wavedUnits),
  ];
  const indexById = new Map(authoringOrder.map((item, index) => [item.id, index]));
  const lotRanges = authoringLots.map((lot) => ({
    lot,
    start: indexById.get(lot.firstItemId) ?? -1,
    end: indexById.get(lot.lastItemId) ?? -1,
  }));
  const lotCoverage = new Array<number>(authoringOrder.length).fill(0);
  for (const { start, end } of lotRanges)
    if (start >= 0 && end >= start)
      for (let i = start; i <= end; i++) lotCoverage[i] = (lotCoverage[i] ?? 0) + 1;
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
    lots: lotRanges.map(({ lot, start, end }) => ({
      number: lot.number,
      firstItemId: lot.firstItemId,
      lastItemId: lot.lastItemId,
      items: start >= 0 && end >= start ? end - start + 1 : 0,
    })),
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
      /* Questão reservada com os mesmos números e a mesma resposta de uma atividade
         de ensino da habilidade: seria prática disfarçada de avaliação. Os bancos das
         quatro trilhas de 6º/7º estão congelados e ficam fora da conferência. */
      reservedNumericTwins: (() => {
        const teachingKeys = new Set(teachingItems.map(numericKey));
        return assessmentBanks
          .filter((bank) => !isLegacyBank(bank))
          .flatMap((bank) => bank.items)
          .filter(
            (item) =>
              numericKey(item).split("#")[1]?.includes("|") && teachingKeys.has(numericKey(item)),
          )
          .map((item) => item.id);
      })(),
      duplicateFamiliesWithinBanks: assessmentBanks
        .filter(
          (bank) => new Set(bank.items.map((item) => item.familyId)).size !== bank.items.length,
        )
        .map((bank) => bank.id),
      itemsOutsideLots: authoringOrder
        .filter((_, index) => lotCoverage[index] === 0)
        .map((item) => item.id),
      itemsInSeveralLots: authoringOrder.filter((_, index) => (lotCoverage[index] ?? 0) > 1).length,
      unresolvedLots: lotRanges
        .filter(({ start, end }) => start < 0 || end < start)
        .map(({ lot }) => lot.number),
    },
  };
}

export const inventory = catalogInventory();
