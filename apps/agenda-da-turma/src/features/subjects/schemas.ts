import { z } from "zod";
import { MAX_SUBJECT_NAME_LENGTH, MAX_TEACHER_NAME_LENGTH } from "./limits";

const subjectIdSchema = z.string().uuid("Identificador de matéria inválido");
const turmaIdSchema = z.string().uuid("Identificador de turma inválido");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da matéria")
  .max(MAX_SUBJECT_NAME_LENGTH, `Nome muito longo (máx ${MAX_SUBJECT_NAME_LENGTH})`);

// Aceita string vazia (vinda do form) e converte pra undefined; senão valida tamanho.
const teacherNameSchema = z
  .string()
  .trim()
  .max(MAX_TEACHER_NAME_LENGTH, `Nome muito longo (máx ${MAX_TEACHER_NAME_LENGTH})`)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const createSubjectInputSchema = z.object({
  turmaId: turmaIdSchema,
  name: nameSchema,
  teacherName: teacherNameSchema,
});
export type CreateSubjectInput = z.output<typeof createSubjectInputSchema>;
export type CreateSubjectFormValues = z.input<typeof createSubjectInputSchema>;

export const updateSubjectInputSchema = z.object({
  id: subjectIdSchema,
  name: nameSchema,
  teacherName: teacherNameSchema,
});
export type UpdateSubjectInput = z.output<typeof updateSubjectInputSchema>;

export const deleteSubjectInputSchema = z.object({
  id: subjectIdSchema,
});
export type DeleteSubjectInput = z.output<typeof deleteSubjectInputSchema>;

// Form schema sem turmaId (passado por contexto da página). Usado pelo Dialog.
export const subjectFormSchema = z.object({
  name: nameSchema,
  teacherName: teacherNameSchema,
});
export type SubjectFormValues = z.input<typeof subjectFormSchema>;
