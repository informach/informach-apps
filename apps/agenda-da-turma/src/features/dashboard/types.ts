import type { TaskRow } from "@/features/unified-activities/task-repository";

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

// Buckets carregam tarefas — uma forma só desde a convergência.
export type DashboardSnapshot = {
  todayIso: string;
  counters: DashboardCounters;
  overdue: TaskRow[];
  today: TaskRow[];
  upcoming: TaskRow[];
  perProfile: DashboardProfileSummary[];
};
