import { addDaysIso, isValidLocalIsoDate, parseLocalIso, todayLocalIso } from "./date";

/**
 * Como a Agenda diz uma data: pelo dia da semana.
 *
 * Família pensa em "quinta", não em "22/10". O card, o detalhe, a semana, o
 * resumo por e-mail e a vez da criança falavam cada um do seu jeito ("22/10",
 * "2026-10-22", "Terça (30/09)"), e a mesma atividade aparecia com três datas
 * diferentes conforme a tela. Este módulo é o único lugar que escreve uma data
 * para a pessoa ler.
 *
 * Puro: recebe a data ISO local (`YYYY-MM-DD`) e o "hoje" de São Paulo, para
 * ser testado sem relógio.
 */

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
const WEEKDAY_LONG = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;
const MONTH_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;
const MONTH_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

function parts(iso: string) {
  const date = parseLocalIso(iso);
  return {
    weekday: date.getDay(),
    day: date.getDate(),
    month: date.getMonth(),
    year: date.getFullYear(),
  };
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Diferença em dias de `fromIso` até `toIso` (positiva quando `toIso` é depois). */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = parseLocalIso(fromIso).valueOf();
  const to = parseLocalIso(toIso).valueOf();
  return Math.round((to - from) / 86_400_000);
}

/** "seg", "ter"… */
export function weekdayShort(iso: string): string {
  return WEEKDAY_SHORT[parts(iso).weekday] ?? "";
}

/** "Segunda", "Terça"… */
export function weekdayLong(iso: string): string {
  return capitalize(WEEKDAY_LONG[parts(iso).weekday] ?? "");
}

/**
 * "qui, 22" para datas perto de hoje; "qui, 5 nov" quando o mês muda ou a data
 * está longe; "qui, 5 nov 2027" em outro ano. É o rótulo das listas.
 */
export function shortDayLabel(iso: string, todayIso: string = todayLocalIso()): string {
  const target = parts(iso);
  const today = parts(todayIso);
  const head = `${WEEKDAY_SHORT[target.weekday]}, ${target.day}`;
  if (target.year !== today.year) return `${head} ${MONTH_SHORT[target.month]} ${target.year}`;
  const distance = Math.abs(daysBetweenIso(todayIso, iso));
  if (target.month !== today.month || distance > 20) return `${head} ${MONTH_SHORT[target.month]}`;
  return head;
}

/** "Quinta, 22 de outubro" (com o ano só quando não é o corrente). */
export function longDayLabel(iso: string, todayIso: string = todayLocalIso()): string {
  const target = parts(iso);
  const today = parts(todayIso);
  const base = `${capitalize(WEEKDAY_LONG[target.weekday] ?? "")}, ${target.day} de ${MONTH_LONG[target.month]}`;
  return target.year === today.year ? base : `${base} de ${target.year}`;
}

/** "22 de outubro" ou "22 de outubro de 2027". */
export function dayMonthLabel(iso: string, todayIso: string = todayLocalIso()): string {
  const target = parts(iso);
  const today = parts(todayIso);
  const base = `${target.day} de ${MONTH_LONG[target.month]}`;
  return target.year === today.year ? base : `${base} de ${target.year}`;
}

/**
 * "Hoje", "Amanhã", "Ontem" ou o dia da semana por extenso para o resto da
 * semana que vem ("Quinta"). Mais longe que isso, a data curta.
 */
export function relativeDayLabel(iso: string, todayIso: string = todayLocalIso()): string {
  const distance = daysBetweenIso(todayIso, iso);
  if (distance === 0) return "Hoje";
  if (distance === 1) return "Amanhã";
  if (distance === -1) return "Ontem";
  if (distance > 1 && distance < 7) return weekdayLong(iso);
  return shortDayLabel(iso, todayIso);
}

/** "8h", "8h30". A hora vem no formato da coluna (`HH:MM`). */
export function formatClockTime(time: string): string {
  const [hour, minute] = time.split(":");
  const h = Number(hour);
  if (!Number.isFinite(h)) return time;
  return minute && minute !== "00" ? `${h}h${minute}` : `${h}h`;
}

/** Intervalo de uma semana para títulos: "19 a 25 de outubro", "29 de outubro a 4 de novembro". */
export function weekRangeLabel(fromIso: string, toIso: string): string {
  const from = parts(fromIso);
  const to = parts(toIso);
  if (from.year !== to.year)
    return `${from.day} de ${MONTH_LONG[from.month]} de ${from.year} a ${to.day} de ${MONTH_LONG[to.month]} de ${to.year}`;
  if (from.month !== to.month)
    return `${from.day} de ${MONTH_LONG[from.month]} a ${to.day} de ${MONTH_LONG[to.month]}`;
  return `${from.day} a ${to.day} de ${MONTH_LONG[to.month]}`;
}

/**
 * Onde uma data cai em relação a hoje. É a pergunta que o chip de prazo, o
 * e-mail e a vez da criança fazem antes de escolher as palavras.
 */
export type DayDistance = "late" | "today" | "tomorrow" | "later";

export function dayDistance(iso: string, todayIso: string = todayLocalIso()): DayDistance {
  const distance = daysBetweenIso(todayIso, iso);
  if (distance < 0) return "late";
  if (distance === 0) return "today";
  if (distance === 1) return "tomorrow";
  return "later";
}

/**
 * O próximo dia de aula depois de hoje: amanhã, ou a segunda-feira quando
 * amanhã cai no fim de semana. É até onde vai "o que fazer agora".
 */
export function nextSchoolDayIso(todayIso: string = todayLocalIso()): string {
  let candidate = addDaysIso(todayIso, 1);
  while ([0, 6].includes(parts(candidate).weekday)) candidate = addDaysIso(candidate, 1);
  return candidate;
}

export function isLocalIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && isValidLocalIsoDate(value);
}
