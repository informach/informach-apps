import { AGENDA_EXTRACURRICULAR_DAYS, type AgendaExtracurricularDay } from "@informach/db/schema";
import { parseLocalIso } from "@/features/dashboard/date";

export { AGENDA_EXTRACURRICULAR_DAYS, type AgendaExtracurricularDay };

// Ordem canônica (Seg→Dom). Diferente de `AGENDA_CLASS_DAYS` (Seg-Sex)
// porque extracurriculares rolam sábado e domingo (jazz, natação infantil
// de fim-de-semana, futebol de clube). Mantemos a constante separada pra
// não poluir o domínio escolar.
export const EXTRA_CLASS_DAY_VALUES: readonly AgendaExtracurricularDay[] =
  AGENDA_EXTRACURRICULAR_DAYS;

export const EXTRA_CLASS_DAY_LABEL_SHORT: Readonly<Record<AgendaExtracurricularDay, string>> = {
  mon: "Seg",
  tue: "Ter",
  wed: "Qua",
  thu: "Qui",
  fri: "Sex",
  sat: "Sáb",
  sun: "Dom",
};

export const EXTRA_CLASS_DAY_LABEL_FULL: Readonly<Record<AgendaExtracurricularDay, string>> = {
  mon: "Segunda-feira",
  tue: "Terça-feira",
  wed: "Quarta-feira",
  thu: "Quinta-feira",
  fri: "Sexta-feira",
  sat: "Sábado",
  sun: "Domingo",
};

// `Date.getDay()`: 0=Sun ... 6=Sat. Mapeamento completo (extra suporta Seg-Dom).
const JS_DAY_TO_EXTRA_ENUM: Readonly<Record<number, AgendaExtracurricularDay>> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

export function dayOfWeekToExtraClassDay(jsDay: number): AgendaExtracurricularDay {
  return JS_DAY_TO_EXTRA_ENUM[jsDay] ?? "mon";
}

// Pura — usada pelo today-subjects-service pra decidir se a matéria
// extracurricular tem aula hoje. Não há revezamento quinzenal v1, então é
// só lookup direto no array `classDays`.
export function isExtraSubjectActiveOnDate(
  targetIso: string,
  classDays: readonly AgendaExtracurricularDay[],
): boolean {
  if (classDays.length === 0) return false;
  const target = parseLocalIso(targetIso);
  const enumDay = dayOfWeekToExtraClassDay(target.getDay());
  return classDays.includes(enumDay);
}

// Normaliza array vindo do form/IA: dedup, descarta valores fora do enum,
// reordena pra ordem canônica Seg→Dom.
export function normalizeExtraClassDays(input: readonly string[]): AgendaExtracurricularDay[] {
  const set = new Set<string>(input);
  return EXTRA_CLASS_DAY_VALUES.filter((d) => set.has(d));
}

// Formato "Seg · Qua · Sáb" pra renderizar nos cards.
export function formatExtraClassDaysShort(days: readonly AgendaExtracurricularDay[]): string {
  if (days.length === 0) return "";
  return normalizeExtraClassDays(days)
    .map((d) => EXTRA_CLASS_DAY_LABEL_SHORT[d])
    .join(" · ");
}

const DAY_PLURAL: Readonly<Record<AgendaExtracurricularDay, string>> = {
  mon: "segundas",
  tue: "terças",
  wed: "quartas",
  thu: "quintas",
  fri: "sextas",
  sat: "sábados",
  sun: "domingos",
};

/**
 * A linha das atividades extras na folha da criança, como no canvas:
 * "Natação às terças e sábados" com uma só; com mais, os nomes ("Natação e
 * Balé"). Sem extras, `null`, e a folha mostra a escola.
 */
export function extrasLine(
  extras: ReadonlyArray<{ name: string; classDays: readonly AgendaExtracurricularDay[] }>,
): string | null {
  if (extras.length === 0) return null;
  if (extras.length > 1) {
    const names = extras.map((extra) => extra.name);
    return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  }
  const [only] = extras;
  if (!only) return null;
  const days = EXTRA_CLASS_DAY_VALUES.filter((day) => only.classDays.includes(day));
  const [first] = days;
  if (!first) return only.name;
  const words = days.map((day) => DAY_PLURAL[day]);
  const joined =
    words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} e ${words[words.length - 1]}`;
  return `${only.name} ${first === "sat" || first === "sun" ? "aos" : "às"} ${joined}`;
}
