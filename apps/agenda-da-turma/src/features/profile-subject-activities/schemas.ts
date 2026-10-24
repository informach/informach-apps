import { z } from "zod";
import {
  MAX_ACTIVITY_DESCRIPTION_LENGTH,
  MAX_ACTIVITY_TITLE_LENGTH,
} from "@/features/activities/limits";
import { isValidLocalIsoDate } from "@/features/dashboard/date";
import { activityTypeSchema } from "@/features/unified-activities/activity-types";

const activityIdSchema = z.string().uuid("Identificador de atividade inválido");
const profileSubjectIdSchema = z.string().uuid("Identificador de matéria inválido");

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
  .transform((v) => (v.length > 0 ? v : undefined))
  // After the transform: in zod 4 the key stays optional in the output only this way round.
  .optional();

const typeSchema = activityTypeSchema;

const statusSchema = z.enum(["pending", "done"]);

const dueAtSchema = z
  .string()
  .trim()
  .min(1, "Informe a data")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .refine(isValidLocalIsoDate, "Data inválida");

export const createProfileSubjectActivityInputSchema = z.object({
  profileSubjectId: profileSubjectIdSchema,
  type: typeSchema,
  title: titleSchema,
  description: descriptionSchema,
  dueAt: dueAtSchema,
});
export type CreateProfileSubjectActivityInput = z.output<
  typeof createProfileSubjectActivityInputSchema
>;
export type CreateProfileSubjectActivityFormValues = z.input<
  typeof createProfileSubjectActivityInputSchema
>;

export const updateProfileSubjectActivityInputSchema = z.object({
  id: activityIdSchema,
  type: typeSchema,
  title: titleSchema,
  description: descriptionSchema,
  dueAt: dueAtSchema,
});
export type UpdateProfileSubjectActivityInput = z.output<
  typeof updateProfileSubjectActivityInputSchema
>;

export const deleteProfileSubjectActivityInputSchema = z.object({
  id: activityIdSchema,
});
export type DeleteProfileSubjectActivityInput = z.output<
  typeof deleteProfileSubjectActivityInputSchema
>;

export const setProfileSubjectActivityStatusInputSchema = z.object({
  id: activityIdSchema,
  status: statusSchema,
});
export type SetProfileSubjectActivityStatusInput = z.output<
  typeof setProfileSubjectActivityStatusInputSchema
>;
