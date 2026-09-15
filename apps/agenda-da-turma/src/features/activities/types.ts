// Fonte única do vocabulário — ver
// `features/unified-activities/activity-types.ts`.
import type { ActivityType } from "@/features/unified-activities/activity-types";

export type { ActivityType };
export type ActivityVisibility = "individual" | "shared_with_turma";
export type ActivityStatusValue = "pending" | "done";

/**
 * O fato publicado numa turma. Não é a tarefa da família — essa é
 * `agenda.tasks`, lida por `features/unified-activities/task-repository`.
 */
export type Activity = {
  version: number;
  canceledAt?: Date | null;
  id: string;
  turmaId: string;
  subjectId: string;
  createdByUserId: string | null;
  type: ActivityType;
  visibility: ActivityVisibility;
  title: string;
  description: string | null;
  // "YYYY-MM-DD" (coluna `date` no Postgres — sem hora nem timezone)
  dueAt: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Publicada por outra família e ainda sem resposta desta. */
export type PendingSharedActivity = {
  activityId: string;
  turmaId: string;
  type: ActivityType;
  title: string;
  description: string | null;
  dueAt: string;
  subjectName: string;
  subjectColorIndex: number;
  schoolName: string;
  grade: string;
  classLetter: string;
  year: number;
  createdByUserId: string | null;
  createdByUserName: string | null;
};
