import { z } from "zod";
import { EXERCISES } from "@/features/treino/catalog/catalog";

const exerciseId = z
  .string()
  .max(40)
  .refine((id) => EXERCISES.some((e) => e.id === id), "Exercício desconhecido");

export const setLogSchema = z.object({
  exerciseId,
  kind: z.enum(["reps", "hold"]),
  target: z.number().int().min(0).max(1000).optional(),
  reps: z.number().int().min(0).max(2000),
  partials: z.number().int().min(0).max(2000),
  holdSeconds: z.number().int().min(0).max(3600),
  seconds: z.number().int().min(0).max(14400),
  issues: z
    .record(z.string().max(80), z.number().int().min(0).max(2000))
    .refine((issues) => Object.keys(issues).length <= 10, "Avisos demais"),
});

/**
 * Sessão enviada pelo player. O id vem do aparelho para que o reenvio de uma
 * sessão guardada sem rede não duplique; o nome do treino é decidido no
 * servidor a partir da referência.
 */
export const sessionInputSchema = z.object({
  id: z.uuid(),
  profileId: z.uuid(),
  workoutRef: z.string().max(80),
  startedAt: z.number().int().positive(),
  durationSeconds: z.number().int().min(1).max(14400),
  mode: z.enum(["camera", "manual", "pareado"]),
  logs: z.array(setLogSchema).min(1).max(300),
  /** "Como foi?" no fim do treino; pular deixa nulo */
  feeling: z.enum(["facil", "na_medida", "dificil"]).nullish(),
  /** a pessoa tocou em "Parar" (neutro: não guarda motivo, dor ou dado de saúde) */
  endedEarly: z.boolean().optional(),
  /** treinar junto: o mesmo id em todos os treinos do grupo */
  groupId: z.uuid().optional(),
});

export type SessionInput = z.infer<typeof sessionInputSchema>;

/**
 * Treinar junto: um treino por perfil, salvos juntos numa transação só (ou nenhum). Todos com o
 * mesmo treino, o mesmo groupId e perfis diferentes.
 */
export const groupInputSchema = z
  .object({
    groupId: z.uuid(),
    sessoes: z.array(sessionInputSchema).min(2).max(4),
  })
  .refine((g) => g.sessoes.every((s) => s.groupId === g.groupId), "Grupo inconsistente.")
  .refine(
    (g) => new Set(g.sessoes.map((s) => s.profileId)).size === g.sessoes.length,
    "Perfis repetidos.",
  )
  .refine(
    (g) => new Set(g.sessoes.map((s) => s.workoutRef)).size === 1,
    "Treinos diferentes no grupo.",
  );

export type GroupInput = z.infer<typeof groupInputSchema>;
