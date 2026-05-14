import { AGENDA_CLASS_DAYS, type AgendaClassDay } from "@informach/db/schema";
import { addDaysIso, parseLocalIso } from "@/features/dashboard/date";

export { AGENDA_CLASS_DAYS, type AgendaClassDay };

// Ordem canônica (Seg→Sex). Usada pra renderizar UI e pra deduplicar/normalizar
// arrays vindos do form (que podem chegar fora de ordem se o user clicou em
// qualquer sequência).
export const CLASS_DAY_VALUES: readonly AgendaClassDay[] = AGENDA_CLASS_DAYS;

export const CLASS_DAY_LABEL_SHORT: Readonly<Record<AgendaClassDay, string>> = {
  mon: "Seg",
  tue: "Ter",
  wed: "Qua",
  thu: "Qui",
  fri: "Sex",
};

export const CLASS_DAY_LABEL_FULL: Readonly<Record<AgendaClassDay, string>> = {
  mon: "Segunda-feira",
  tue: "Terça-feira",
  wed: "Quarta-feira",
  thu: "Quinta-feira",
  fri: "Sexta-feira",
};

// `Date.getDay()` semantics: 0=Sun, 1=Mon, ..., 6=Sat.
const JS_DAY_TO_ENUM: Readonly<Record<number, AgendaClassDay | null>> = {
  0: null,
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: null,
};

export function dayOfWeekToClassDay(jsDay: number): AgendaClassDay | null {
  return JS_DAY_TO_ENUM[jsDay] ?? null;
}

// Devolve o próximo ISO ("YYYY-MM-DD") ESTRITAMENTE APÓS `todayIso` cujo dia
// da semana casa com algum item de `classDays`. Retorna null quando `classDays`
// está vazio. Busca até +7 dias (uma semana inteira garante que sempre achamos
// algo se classDays é não-vazio).
export function nextClassDayIso(
  todayIso: string,
  classDays: readonly AgendaClassDay[],
): string | null {
  if (classDays.length === 0) return null;
  const set = new Set(classDays);
  for (let offset = 1; offset <= 7; offset++) {
    const candidateIso = addDaysIso(todayIso, offset);
    const candidate = parseLocalIso(candidateIso);
    const enumDay = dayOfWeekToClassDay(candidate.getDay());
    if (enumDay && set.has(enumDay)) {
      return candidateIso;
    }
  }
  return null;
}

// Normaliza um array vindo de form/IA: remove duplicatas, descarta valores
// fora do enum, reordena pra ordem canônica Seg→Sex.
export function normalizeClassDays(input: readonly string[]): AgendaClassDay[] {
  const set = new Set<string>(input);
  return CLASS_DAY_VALUES.filter((d) => set.has(d));
}

// Formato "Seg · Ter · Qui · Sex" pra renderizar nos cards.
export function formatClassDaysShort(days: readonly AgendaClassDay[]): string {
  if (days.length === 0) return "";
  return normalizeClassDays(days)
    .map((d) => CLASS_DAY_LABEL_SHORT[d])
    .join(" · ");
}
