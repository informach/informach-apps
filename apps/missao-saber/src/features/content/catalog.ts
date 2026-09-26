import "server-only";
import { combinatoricsLessons } from "./combinatorics";
import {
  commercialLessons,
  legacyReservedSpec,
  makeAssessmentBank,
  type SkillId,
} from "./commercial-curriculum";
import { financeLessons } from "./finance";
import { formatSamplesLesson } from "./format-samples";
import { geometryLessons } from "./geometry";
import { reasoningLessons } from "./reasoning";
import { packLessons, packMissionIds } from "./skill-factory";
import { skillPacks } from "./skills";
import { trackDefinitions } from "./tracks";
import { type Course, type Lesson, lessonSchema, type TrackDefinition } from "./types";

/* As doze habilidades de 6º/7º são congeladas: seus itens têm hash de revisão
   e não podem mudar. As habilidades das outras faixas entram por `skillPacks`,
   e as trilhas por `trackDefinitions`; este arquivo só junta as duas origens. */

const legacySkillNames: Record<SkillId, string> = {
  fracoes: "Frações e referência",
  porcentagem: "Porcentagem",
  precos: "Comparação de preços",
  orcamento: "Planejamento financeiro",
  medidas: "Área e perímetro",
  simetria: "Simetria e transformações",
  contagem: "Contagem organizada",
  gavetas: "Princípio das gavetas",
  probabilidade: "Probabilidade",
  paridade: "Paridade e restos",
  padroes: "Padrões e generalização",
  logica: "Lógica e argumentos",
};

const legacyProgression: Record<SkillId, string[]> = {
  fracoes: ["fracoes-1", "fracoes-formatos", "fracoes-2", "fracoes-3", "fracoes-4", "fracoes-5"],
  porcentagem: [
    "porcentagem-1",
    "porcentagem-2",
    "porcentagem-3",
    "porcentagem-4",
    "porcentagem-5",
  ],
  precos: ["precos-1", "precos-2", "precos-3", "precos-4", "precos-5"],
  orcamento: ["orcamento-1", "orcamento-2", "orcamento-3", "orcamento-4", "orcamento-5"],
  medidas: ["medidas-1", "medidas-2", "medidas-3", "medidas-4", "medidas-5"],
  simetria: ["simetria-1", "simetria-2", "simetria-3", "simetria-4", "simetria-5"],
  contagem: ["contagem-1", "contagem-2", "contagem-3", "contagem-4", "contagem-5"],
  gavetas: ["gavetas-1", "gavetas-2", "gavetas-3", "gavetas-4", "gavetas-5"],
  probabilidade: [
    "probabilidade-1",
    "probabilidade-2",
    "probabilidade-3",
    "probabilidade-4",
    "probabilidade-5",
  ],
  paridade: ["paridade-1", "paridade-2", "paridade-3", "paridade-4", "paridade-5"],
  padroes: ["padroes-1", "padroes-2", "padroes-3", "padroes-4", "padroes-5"],
  logica: ["logica-1", "logica-2", "logica-3", "logica-4", "logica-5"],
};

const packById = new Map(skillPacks.map((pack) => [pack.id, pack]));
for (const pack of skillPacks)
  if (pack.id in legacySkillNames || packById.get(pack.id) !== pack)
    throw new Error(`Duplicated skill id ${pack.id}`);

export const skillNames: Record<string, string> = {
  ...legacySkillNames,
  ...Object.fromEntries(skillPacks.map((pack) => [pack.id, pack.name])),
};

export const progressionBySkill: Record<string, string[]> = {
  ...legacyProgression,
  ...Object.fromEntries(skillPacks.map((pack) => [pack.id, packMissionIds(pack)])),
};

const legacyLessons = [
  ...financeLessons,
  ...geometryLessons,
  ...combinatoricsLessons,
  ...reasoningLessons,
  formatSamplesLesson,
  ...commercialLessons,
];
export const legacyLessonIds: ReadonlySet<string> = new Set(
  legacyLessons.map((lesson) => lesson.id),
);
const authoredLessons = [...legacyLessons, ...skillPacks.flatMap(packLessons)];
const authoredById = new Map(authoredLessons.map((lesson) => [lesson.id, lesson]));

