import type { TaskRow } from "@/features/unified-activities/task-repository";

// A Semana abre na semana; o mês fica a um toque. A vista do dia saiu: a
// semana já mostra cada dia inteiro.
export type CalendarView = "week" | "month";

// Range carregado por uma vista do calendário. ISO inclusive em ambos os
// lados; mesmo formato do `due_at` no Postgres.
export type CalendarRange = {
  fromIso: string;
  toIso: string;
};

// Atividades com prazo no range e, na semana, as em aberto sem data. Uma
// forma só desde a convergência: blips e detalhe deixaram de ramificar por
// origem.
export type CalendarSnapshot = {
  items: TaskRow[];
  undated: TaskRow[];
} & CalendarRange;

// Célula renderizada na grid mensal — `inMonth=false` cobre os dias de spillover
// do mês anterior/seguinte que aparecem em cinza nas bordas da grid.
export type MonthGridCell = {
  iso: string;
  inMonth: boolean;
};
