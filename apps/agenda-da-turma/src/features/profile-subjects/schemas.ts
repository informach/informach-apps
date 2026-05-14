import { z } from "zod";
import { EXTRA_CLASS_DAY_VALUES } from "./class-days";
import { MAX_PROFILE_SUBJECT_NAME_LENGTH } from "./limits";

const profileSubjectIdSchema = z.string().uuid("Identificador de matéria inválido");
const profileIdSchema = z.string().uuid("Identificador de perfil inválido");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da matéria")
  .max(
    MAX_PROFILE_SUBJECT_NAME_LENGTH,
    `Nome muito longo (máx ${MAX_PROFILE_SUBJECT_NAME_LENGTH})`,
  );

// Aceita Seg→Dom (extracurriculares rolam sábado/domingo). Dedup + ordem
// canônica feita aqui pra que repository/service não precisem se preocupar.
const classDaysSchema = z
  .array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]))
  .max(7)
  .default([])
  .transform((v) => EXTRA_CLASS_DAY_VALUES.filter((d) => v.includes(d)));

export const createProfileSubjectInputSchema = z.object({
  profileId: profileIdSchema,
  name: nameSchema,
  classDays: classDaysSchema,
});
export type CreateProfileSubjectInput = z.output<typeof createProfileSubjectInputSchema>;
export type CreateProfileSubjectFormValues = z.input<typeof createProfileSubjectInputSchema>;

export const updateProfileSubjectInputSchema = z.object({
  id: profileSubjectIdSchema,
  name: nameSchema,
  classDays: classDaysSchema,
});
export type UpdateProfileSubjectInput = z.output<typeof updateProfileSubjectInputSchema>;

export const deleteProfileSubjectInputSchema = z.object({
  id: profileSubjectIdSchema,
});
export type DeleteProfileSubjectInput = z.output<typeof deleteProfileSubjectInputSchema>;

export const setProfileSubjectStatusInputSchema = z.object({
  id: profileSubjectIdSchema,
  status: z.enum(["active", "paused"]),
});
export type SetProfileSubjectStatusInput = z.output<typeof setProfileSubjectStatusInputSchema>;

// Form schema sem profileId (vem do contexto da página). Usado pelo Dialog.
export const profileSubjectFormSchema = z.object({
  name: nameSchema,
  classDays: classDaysSchema,
});
export type ProfileSubjectFormValues = z.input<typeof profileSubjectFormSchema>;
