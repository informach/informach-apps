import type { AgendaClassDay } from "@informach/db/schema";

// Fonte única do vocabulário — ver
// `features/unified-activities/activity-types.ts`.
import type { ActivityType } from "@/features/unified-activities/activity-types";

export type { ActivityType };
export type ActivityVisibility = "individual" | "shared_with_turma";
export type ActivityStatusValue = "pending" | "done";

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

// Carregado pela página `/atividades` pra alimentar o form de criação:
// turmas onde o user tem ≥1 perfil ativo, com as matérias de cada turma.
export type TurmaWithSubjectsForForm = {
  turmaId: string;
  schoolName: string;
  grade: string;
  classLetter: string;
  year: number;
  // `classDays` + `alternatingSlots` alimentam a sugestão de prazo do
  // formulário: ao escolher a matéria com a data vazia, o campo recebe a
  // próxima aula, respeitando o revezamento quinzenal. Vazio = sem horário
  // cadastrado, e aí o campo fica vazio.
  subjects: Array<{
    id: string;
    name: string;
    colorIndex: number;
    classDays: AgendaClassDay[];
    alternatingSlots: Array<{ day: AgendaClassDay; anchorIso: string }>;
  }>;
};