/**
 * Domínio dos itens de 6º/7º, pela posição do item dentro da habilidade.
 * A regra está congelada com o catálogo revisado: mudar um domínio mudaria o
 * hash do item. Habilidades novas declaram o domínio no próprio pack.
 */
function legacyTeachingDomain(skillId: string, ordinal: number) {
  if (["fracoes", "medidas", "contagem", "probabilidade", "logica", "padroes"].includes(skillId))
    return "common" as const;
  if (skillId === "porcentagem") return ordinal < 30 ? ("common" as const) : ("olitef" as const);
  if (skillId === "precos" || skillId === "orcamento") return "olitef" as const;
  if (skillId === "simetria") return "canguru" as const;
  if (skillId === "gavetas") return "obmep" as const;
  if (skillId === "paridade") return ordinal < 14 ? ("common" as const) : ("obmep" as const);
  return "common" as const;
}

for (const [skillId, path] of Object.entries(progressionBySkill)) {
  for (const id of path) {
    const lesson = authoredById.get(id);
    if (!lesson || lesson.skillId !== skillId)
      throw new Error(`Invalid curriculum path ${skillId}: ${id}`);
  }
}

const skillItemOrdinals = new Map<string, number>();
export const lessons: Lesson[] = authoredLessons.map((lesson) => {
  const path = progressionBySkill[lesson.skillId] ?? [];
  const position = path.indexOf(lesson.id);
  const prerequisite = position > 0 ? path[position - 1] : undefined;
  const legacy = legacyLessonIds.has(lesson.id);
  const items = lesson.items.map((item) => {
    const ordinal = skillItemOrdinals.get(lesson.skillId) ?? 0;
    skillItemOrdinals.set(lesson.skillId, ordinal + 1);
    return legacy ? { ...item, domain: legacyTeachingDomain(lesson.skillId, ordinal) } : item;
  });
  const parsed = lessonSchema.safeParse({
    ...lesson,
    prerequisites: prerequisite ? [prerequisite] : [],
    items,
  });
  if (!parsed.success)
    throw new Error(`Invalid authored lesson ${lesson.id}: ${parsed.error.message}`);
  return parsed.data;
});

function layeredPath(skills: string[], maximumLayers = Number.POSITIVE_INFINITY) {
  const path: string[] = [];
  const largest = Math.min(
    maximumLayers,
    Math.max(...skills.map((skill) => progressionBySkill[skill]?.length ?? 0)),
  );
  for (let layer = 0; layer < largest; layer++)
    for (const skill of skills) {
      const lessonId = progressionBySkill[skill]?.[layer];
      if (lessonId) path.push(lessonId);
    }
  return path;
}

function course(definition: TrackDefinition): Course {
  const { maximumLayers, ...properties } = definition;
  for (const skill of definition.skills)
    if (!progressionBySkill[skill])
      throw new Error(`Track ${definition.id} references unknown skill ${skill}`);
  return { ...properties, path: layeredPath(definition.skills, maximumLayers) };
}

export const courses: Course[] = trackDefinitions.map(course);
if (new Set(courses.map((c) => c.id)).size !== courses.length)
  throw new Error("Duplicated track id");

/** Anos escolares com pelo menos uma trilha; os formulários só oferecem estes. */
export const catalogGrades: number[] = [...new Set(courses.flatMap((c) => c.grades))].sort(
  (a, b) => a - b,
);
export function coursesForGrade(grade: number) {
  return courses.filter((c) => c.grades.includes(grade));
}
/**
 * Para onde vai um perfil cuja trilha deixou de cobrir o ano escolar: a
 * trilha da mesma olimpíada para o ano novo; senão, qualquer trilha do ano;
 * senão nenhuma, e a trilha atual continua até a faixa ser publicada.
 */
export function successorCourse(current: Course, grade: number): Course | null {
  if (current.grades.includes(grade)) return current;
  return (
    courses.find((c) => c.olympiad === current.olympiad && c.grades.includes(grade)) ??
    courses.find((c) => c.grades.includes(grade)) ??
    null
  );
}

function resolveReserved(skillId: string, seed: number, variant: 0 | 1 | 2) {
  return (
    packById.get(skillId)?.reserved(seed, variant) ?? legacyReservedSpec(skillId, seed, variant)
  );
}

