import { z } from "zod";
import { isValidLocalIsoDate } from "@/features/dashboard/date";
import { MAX_ACTIVITY_DESCRIPTION_LENGTH, MAX_ACTIVITY_TITLE_LENGTH } from "./limits";

const activityIdSchema = z.string().uuid("Identificador de atividade inválido");
const turmaIdSchema = z.string().uuid("Identificador de turma inválido");
const subjectIdSchema = z.string().uuid("Identificador de matéria inválido");
const studentProfileIdSchema = z.string().uuid("Identificador de estudante inválido");

const titleSchema = z
  .string()
  .trim()
  .min(1, "Descreva a atividade")
  .max(MAX_ACTIVITY_TITLE_LENGTH, `Texto muito longo (máx ${MAX_ACTIVITY_TITLE_LENGTH})`);

const descriptionSchema = z
  .string()
  .trim()
  .max(
    MAX_ACTIVITY_DESCRIPTION_LENGTH,
    `Observação muito longa (máx ${MAX_ACTIVITY_DESCRIPTION_LENGTH})`,
  )
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const typeSchema = z.enum(["task", "exam", "project", "reminder"], {
  message: "Selecione o tipo da atividade",
});

const visibilitySchema = z.enum(["individual", "shared_with_turma"]);

const statusSchema = z.enum(["pending", "done"]);

// "YYYY-MM-DD" (input type="date" retorna esse formato). Sem hora nem TZ.
const dueAtSchema = z
  .string()
  .trim()
  .min(1, "Informe a data de entrega")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .refine(isValidLocalIsoDate, "Data inválida");

export const createActivityInputSchema = z.object({
  turmaId: turmaIdSchema,
  subjectId: subjectIdSchema,
  type: typeSchema,
  title: titleSchema,
  description: descriptionSchema,
  dueAt: dueAtSchema,
  // Free é silenciosamente forçado pra "individual" no service.
  visibility: visibilitySchema.default("individual"),
});
export type CreateActivityInput = z.output<typeof createActivityInputSchema>;
export type CreateActivityFormValues = z.input<typeof createActivityInputSchema>;

// Update permite mudar título, observação, data e tipo. Visibilidade, matéria
// e turma são fixas após o create — mudar isso teria efeitos complexos em
// activity_statuses pra outras famílias.
export const updateActivityInputSchema = z.object({
  id: activityIdSchema,
  type: typeSchema,
  title: titleSchema,
  description: descriptionSchema,
  dueAt: dueAtSchema,
});
export type UpdateActivityInput = z.output<typeof updateActivityInputSchema>;

export const deleteActivityInputSchema = z.object({
  id: activityIdSchema,
});
export type DeleteActivityInput = z.output<typeof deleteActivityInputSchema>;

export const setActivityStatusInputSchema = z.object({
  activityId: activityIdSchema,
  studentProfileId: studentProfileIdSchema,
  status: statusSchema,
});
export type SetActivityStatusInput = z.output<typeof setActivityStatusInputSchema>;

export const respondSharedActivityInputSchema = z.object({
  activityId: activityIdSchema,
  accepted: z.boolean(),
});
export type RespondSharedActivityInput = z.output<typeof respondSharedActivityInputSchema>;
