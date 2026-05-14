import type { AgendaExtracurricularDay, AgendaProfileSubjectStatus } from "@informach/db/schema";

// Matéria extracurricular do perfil (jazz, futebol, natação). Diferente de
// `Subject` (matéria de turma): não tem `turmaId` (pertence ao perfil) e
// não tem `alternatingSlots` (raramente alterna quinzenalmente). O
// `colorIndex` é escolhido considerando colisão com matérias da turma
// ativa + extras `active` do mesmo perfil — ver `utils.ts`.
export type ProfileSubject = {
  id: string;
  profileId: string;
  name: string;
  colorIndex: number;
  classDays: AgendaExtracurricularDay[];
  status: AgendaProfileSubjectStatus;
  pausedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Pra UI da página `/perfis/[id]/extras`: matéria + contagem de atividades
// rápida pra mostrar no card ("3 atividades pendentes"). Buscado em batch
// pra evitar N+1.
export type ProfileSubjectWithCounts = ProfileSubject & {
  pendingActivitiesCount: number;
  doneActivitiesCount: number;
};
