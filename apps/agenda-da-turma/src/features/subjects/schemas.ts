import { z } from "zod";
import { CLASS_DAY_VALUES } from "./class-days";
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

// Array de dias da semana (Seg-Sex). Sempre normaliza pra ordem canônica e
// remove duplicatas — front pode mandar em qualquer ordem. Default vazio
// quando o caller omite (compatível com form existente e fluxo de IA).
const classDaysSchema = z
  .array(z.enum(["mon", "tue", "wed", "thu", "fri"]))
  .max(5)
  .default([])
  .transform((v) => CLASS_DAY_VALUES.filter((d) => v.includes(d)));

export const createSubjectInputSchema = z.object({
  turmaId: turmaIdSchema,
  name: nameSchema,
  teacherName: teacherNameSchema,
  classDays: classDaysSchema,
});
export type CreateSubjectInput = z.output<typeof createSubjectInputSchema>;
export type CreateSubjectFormValues = z.input<typeof createSubjectInputSchema>;

export const updateSubjectInputSchema = z.object({
  id: subjectIdSchema,
  name: nameSchema,
  teacherName: teacherNameSchema,
  classDays: classDaysSchema,
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
  classDays: classDaysSchema,
});
export type SubjectFormValues = z.input<typeof subjectFormSchema>;

// Cap defensivo de itens por lote — alinhado com `MAX_SUBJECTS_PER_BATCH`
// usado no schema do parser de IA. Server enforça mesmo se o caller ignorar.
const MAX_SUBJECTS_BATCH = 40;

// Schema do batch usado pelo fluxo "cadastrar por voz/imagem" — recebe N
// matérias detectadas pela IA (e editadas pelo usuário) para inserir em
// lote numa única chamada de server action.
export const createSubjectsBatchInputSchema = z.object({
  turmaId: turmaIdSchema,
  subjects: z
    .array(
      z.object({
        name: nameSchema,
        teacherName: teacherNameSchema,
        classDays: classDaysSchema,
      }),
    )
    .min(1, "Inclua pelo menos uma matéria")
    .max(MAX_SUBJECTS_BATCH, `Máximo de ${MAX_SUBJECTS_BATCH} matérias por lote`),
});
export type CreateSubjectsBatchInput = z.output<typeof createSubjectsBatchInputSchema>;
export type CreateSubjectsBatchFormValues = z.input<typeof createSubjectsBatchInputSchema>;
