export type ActivityType = "task" | "exam" | "project" | "reminder";
export type ActivityVisibility = "individual" | "shared_with_turma";
export type ActivityStatusValue = "pending" | "done";

export type Activity = {
  id: string;
  turmaId: string;
  subjectId: string;
  createdByUserId: string;
  type: ActivityType;
  visibility: ActivityVisibility;
  title: string;
  description: string | null;
  // "YYYY-MM-DD" (coluna `date` no Postgres — sem hora nem timezone)
  dueAt: string;
  createdAt: Date;
  updatedAt: Date;
};

// Uma row por (atividade × perfil do user). Quando a atividade tem status pra
// dois filhos do mesmo user, aparecem 2 linhas — cada uma com seu próprio
// `studentProfileId` e `status`. O `hasOtherAcceptances` é o gate de edit/delete
// pro creator (true quando outra família já aceitou).
export type ActivityListItem = {
  activityId: string;
  statusId: string;
  status: ActivityStatusValue;
  studentProfileId: string;
  studentProfileName: string;
  turmaId: string;
  subjectId: string;
  subjectName: string;
  subjectColorIndex: number;
  schoolName: string;
  grade: string;
  classLetter: string;
  year: number;
  type: ActivityType;
  visibility: ActivityVisibility;
  title: string;
  description: string | null;
  dueAt: string;
  createdByUserId: string;
  hasOtherAcceptances: boolean;
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
  createdByUserId: string;
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
  subjects: Array<{ id: string; name: string; colorIndex: number }>;
};
