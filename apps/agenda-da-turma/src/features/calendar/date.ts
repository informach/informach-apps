// Helpers de data específicos do calendário. Reutiliza
// `toLocalIso`/`todayLocalIso`/`addDaysIso`/`parseLocalIso` de
// `features/dashboard/date` — a regra de TZ (`America/Sao_Paulo` em
// `todayLocalIso`, server-TZ-neutro nos demais) vive lá.

import { addDaysIso, parseLocalIso, todayLocalIso, toLocalIso } from "@/features/dashboard/date";
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

// Semana começando no domingo (default BR/Google Calendar/iOS).
// `weekStartsOn = 0` (dom) … `6` (sáb).
export function startOfWeekIso(anchor: string, weekStartsOn: number = 0): string {
  const d = parseLocalIso(anchor);
  const dow = d.getDay(); // 0=dom..6=sáb
  const diff = (dow - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toLocalIso(d);
}

export function endOfWeekIso(anchor: string, weekStartsOn: number = 0): string {
  const start = parseLocalIso(startOfWeekIso(anchor, weekStartsOn));
  start.setDate(start.getDate() + 6);
  return toLocalIso(start);
}

// Grid mensal de 42 dias (6 linhas × 7 colunas) começando no domingo da
// semana do dia 1 do mês. Garante layout consistente independente do mês.
// `inMonth=true` pros dias dentro do mês anchor; `false` pros dias de
// spillover (mês anterior antes do dia 1, mês seguinte depois do último).
export function buildMonthGrid(anchor: string, weekStartsOn: number = 0): MonthGridCell[] {
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

// 7 dias do domingo→sábado contendo `anchor`.
export function buildWeekDays(anchor: string, weekStartsOn: number = 0): string[] {
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

const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
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

// "11 – 17 de mai · 2026" (intervalo de uma semana). Mostra mês uma vez quando
// igual nos dois lados; senão "11 mai – 03 jun · 2026".
export function formatWeekRangeLabel(fromIso: string, toIso: string): string {
  const from = parseLocalIso(fromIso);
  const to = parseLocalIso(toIso);
  const fromMonth = SHORT_MONTH_FORMATTER.format(from).replace(/\.$/, "");
  const toMonth = SHORT_MONTH_FORMATTER.format(to).replace(/\.$/, "");
  const fromDay = String(from.getDate()).padStart(2, "0");
  const toDay = String(to.getDate()).padStart(2, "0");
  const year = to.getFullYear();
  if (fromMonth === toMonth) {
    return `${fromDay} – ${toDay} de ${fromMonth} · ${year}`;
  }
  return `${fromDay} ${fromMonth} – ${toDay} ${toMonth} · ${year}`;
}

// "Segunda, 12 de maio de 2026"
export function formatDayLabel(iso: string): string {
  const d = parseLocalIso(iso);
  const weekday = capitalizeFirst(WEEKDAY_LONG_FORMATTER.format(d));
  const date = FULL_DATE_FORMATTER.format(d);
  return `${weekday}, ${date}`;
}

// Avança/recua o anchor conforme a vista — chamado pelos botões prev/next.
export function shiftAnchor(
  anchor: string,
  view: "month" | "week" | "day",
  direction: 1 | -1,
): string {
  if (view === "day") return addDaysIso(anchor, direction);
  if (view === "week") return addDaysIso(anchor, direction * 7);
  // month
  const d = parseLocalIso(anchor);
  const target = new Date(d.getFullYear(), d.getMonth() + direction, 1, 12);
  return toLocalIso(target);
}

// Range visível pra uma vista — usado por getCalendarSnapshot pra delimitar
// o BETWEEN do WHERE. Mês cobre a grid de 42 dias (inclui spillover) pra que
// os blips dos dias visíveis fora do mês também apareçam.
export function rangeForView(
  anchor: string,
  view: "month" | "week" | "day",
): { fromIso: string; toIso: string } {
  if (view === "day") return { fromIso: anchor, toIso: anchor };
  if (view === "week") {
    return { fromIso: startOfWeekIso(anchor), toIso: endOfWeekIso(anchor) };
  }
  // month: cobre a grid 6×7 visível
  const grid = buildMonthGrid(anchor);
  const first = grid[0]?.iso ?? anchor;
  const last = grid[grid.length - 1]?.iso ?? anchor;
  return { fromIso: first, toIso: last };
}

// Regex defensivo pra validar `?date=YYYY-MM-DD` vindo da URL.
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateIso(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const d = parseLocalIsoSafe(s);
  return d !== null;
}

function parseLocalIsoSafe(iso: string): Date | null {
  try {
    return parseLocalIso(iso);
  } catch {
    return null;
  }
}

// Nomes curtos dos dias da semana — header da grid mensal (Dom Seg Ter ...).
// Definido em código pra controlar caixa/abreviação (Intl com weekday:"short"
// devolve "dom." com ponto em pt-BR).
export const WEEKDAY_SHORT_LABELS_SUNDAY_FIRST = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
