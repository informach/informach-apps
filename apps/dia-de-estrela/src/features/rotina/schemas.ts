import { z } from "zod";
import { ICONES_TAREFA, MODELOS } from "@/domain/modelos";

const texto = (max: number) => z.string().trim().min(1).max(max);
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v ? v : null))
    .nullable()
    .default(null);

export const taskSchema = z.object({
  title: texto(40),
  icon: z.enum(ICONES_TAREFA),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  days: z.number().int().min(1).max(127),
  durationMin: z
    .number()
    .int()
    .min(0)
    .max(180)
    .transform((v) => (v >= 5 ? v - (v % 5) : null))
    .nullable()
    .default(null),
  stars: z.number().int().min(1).max(50),
  steps: z
    .array(z.object({ text: texto(80), detail: opcional(120) }))
    .max(12)
    .default([])
    .transform((passos) =>
      passos.map((p) => (p.detail ? { text: p.text, detail: p.detail } : { text: p.text })),
    ),
  needs: z.array(texto(30)).max(8).default([]),
  thenText: opcional(40),
  detail: opcional(80),
  remind: z.boolean().default(true),
  requiresApproval: z.boolean().default(false),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const templateIdSchema = z.enum(MODELOS.map((m) => m.id) as [string, ...string[]]);
