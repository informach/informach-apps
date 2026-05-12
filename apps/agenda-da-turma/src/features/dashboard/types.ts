import type { ActivityListItem } from "@/features/activities/types";

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

export type DashboardSnapshot = {
  counters: DashboardCounters;
  overdue: ActivityListItem[];
  today: ActivityListItem[];
  upcoming: ActivityListItem[];
  perProfile: DashboardProfileSummary[];
};
