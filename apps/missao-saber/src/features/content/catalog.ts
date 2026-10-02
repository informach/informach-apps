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
import { buildRecoveryLessons } from "./recovery";
import { packLessons, packMissionIds } from "./skill-factory";
import { skillPacks } from "./skills";
import { trackDefinitions } from "./tracks";
import {
  type Course,
  type Lesson,
  lessonSchema,
  type Olympiad,
  type TrackDefinition,
} from "./types";

/* As doze habilidades de 6º/7º têm versões e hashes de revisão; correções
   publicam uma nova versão e preservam os snapshots das sessões anteriores.
   Outras faixas entram por `skillPacks` e trilhas por `trackDefinitions`. */

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
/** A Mirim é a porta de entrada da OBMEP: quem sai dela segue para a OBMEP. */
const LINHA: Record<Olympiad, Olympiad> = {
  mirim: "obmep",
  obmep: "obmep",
  canguru: "canguru",
  olitef: "olitef",
};
const PREFERENCIA: Olympiad[] = ["obmep", "canguru", "olitef"];
export function courseLine(c: Pick<Course, "olympiad">): Olympiad {
  return LINHA[c.olympiad];
}
const primeiroAno = (c: Course) => Math.min(...c.grades);
const preferencia = (c: Course) => PREFERENCIA.indexOf(courseLine(c));

/** Para vitrines e listas: do ano mais novo ao mais velho; no mesmo ano, OBMEP, Canguru e OLITEF. */
export const catalogCourses: Course[] = [...courses].sort(
  (a, b) => primeiroAno(a) - primeiroAno(b) || preferencia(a) - preferencia(b),
);

/** Ordem de sugestão para formulários: OBMEP (com a Mirim), Canguru e OLITEF. */
export const suggestedCourses: Course[] = [...courses].sort(
  (a, b) => preferencia(a) - preferencia(b) || primeiroAno(a) - primeiroAno(b),
);

/** Trilhas do ano, na ordem de sugestão: a primeira é o padrão de um perfil novo. */
export function coursesForGrade(grade: number) {
  return suggestedCourses.filter((c) => c.grades.includes(grade));
}
/**
 * Para onde vai um perfil cuja trilha deixou de cobrir o ano escolar: a
 * trilha da mesma linha para o ano novo (Mirim segue para OBMEP); senão, a
 * sugerida para o ano; senão nenhuma, e a trilha atual continua até a faixa
 * ser publicada.
 */
export function successorCourse(current: Course, grade: number): Course | null {
  if (current.grades.includes(grade)) return current;
  const doAno = coursesForGrade(grade);
  return doAno.find((c) => courseLine(c) === courseLine(current)) ?? doAno[0] ?? null;
}

/** A trilha que vale para o perfil hoje, já considerando a virada de ano. */
export function resolvedCourse(profile: { courseId: string; grade: number }): Course | null {
  const stored = findCourse(profile.courseId);
  if (!stored) return null;
  return successorCourse(stored, profile.grade) ?? stored;
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
export const recoveryLessons = buildRecoveryLessons(skillNames, lessons);
export const contentUnits: Lesson[] = [...lessons, ...assessmentBanks, ...recoveryLessons];

export function findLesson(id: string) {
  return (
    lessons.find((lesson) => lesson.id === id) ?? recoveryLessons.find((lesson) => lesson.id === id)
  );
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
/** Recovery supplements the path; it does not change course completion. */
export function coursePracticeLessons(currentCourse: Course) {
  return [
    ...courseLessons(currentCourse),
    ...recoveryLessons.filter((lesson) => currentCourse.skills.includes(lesson.skillId)),
  ];
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
    title: mode === "diagnostic" ? "Seu ponto de partida" : "Simulado de estratégias",
    skillId: "mixed",
    objective:
      mode === "diagnostic"
        ? "Descobrir por onde começar e quais são os próximos passos."
        : "Usar as estratégias da trilha em problemas novos.",
    introduction:
      assessmentNovelty === "fresh"
        ? "Estas questões são novas para você."
        : "Você já viu estas questões antes, então este percurso conta como prática.",
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
