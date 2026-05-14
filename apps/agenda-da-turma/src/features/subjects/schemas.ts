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

// Slot de revezamento quinzenal pra UM dia. Validações de cross-field (anchor
// cai no day_of_week certo; paired é da mesma turma) ficam no service —
// schema só garante o shape básico. `anchorDate` é "YYYY-MM-DD" estrito;
// não aceita Date direto pra evitar confusão TZ.
const alternatingSlotInputSchema = z.object({
  dayOfWeek: z.enum(["mon", "tue", "wed", "thu", "fri"]),
  pairedSubjectId: z.string().uuid("Matéria pareada inválida"),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
});

const alternatingSlotsSchema = z
  .array(alternatingSlotInputSchema)
  .max(5)
  .default([])
  // Cap defensivo: não pode haver 2 slots pro mesmo dia na mesma matéria
  // (UNIQUE no DB). Detecta cedo e dá mensagem clara.
  .refine(
    (slots) => new Set(slots.map((s) => s.dayOfWeek)).size === slots.length,
    "Você só pode marcar revezamento uma vez por dia da semana",
  );

export const createSubjectInputSchema = z.object({
  turmaId: turmaIdSchema,
  name: nameSchema,
  teacherName: teacherNameSchema,
  classDays: classDaysSchema,
  alternatingSlots: alternatingSlotsSchema,
});
export type CreateSubjectInput = z.output<typeof createSubjectInputSchema>;
export type CreateSubjectFormValues = z.input<typeof createSubjectInputSchema>;

export const updateSubjectInputSchema = z.object({
  id: subjectIdSchema,
  name: nameSchema,
  teacherName: teacherNameSchema,
  classDays: classDaysSchema,
  alternatingSlots: alternatingSlotsSchema,
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
  alternatingSlots: alternatingSlotsSchema,
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
