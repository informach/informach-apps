import { z } from "zod";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AGE_YEARS = 25;

const birthDateSchema = z
  .string()
  .trim()
  .regex(ISO_DATE_REGEX, "Data inválida")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return false;
    // Reject normalization mismatches like "2026-13-50" → "2027-02-19".
    return parsed.toISOString().slice(0, 10) === value;
  }, "Data inválida")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return parsed.getTime() <= Date.now();
  }, "Data de nascimento não pode estar no futuro")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    const limit = new Date();
    limit.setUTCFullYear(limit.getUTCFullYear() - MAX_AGE_YEARS);
    return parsed.getTime() >= limit.getTime();
  }, `Idade máxima ${MAX_AGE_YEARS} anos`);

const studentProfileBaseSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(80, "No máximo 80 caracteres"),
  birthDate: birthDateSchema,
});

export const createStudentProfileInputSchema = studentProfileBaseSchema;
export type StudentProfileFormValues = z.input<typeof createStudentProfileInputSchema>;
export type CreateStudentProfileInput = z.output<typeof createStudentProfileInputSchema>;

export const studentProfileIdSchema = z.object({
  id: z.string().uuid("Identificador inválido"),
});

export const updateStudentProfileInputSchema = studentProfileBaseSchema.extend({
  id: z.string().uuid("Identificador inválido"),
});
export type UpdateStudentProfileFormValues = z.input<typeof updateStudentProfileInputSchema>;
export type UpdateStudentProfileInput = z.output<typeof updateStudentProfileInputSchema>;

export const deleteStudentProfileInputSchema = studentProfileIdSchema;
export type DeleteStudentProfileInput = z.output<typeof deleteStudentProfileInputSchema>;
