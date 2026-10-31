import { z } from "zod";
import { CHAINS, EXERCISES } from "@/features/treino/catalog/catalog";
import { type Block, estimateMinutes, type Workout } from "@/features/treino/catalog/workouts";

/** Exercício do catálogo ou o nível atual do perfil numa trilha. */
export const slotSchema = z
  .string()
  .max(40)
  .refine(
    (slot) =>
      slot.startsWith("trilha:")
        ? CHAINS.some((c) => `trilha:${c.id}` === slot)
        : EXERCISES.some((e) => e.id === slot),
    // aborta: a estimativa de duração do treino só roda com todos os slots válidos
    { message: "Exercício desconhecido", abort: true },
  );

const label = z.string().trim().min(1).max(20);
const repsSlot = z.object({ slot: slotSchema, reps: z.number().int().min(1).max(100) });

export const blockSchema: z.ZodType<Block> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sets"),
    slot: slotSchema,
    sets: z.number().int().min(1).max(10),
    target: z.number().int().min(1).max(300),
    rest: z.number().int().min(0).max(300),
  }),
  z.object({
    type: z.literal("interval"),
    label,
    slots: z.array(slotSchema).min(1).max(6),
    work: z.number().int().min(5).max(180),
    rest: z.number().int().min(0).max(180),
    rounds: z.number().int().min(1).max(30),
  }),
  z.object({
    type: z.literal("emom"),
    label,
    slots: z.array(repsSlot).min(1).max(4),
    minutes: z.number().int().min(1).max(30),
  }),
  z.object({
    type: z.literal("amrap"),
    label,
    slots: z.array(repsSlot).min(1).max(6),
    minutes: z.number().int().min(1).max(30),
  }),
]);

export const LEVELS = ["Iniciante", "Intermediário", "Avançado"] as const;
export const MAX_MINUTES = 90;

export const customWorkoutSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    subtitle: z.string().trim().max(80).default(""),
    level: z.enum(LEVELS),
    focus: z.string().trim().min(1).max(24),
    blocks: z.array(blockSchema).min(1).max(12),
  })
  .refine(
    (w) => estimateMinutes({ id: "previa", ...w }) <= MAX_MINUTES,
    `O treino passa de ${MAX_MINUTES} minutos. Tire blocos ou reduza séries.`,
  );

export type CustomWorkoutInput = z.infer<typeof customWorkoutSchema>;

/** Treino da família no mesmo formato dos treinos do catálogo. */
export function toWorkout(row: {
  id: string;
  name: string;
  subtitle: string;
  level: string;
  focus: string;
  blocks: unknown;
}): Workout | null {
  const parsed = customWorkoutSchema.safeParse({ ...row });
  if (!parsed.success) return null;
  return { id: `meu:${row.id}`, ...parsed.data };
}
