import type { UnifiedActivityListItem } from "@/features/unified-activities/types";

export type CalendarView = "month" | "week" | "day";

// Range carregado por uma vista do calendário. ISO inclusive em ambos os
// lados; mesmo formato do `due_at` no Postgres.
export type CalendarRange = {
  fromIso: string;
  toIso: string;
};

// `items` contém atividades das duas origens (turma + extras `active`).
// Blips e detail dialog ramificam por `source` — extras ganham modificador
// visual (borda dashed) e o detail dialog mostra read-only sem edit/delete
// inline (gestão das extras vive em /perfis/[id]/extras/[subjectId]).
export type CalendarSnapshot = {
  items: UnifiedActivityListItem[];
} & CalendarRange;

// Célula renderizada na grid mensal — `inMonth=false` cobre os dias de spillover
// do mês anterior/seguinte que aparecem em cinza nas bordas da grid.
export type MonthGridCell = {
  iso: string;
  inMonth: boolean;
};
