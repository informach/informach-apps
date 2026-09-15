import type { ActivityStatusValue, ActivityType } from "@/features/activities/types";

export type { ActivityStatusValue, ActivityType };

/**
 * A atividade extracurricular, como a página da matéria a lê.
 *
 * É uma linha de `agenda.tasks` com `profile_subject_id` preenchido — não há
 * mais tabela própria. Por isso o prazo é opcional (a tarefa sem data vive na
 * rotina, sem data fictícia) e o cancelamento é um estado possível, coisas
 * que a tabela antiga não sabia representar.
 */
export type ProfileSubjectActivity = {
  id: string;
  profileId: string;
  profileSubjectId: string;
  createdByUserId: string | null;
  type: ActivityType;
  title: string;
  description: string | null;
  // "YYYY-MM-DD" (coluna `date` no Postgres); nulo é prazo a confirmar.
  dueAt: string | null;
  status: ActivityStatusValue | "canceled";
  createdAt: Date;
  updatedAt: Date;
};
