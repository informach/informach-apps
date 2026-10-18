// Helpers de data específicos do calendário. Reutiliza
// `toLocalIso`/`todayLocalIso`/`addDaysIso`/`parseLocalIso` de
// `features/dashboard/date` — a regra de TZ (`America/Sao_Paulo` em
// `todayLocalIso`, server-TZ-neutro nos demais) vive lá.

import {
  addDaysIso,
  isValidLocalIsoDate,
  parseLocalIso,
  todayLocalIso,
  toLocalIso,
} from "@/features/dashboard/date";
import { nextSchoolDayIso, weekRangeLabel } from "@/features/dashboard/day-labels";
import type { MonthGridCell } from "./types";

export { addDaysIso, parseLocalIso, todayLocalIso, toLocalIso };

export function startOfMonthIso(anchor: string): string {
  const d = parseLocalIso(anchor);
  return toLocalIso(new Date(d.getFullYear(), d.getMonth(), 1, 12));
}

export function endOfMonthIso(anchor: string): string {
  const d = parseLocalIso(anchor);
  // Dia 0 do mês seguinte = último dia do mês corrente.
  return toLocalIso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

/**
 * A semana começa na segunda, como a página da agenda que vai na mochila: os
 * dias de aula juntos e o fim de semana no fim. Era domingo, como o calendário
 * do celular, e a semana da escola ficava partida em duas linhas. Vale para a
 * semana, para a grade do mês e para a semana impressa.
 * `0` é domingo … `6` é sábado.
 */
export const WEEK_STARTS_ON = 1;

export function startOfWeekIso(anchor: string, weekStartsOn: number = WEEK_STARTS_ON): string {
  const d = parseLocalIso(anchor);
  const dow = d.getDay(); // 0=dom..6=sáb
  const diff = (dow - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toLocalIso(d);
}

export function endOfWeekIso(anchor: string, weekStartsOn: number = WEEK_STARTS_ON): string {
  const start = parseLocalIso(startOfWeekIso(anchor, weekStartsOn));
  start.setDate(start.getDate() + 6);
  return toLocalIso(start);
}

// Grid mensal de 42 dias (6 linhas × 7 colunas) começando na segunda da
// semana do dia 1 do mês. Garante layout consistente independente do mês.
// `inMonth=true` pros dias dentro do mês anchor; `false` pros dias de
// spillover (mês anterior antes do dia 1, mês seguinte depois do último).
export function buildMonthGrid(
  anchor: string,
  weekStartsOn: number = WEEK_STARTS_ON,
): MonthGridCell[] {
  const firstOfMonth = startOfMonthIso(anchor);
  const monthAnchor = parseLocalIso(anchor);
  const gridStart = parseLocalIso(startOfWeekIso(firstOfMonth, weekStartsOn));
  const cells: MonthGridCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = toLocalIso(d);
    cells.push({ iso, inMonth: d.getMonth() === monthAnchor.getMonth() });
  }
  return cells;
}

// Os 7 dias, de segunda a domingo, da semana que contém `anchor`.
export function buildWeekDays(anchor: string, weekStartsOn: number = WEEK_STARTS_ON): string[] {
  const start = parseLocalIso(startOfWeekIso(anchor, weekStartsOn));
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(toLocalIso(d));
  }
  return out;
}

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

const WEEKDAY_LONG_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
});

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Maio de 2026" (primeira letra maiúscula).
export function formatMonthLabel(anchor: string): string {
  return capitalizeFirst(MONTH_YEAR_FORMATTER.format(parseLocalIso(anchor)));
}

// "11 a 17 de maio", "31 de maio a 6 de junho". O mesmo rótulo do resumo da
// semana por e-mail: uma semana não pode ter dois nomes. Fora do ano corrente,
// o ano entra no fim, como no cabeçalho do mês ("Maio de 2027").
export function formatWeekRangeLabel(
  fromIso: string,
  toIso: string,
  todayIso: string = todayLocalIso(),
): string {
  const label = weekRangeLabel(fromIso, toIso);
  const year = toIso.slice(0, 4);
  return fromIso.slice(0, 4) === year && year !== todayIso.slice(0, 4)
    ? `${label} de ${year}`
    : label;
}

// "Segunda, 12 de maio de 2026"
export function formatDayLabel(iso: string): string {
  const d = parseLocalIso(iso);
  const weekday = capitalizeFirst(WEEKDAY_LONG_FORMATTER.format(d));
  const date = FULL_DATE_FORMATTER.format(d);
  return `${weekday}, ${date}`;
}

// Avança ou recua o anchor conforme a vista: as setas da Semana e do Mês.
export function shiftAnchor(anchor: string, view: "month" | "week", direction: 1 | -1): string {
  if (view === "week") return addDaysIso(anchor, direction * 7);
  // month
  const d = parseLocalIso(anchor);
  const target = new Date(d.getFullYear(), d.getMonth() + direction, 1, 12);
  return toLocalIso(target);
}

// Range visível pra uma vista, usado por getCalendarSnapshot pra delimitar
// o BETWEEN do WHERE. Mês cobre a grid de 42 dias (inclui spillover) pra que
// os blips dos dias visíveis fora do mês também apareçam.
export function rangeForView(
  anchor: string,
  view: "month" | "week",
): { fromIso: string; toIso: string } {
  if (view === "week") {
    return { fromIso: startOfWeekIso(anchor), toIso: endOfWeekIso(anchor) };
  }
  // month: cobre a grid 6×7 visível
  const grid = buildMonthGrid(anchor);
  const first = grid[0]?.iso ?? anchor;
  const last = grid[grid.length - 1]?.iso ?? anchor;
  return { fromIso: first, toIso: last };
}

/**
 * A semana que interessa a partir de hoje: a de hoje, ou a que vem quando hoje
 * é sábado ou domingo. Com a semana começando na segunda, abrir a Semana no
 * domingo (o dia padrão do resumo semanal) mostrava a semana que termina hoje,
 * e o resumo fala da que vem.
 */
export function upcomingWeekAnchorIso(todayIso: string): string {
  const weekday = parseLocalIso(todayIso).getDay();
  return weekday === 0 || weekday === 6 ? nextSchoolDayIso(todayIso) : todayIso;
}

/** O id da linha de um dia na Semana: a faixa da semana de Hoje aponta para ele. */
export function weekDayAnchor(iso: string): string {
  return `dia-${iso}`;
}

export function isValidDateIso(s: string): boolean {
  return isValidLocalIsoDate(s);
}

// Nomes curtos dos dias da semana, pelo índice de `Date.getDay()` (0 é
// domingo). Definido em código pra controlar caixa e abreviação (Intl com
// weekday:"short" devolve "dom." com ponto em pt-BR).
export const WEEKDAY_SHORT_BY_DAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// O cabeçalho da grade do mês, na ordem em que a semana começa.
export const WEEKDAY_HEADERS = Array.from(
  { length: 7 },
  (_, offset) => WEEKDAY_SHORT_BY_DAY[(WEEK_STARTS_ON + offset) % 7] ?? "",
);
