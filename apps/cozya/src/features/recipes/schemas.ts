import { z } from "zod";

const optionalTextSchema = z
  .string()
  .trim()
  .max(5000, "No máximo 5000 caracteres")
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

export const recipeInputSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(120, "No máximo 120 caracteres"),
  ingredients: z
    .string()
    .trim()
    .min(1, "Liste pelo menos um ingrediente")
    .max(5000, "No máximo 5000 caracteres"),
  preparation: z
    .string()
    .trim()
    .min(1, "Descreva o preparo")
    .max(5000, "No máximo 5000 caracteres"),
  finishing: optionalTextSchema,
  isFavorite: z.boolean().default(false),
});

export type RecipeFormValues = z.input<typeof recipeInputSchema>;
export type RecipeInput = z.output<typeof recipeInputSchema>;
