import type { ActivityListItem } from "@/features/activities/types";

export type CalendarView = "month" | "week" | "day";

// Range carregado por uma vista do calendário. ISO inclusive em ambos os
// lados; mesmo formato do `due_at` no Postgres.
export type CalendarRange = {
  fromIso: string;
  toIso: string;
};

export type CalendarSnapshot = {
  items: ActivityListItem[];
} & CalendarRange;

// Célula renderizada na grid mensal — `inMonth=false` cobre os dias de spillover
// do mês anterior/seguinte que aparecem em cinza nas bordas da grid.
export type MonthGridCell = {
  iso: string;
  inMonth: boolean;
};
