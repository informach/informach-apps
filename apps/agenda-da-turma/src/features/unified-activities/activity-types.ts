import { z } from "zod";

// Vocabulário único de tipos de atividade.
//
// Descrevia "as três fontes" — `agenda.activities`, `agenda.notice_actions` e
// `agenda.profile_subject_activities`. As duas últimas não existem desde a
// convergência: há uma tabela de tarefa (`agenda.tasks`), e a origem virou
// coluna opcional dentro dela.
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
  task: "Para casa",
  exam: "Prova",
  project: "Trabalho",
  reminder: "Lembrete",
  material: "Material",
  authorization: "Autorização",
  event: "Evento",
  study: "Estudo",
};

/**
 * Termo curto do tipo, para onde o rótulo do formulário é longo demais.
 *
 * `ACTIVITY_TYPE_LABELS` é a etiqueta do formulário e carrega a explicação
 * ("Para casa (tarefa)"); num `aria-label` de blip do calendário isso vira
 * "para casa (tarefa) de Matemática, de Ana, atrasada" — parêntese e tudo. Mora
 * aqui, ao lado do vocabulário, porque foi um mapa paralelo em `activity-blip`
 * (com quatro dos oito tipos) que deixou metade das atividades sendo anunciada
 * como "atividade".
 */
export const ACTIVITY_TYPE_SHORT_LABELS: Record<ActivityType, string> = {
  task: "tarefa",
  exam: "prova",
  project: "trabalho",
  reminder: "lembrete",
  material: "material",
  authorization: "autorização",
  event: "evento",
  study: "estudo",
};

export const activityTypeSchema = z.enum(ACTIVITY_TYPES, {
  message: "Selecione o tipo da atividade",
});
