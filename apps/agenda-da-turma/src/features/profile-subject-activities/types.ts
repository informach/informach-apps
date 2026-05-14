import type { ActivityStatusValue, ActivityType } from "@/features/activities/types";

export type { ActivityStatusValue, ActivityType };

// Row crua de `agenda.profile_subject_activities`. `profileId` é redundante
// com `profileSubjectId.profileId` mas guardamos pra evitar JOIN em queries
// de range (dashboard, calendário).
export type ProfileSubjectActivity = {
  id: string;
  profileId: string;
  profileSubjectId: string;
  createdByUserId: string;
  type: ActivityType;
  title: string;
  description: string | null;
  // "YYYY-MM-DD" (coluna `date` no Postgres)
  dueAt: string;
  status: ActivityStatusValue;
  createdAt: Date;
  updatedAt: Date;
};

// Shape consumido pela UI (cards). Discriminated union com o
// `ActivityListItem` original via `source: "extra"`. Alinhado em colunas
// comuns (dueAt, type, title, description, subjectColorIndex, status, perfil)
// pra render funções (color, urgência, badges) consigam tratar os dois sem
// adapters. Os campos exclusivos da turma (subjectName, schoolName, grade,
// classLetter, year) ficam undefined; o renderer checa `source` antes de usar.
export type ProfileSubjectActivityListItem = {
  source: "extra";
  // ID da atividade (mantém o nome do campo igual ao da turma pra reuso).
  activityId: string;
  // Pra extra, profileSubjectActivityId === activityId. Renomeado pro consumer
  // entender o que está olhando.
  profileSubjectActivityId: string;
  status: ActivityStatusValue;
  studentProfileId: string;
  studentProfileName: string;
  profileSubjectId: string;
  profileSubjectName: string;
  profileSubjectColorIndex: number;
  profileSubjectStatus: "active" | "paused";
  type: ActivityType;
  title: string;
  description: string | null;
  dueAt: string;
  activityCreatedAt: Date;
  createdByUserId: string;
};