export const assessmentBanks: Lesson[] = courses.flatMap((currentCourse) =>
  (["diagnostic", "exam"] as const).map((mode) => {
    const bank = makeAssessmentBank(currentCourse, mode, resolveReserved);
    const parsed = lessonSchema.safeParse(bank);
    if (!parsed.success)
      throw new Error(`Invalid assessment bank ${bank.id}: ${parsed.error.message}`);
    return parsed.data;
  }),
);
export const contentUnits: Lesson[] = [...lessons, ...assessmentBanks];

export function findLesson(id: string) {
  return lessons.find((lesson) => lesson.id === id);
}
export function findContentUnit(id: string) {
  return contentUnits.find((lesson) => lesson.id === id);
}
export function findCourse(id: string) {
  return courses.find((currentCourse) => currentCourse.id === id);
}
export function courseLessons(currentCourse: Course) {
  return currentCourse.path
    .map((id) => findLesson(id))
    .filter((lesson): lesson is Lesson => !!lesson);
}
export function courseAssessmentBanks(currentCourse: Course) {
  return assessmentBanks.filter(
    (bank) =>
      bank.id === `bank:diagnostic:${currentCourse.id}` ||
      bank.id === `bank:exam:${currentCourse.id}`,
  );
}

export function assessment(
  currentCourse: Course,
  mode: "diagnostic" | "exam",
  unavailableLessonIds: ReadonlySet<string> = new Set(),
  seenFamilyIds: ReadonlySet<string> = new Set(),
): Lesson {
  const bank = assessmentBanks.find(
    (candidate) => candidate.id === `bank:${mode}:${currentCourse.id}`,
  );
  const available = bank && !unavailableLessonIds.has(bank.id) ? bank : undefined;
  const unseen = available?.items.filter((item) => !seenFamilyIds.has(item.familyId)).length ?? 0;
  const assessmentNovelty = unseen === 12 ? "fresh" : unseen === 0 ? "practice" : "mixed";
  const items = (available?.items ?? []).map((item) => ({
    ...item,
    source: { lessonId: available?.id ?? "", version: available?.version ?? 1 },
  }));
  return {
    id: `${mode}:${currentCourse.id}`,
    version: bank?.version ?? 1,
    title: mode === "diagnostic" ? "Seu ponto de partida" : "Simulado autoral de estratégias",
    skillId: "mixed",
    objective:
      mode === "diagnostic"
        ? "Identificar estratégias de entrada e próximos passos."
        : "Observar transferência para problemas reservados e conectar estratégias.",
    introduction:
      assessmentNovelty === "fresh"
        ? "Este percurso usa atividades autorais reservadas ainda não vistas neste perfil."
        : "Este percurso retoma atividades já expostas e será identificado como prática, sem simular uma nova medida independente.",
    lab: null,
    free: mode === "diagnostic",
    kind: "assessment",
    stage: "assessment",
    prerequisites: [],
    estimatedMinutes: mode === "diagnostic" ? 18 : 35,
    assessmentNovelty,
    items,
  } satisfies Lesson;
}

export type ContentIdentity = Pick<Lesson, "id" | "version">;

export function assessmentSources(lesson: Lesson): ContentIdentity[] {
  if (
    lesson.kind === "assessment-bank" ||
    (lesson.kind !== "assessment" && lesson.skillId !== "mixed")
  )
    return [{ id: lesson.id, version: lesson.version }];
  const identities = new Map(
    lesson.items.flatMap((item) =>
      item.source ? [[item.source.lessonId, item.source.version] as const] : [],
    ),
  );
  if (identities.size) return [...identities].map(([id, version]) => ({ id, version }));
  const itemIds = new Set(lesson.items.map((item) => item.id));
  const matchedSources = contentUnits
    .filter(
      (source) => source.id !== lesson.id && source.items.some((item) => itemIds.has(item.id)),
    )
    .map(({ id, version }) => ({
      id,
      version: id === `bank:${lesson.id}` ? lesson.version : version,
    }));
  if (matchedSources.length) return matchedSources;
  return [{ id: lesson.id, version: lesson.version }];
}

export function assessmentHasAllSkills(currentCourse: Course, lesson: Lesson) {
  const represented = new Set(lesson.items.map((item) => item.skillId));
  return (
    lesson.items.length === 12 && currentCourse.skills.every((skill) => represented.has(skill))
  );
}
