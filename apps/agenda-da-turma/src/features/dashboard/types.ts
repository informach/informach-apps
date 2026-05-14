import type { UnifiedActivityListItem } from "@/features/unified-activities/types";

export type DashboardBucket = "overdue" | "today" | "week";

export type DashboardCounters = {
  overdue: number;
  today: number;
  week: number;
  doneRecent: number;
};

export type DashboardProfileSummary = {
  profileId: string;
  profileName: string;
  pending: number;
  overdue: number;
  doneTotal: number;
  totalAll: number;
  progressPercent: number;
};

// Buckets carregam atividades das duas origens (turma + extras `active`).
// Discriminated union via `source` deixa o renderer escolher qual conjunto
// de campos exibir e qual `ActivityCard` montar.
export type DashboardSnapshot = {
  counters: DashboardCounters;
  overdue: UnifiedActivityListItem[];
  today: UnifiedActivityListItem[];
  upcoming: UnifiedActivityListItem[];
  perProfile: DashboardProfileSummary[];
};
