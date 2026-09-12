import { z } from "zod";
import { isValidLocalIsoDate, todayLocalIso } from "@/features/dashboard/date";

const MAX_AGE_YEARS = 25;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function yearsAgoIso(anchorIso: string, years: number): string {
  const [year, month, day] = anchorIso.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`yearsAgoIso: invalid ISO "${anchorIso}"`);
  }
  const targetYear = year - years;
  const lastDayInTargetMonth = new Date(targetYear, month, 0, 12).getDate();
  return `${targetYear}-${pad2(month)}-${pad2(Math.min(day, lastDayInTargetMonth))}`;
}

const birthDateSchema = z
  .string()
  .trim()
  .refine(isValidLocalIsoDate, "Data inválida")
  .refine(
    (value) => !isValidLocalIsoDate(value) || value <= todayLocalIso(),
    "Data de nascimento não pode estar no futuro",
  )
  .refine(
    (value) => !isValidLocalIsoDate(value) || value >= yearsAgoIso(todayLocalIso(), MAX_AGE_YEARS),
    `Idade máxima ${MAX_AGE_YEARS} anos`,
  );

const studentProfileBaseSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(80, "No máximo 80 caracteres"),
  birthDate: z
    .union([birthDateSchema, z.literal(""), z.null()])
    .optional()
    .transform((value) => value || null),
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
