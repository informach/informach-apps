import type { ActivityOverviewItem } from "@/features/unified-activities/overview-types";

export type CalendarView = "month" | "week" | "day";

// Range carregado por uma vista do calendário. ISO inclusive em ambos os
// lados; mesmo formato do `due_at` no Postgres.
export type CalendarRange = {
  fromIso: string;
  toIso: string;
};

// Atividades com prazo no range. Uma forma só desde a convergência: blips e
// detalhe deixaram de ramificar por origem.
export type CalendarSnapshot = {
  items: ActivityOverviewItem[];
} & CalendarRange;

// Célula renderizada na grid mensal — `inMonth=false` cobre os dias de spillover
// do mês anterior/seguinte que aparecem em cinza nas bordas da grid.
export type MonthGridCell = {
  iso: string;
  inMonth: boolean;
};
