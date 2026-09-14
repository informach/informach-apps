import { z } from "zod";

// Vocabulário único de tipos de atividade. Vale para as três fontes que a
// camada unificada projeta: atividades escolares (`agenda.activities`),
// providências vindas de recado (`agenda.notice_actions`) e extracurriculares
// (`agenda.profile_subject_activities`).
//
// Mora aqui, e não em `features/notices`, porque `activities`, `calendar` e
// `dashboard` também dependem dele — mantê-lo em `notices` invertia a
// hierarquia de features (a lista escolar importando do módulo de recados).
//
// `agenda.activities.type` é `text` com enum só em TypeScript (não há CHECK no
// banco), então ampliar esta lista não exige migração. Remover um valor, sim —
// linhas antigas continuariam no banco.
export const ACTIVITY_TYPES = [
  "task",
  "exam",
  "project",
  "reminder",
  "material",
  "authorization",
  "event",
  "study",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  task: "Para casa (tarefa)",
  exam: "Prova",
  project: "Trabalho",
  reminder: "Lembrete",
  material: "Material",
  authorization: "Autorização",
  event: "Evento",
  study: "Estudo",
};

export const activityTypeSchema = z.enum(ACTIVITY_TYPES, {
  message: "Selecione o tipo da atividade",
});
