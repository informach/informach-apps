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

// Uma row por (atividade × perfil do user). Quando a atividade tem status pra
// dois filhos do mesmo user, aparecem 2 linhas — cada uma com seu próprio
// `studentProfileId` e `status`. O `hasOtherAcceptances` é o gate de edit/delete
// pro creator (true quando outra família já aceitou).
export type ActivityListItem = {
  version: number;
  canceledAt?: Date | null;
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
  // Necessário pro cursor de paginação (tiebreaker estável quando vários
  // perfis compartilham a mesma atividade — mesma dueAt). Não usado na UI.
  activityCreatedAt: Date;
  activityUpdatedAt?: Date;
  createdByUserId: string | null;
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
  // `classDays` alimenta o fallback de dueAt no parser de atividades (IA):
  // quando a atividade vem sem data e a matéria foi resolvida, pega o
  // próximo dia da semana com aula. Vazio = sem horário cadastrado.
  subjects: Array<{
    id: string;
    name: string;
    colorIndex: number;
    classDays: AgendaClassDay[];
  }>;
};

/**
 * Shape de uma atividade detectada pela IA (voz/imagem) depois do
 * enrichment server-side. Consumida pelo
 * `ActivitiesBatchConfirmDialog` pra renderizar cards editáveis:
 *
 *   - `title`/`description`/`type`/`dueAt`: campos diretos da atividade.
 *     `dueAt` pode vir `null` quando a IA não conseguiu inferir data;
 *     o user preenche manualmente.
 *   - `subjectHint`: texto livre da matéria. Client faz fuzzy-match
 *     contra as matérias da turma escolhida (`findClosestSubject`).
 *   - `studentNameHint`: texto livre do estudante mencionado. Server
 *     já resolveu pra `resolvedTurmaId` quando casou um perfil.
 *   - `resolvedTurmaId`: turma ativa do perfil casado (ou turma única
 *     cross-turma cuja matéria casou com `subjectHint`), ou null.
 *   - `resolvedSubjectId`: matéria da turma resolvida que casou
 *     `subjectHint` (fuzzy via `findClosestSubject`), ou null.
 */
export type ParsedActivityInput = {
  title: string;
  description: string | null;
  type: ActivityType;
  dueAt: string | null;
  subjectHint: string | null;
  studentNameHint: string | null;
  resolvedTurmaId: string | null;
  resolvedSubjectId: string | null;
};
