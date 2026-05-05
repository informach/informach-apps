import { z } from "zod";

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
  finishing: z
    .string()
    .trim()
    .max(5000, "No máximo 5000 caracteres")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  isFavorite: z.boolean().default(false),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;
