import { z } from "zod";
import {
  MAX_TURMA_YEAR,
  MIN_TURMA_YEAR,
  TURMA_CODE_ALPHABET,
  TURMA_CODE_LENGTH,
  TURMA_GRADES,
} from "./limits";

const codeRegex = new RegExp(`^[${TURMA_CODE_ALPHABET}]{${TURMA_CODE_LENGTH}}$`);

const profileIdSchema = z.string().uuid("Identificador de perfil inválido");

export const createTurmaInputSchema = z.object({
  schoolInepCode: z.string().min(1, "Selecione a escola").max(32),
  grade: z.enum(TURMA_GRADES),
  year: z
    .number()
    .int("Ano inválido")
    .min(MIN_TURMA_YEAR, `Ano mínimo ${MIN_TURMA_YEAR}`)
    .max(MAX_TURMA_YEAR, `Ano máximo ${MAX_TURMA_YEAR}`),
  classLetter: z
    .string()
    .trim()
    .length(1, "Informe a letra")
    .regex(/^[A-Z]$/, "Letra deve ser de A a Z"),
  profileId: profileIdSchema,
});
export type CreateTurmaInput = z.output<typeof createTurmaInputSchema>;
export type CreateTurmaFormValues = z.input<typeof createTurmaInputSchema>;

export const joinByCodeInputSchema = z.object({
  code: z.string().trim().toUpperCase().regex(codeRegex, "Código inválido"),
  profileId: profileIdSchema,
});
export type JoinByCodeInput = z.output<typeof joinByCodeInputSchema>;
export type JoinByCodeFormValues = z.input<typeof joinByCodeInputSchema>;

export const setActiveTurmaInputSchema = z.object({
  profileId: profileIdSchema,
  turmaId: z.string().uuid("Identificador de turma inválido"),
});
export type SetActiveTurmaInput = z.output<typeof setActiveTurmaInputSchema>;

export const leaveTurmaInputSchema = setActiveTurmaInputSchema;
export type LeaveTurmaInput = z.output<typeof leaveTurmaInputSchema>;
