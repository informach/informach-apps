import { z } from "zod";
import { weekStart } from "./dates";

export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const date = new Date(`${day}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
  }, "Data inválida");
export const weekSchema = daySchema.refine(
  (day) => weekStart(day) === day,
  "A semana começa na segunda-feira",
);
export const mealSchema = z
  .object({
    day: daySchema,
    slot: z.enum(["lunch", "dinner"]),
    recipeId: z.string().uuid().nullable(),
    label: z.string().trim().max(120),
    servings: z.number().int().min(1).max(100),
  })
  .refine(
    (meal) => meal.recipeId || meal.label.length > 0,
    "Escolha uma receita ou descreva a refeição",
  );
export const cookingInputSchema = z.object({
  recipeId: z.string().uuid(),
  servings: z.number().int().min(1).max(100).optional(),
  operation: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("ingredient"),
      index: z.number().int().min(0).max(499),
      checked: z.boolean(),
    }),
    z.object({
      type: z.literal("step"),
      index: z.number().int().min(0).max(499),
      checked: z.boolean(),
    }),
    z.object({ type: z.literal("timer"), minutes: z.number().int().min(0).max(1440) }),
    z.object({ type: z.literal("complete") }),
    z.object({ type: z.literal("reset") }),
    z.object({ type: z.literal("portions") }),
  ]),
});
