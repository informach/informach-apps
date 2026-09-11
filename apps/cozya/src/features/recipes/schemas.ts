import { z } from "zod";

const optionalTextSchema = z
  .string()
  .trim()
  .max(5000, "No máximo 5000 caracteres")
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

const recipeBaseSchema = z.object({
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
  servings: z.number().int().min(1).max(100).nullish(),
  totalMinutes: z.number().int().min(1).max(10080).nullish(),
  sourceUrl: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((url) => /^https?:\/\//i.test(url), "Use um link http ou https")
    .nullish(),
  sourceName: z.string().trim().max(200).nullish(),
});

export const creationMethodSchema = z
  .enum(["manual", "voice", "text", "image", "prompt"])
  .default("manual");
export type RecipeCreationMethod = z.output<typeof creationMethodSchema>;

export const recipeInputSchema = recipeBaseSchema.extend({
  isFavorite: z.boolean().default(false),
  creationMethod: creationMethodSchema,
});

export type RecipeFormValues = z.input<typeof recipeInputSchema>;
export type RecipeInput = z.output<typeof recipeInputSchema>;

export const recipeIdSchema = z.object({
  id: z.string().uuid("Identificador inválido"),
});

export const updateRecipeInputSchema = recipeBaseSchema.extend({
  id: z.string().uuid("Identificador inválido"),
  isFavorite: z.boolean(),
});

export type UpdateRecipeFormValues = z.input<typeof updateRecipeInputSchema>;
export type UpdateRecipeInput = z.output<typeof updateRecipeInputSchema>;

export const toggleFavoriteInputSchema = z.object({
  id: z.string().uuid("Identificador inválido"),
  isFavorite: z.boolean(),
});

export type ToggleFavoriteInput = z.output<typeof toggleFavoriteInputSchema>;

export const deleteRecipeInputSchema = recipeIdSchema;
export type DeleteRecipeInput = z.output<typeof deleteRecipeInputSchema>;
