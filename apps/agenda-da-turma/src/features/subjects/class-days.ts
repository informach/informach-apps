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

const ENUM_TO_JS_DAY: Readonly<Record<AgendaClassDay, number>> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
};

export function dayOfWeekToClassDay(jsDay: number): AgendaClassDay | null {
  return JS_DAY_TO_ENUM[jsDay] ?? null;
}

export function classDayToJsDay(day: AgendaClassDay): number {
  return ENUM_TO_JS_DAY[day];
}

// "Última ocorrência passada (ou hoje) do `day` em relação a `today`".
// Usado pelo form de revezamento pra dar um default sensato pro datepicker
// do anchor: se hoje é qui e o slot é pra wed, default = qua passada (hoje - 1).
// Se hoje é wed e o slot é wed, default = hoje (a aula é hoje). Service valida
// que o weekday do anchor casa com o day.
export function lastOnOrBeforeForDay(day: AgendaClassDay, todayIso: string): string {
  const target = classDayToJsDay(day);
  let candidateIso = todayIso;
  for (let i = 0; i < 7; i++) {
    const date = parseLocalIso(candidateIso);
    if (date.getDay() === target) return candidateIso;
    candidateIso = addDaysIso(candidateIso, -1);
  }
  // Defensivo — não deveria chegar aqui.
  return todayIso;
}

// Slot de revezamento quinzenal de UM dia específico de UMA matéria.
// Quando passado pra `nextClassDayIso`, faz com que esse dia só seja
// contado como "dia de aula" nas semanas com a mesma paridade do
// `anchorIso`. As outras semanas pertencem à matéria pareada (calculada
// fora desta função).
export type AlternatingSlot = {
  day: AgendaClassDay;
  // Data conhecida ("YYYY-MM-DD") em que ESTA matéria teve aula nesse `day`.
  // Toda data candidata X com `floor((X - anchorIso) / 7d) % 2 === 0` cai na
  // semana "minha"; senão, é semana da pareada (pular).
  anchorIso: string;
};

function isMyWeek(candidateIso: string, anchorIso: string): boolean {
  const candidate = parseLocalIso(candidateIso);
  const anchor = parseLocalIso(anchorIso);
  const daysBetween = Math.round((candidate.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000));
  // floor pra suportar candidatos antes do anchor (raro mas defensivo).
  // % 7 === 0 esperado (mesmo dia da semana), mas confiamos no caller só
  // chamar isMyWeek pra candidatos cujo enumDay === slot.day.
  const weeksDiff = Math.floor(daysBetween / 7);
  return weeksDiff % 2 === 0;
}

// Verifica se a matéria tem aula numa data específica, considerando classDays
// e (opcional) slots de revezamento quinzenal. Pure function — usado pelo
// dashboard pra montar a lista de "matérias de hoje" e pelo calendário (futuro)
// pra colorir dias.
//
// Algoritmo:
//   1. Weekday do `targetIso` precisa estar em `classDays`. Se não estiver
//      (ex.: hoje é sábado, classDays=[mon,fri]) → false.
//   2. Se há slot pra esse weekday, checa paridade contra anchor: mesma →
//      true (semana minha); outra → false (semana da pareada).
//   3. Sem slot pra esse weekday → true (dia semanal).
export function isSubjectActiveOnDate(
  targetIso: string,
  classDays: readonly AgendaClassDay[],
  alternatingSlots?: readonly AlternatingSlot[],
): boolean {
  if (classDays.length === 0) return false;
  const target = parseLocalIso(targetIso);
  const enumDay = dayOfWeekToClassDay(target.getDay());
  if (!enumDay || !classDays.includes(enumDay)) return false;
  const slot = alternatingSlots?.find((s) => s.day === enumDay);
  if (!slot) return true;
  return isMyWeek(targetIso, slot.anchorIso);
}

// Devolve o próximo ISO ("YYYY-MM-DD") ESTRITAMENTE APÓS `todayIso` cujo dia
// da semana casa com algum item de `classDays`. Retorna null quando `classDays`
// está vazio.
//
// Suporte a revezamento quinzenal: `alternatingSlots` (opcional) marca dias
// específicos como bi-semanais. Pra esses dias, só conta como ocorrência se a
// semana candidata tiver a MESMA paridade do `anchorIso` do slot. Dias que NÃO
// estão em `alternatingSlots` são semanais (comportamento default).
//
// Loop extende a 14 dias quando há slots quinzenais — basta pra cobrir o
// "minha semana é a próxima" pior caso (mesmo dia da semana + 7d).
export function nextClassDayIso(
  todayIso: string,
  classDays: readonly AgendaClassDay[],
  alternatingSlots?: readonly AlternatingSlot[],
): string | null {
  if (classDays.length === 0) return null;
  const set = new Set(classDays);
  const slotsByDay = new Map<AgendaClassDay, AlternatingSlot>();
  for (const slot of alternatingSlots ?? []) {
    slotsByDay.set(slot.day, slot);
  }
  const maxOffset = slotsByDay.size > 0 ? 14 : 7;
  for (let offset = 1; offset <= maxOffset; offset++) {
    const candidateIso = addDaysIso(todayIso, offset);
    const candidate = parseLocalIso(candidateIso);
    const enumDay = dayOfWeekToClassDay(candidate.getDay());
    if (!enumDay || !set.has(enumDay)) continue;
    const slot = slotsByDay.get(enumDay);
    if (!slot) return candidateIso; // dia semanal — esse é o próximo
    if (isMyWeek(candidateIso, slot.anchorIso)) return candidateIso;
    // Senão: dia quinzenal mas é semana do par; pula pra próxima ocorrência.
  }
  return null;
}

// Devolve o próximo ISO ("YYYY-MM-DD") ESTRITAMENTE APÓS `todayIso` que seja
// um dia útil (segunda a sexta — fora do enum `AgendaClassDay`, que é Seg→Sex).
// Sex → próxima seg; sáb → seg; dom → seg; demais → next day.
//
// Fallback final do enrich de IA quando a atividade não tem matéria resolvida
// (ou a matéria não tem `classDays` cadastrados). Escola brasileira não tem
// aula sáb/dom, então "amanhã" puro (today + 1) erra na sexta — esta versão
// pula o fim de semana e cai na próxima segunda. Loop limitado a 7 dias.
export function nextWeekdayIso(todayIso: string): string {
  let candidateIso = todayIso;
  for (let i = 0; i < 7; i++) {
    candidateIso = addDaysIso(candidateIso, 1);
    const jsDay = parseLocalIso(candidateIso).getDay();
    if (jsDay !== 0 && jsDay !== 6) return candidateIso;
  }
  // Defensivo — bloco de 7 dias sempre contém pelo menos 5 dias úteis.
  return candidateIso;
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
