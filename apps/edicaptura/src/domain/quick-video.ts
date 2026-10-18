import { z } from "zod";
export const videoRecipeSchema = z
  .strictObject({
    version: z.literal(1),
    start: z.number().finite().min(0).max(86400),
    end: z.number().finite().positive().max(86400),
  })
  .refine((r) => r.end - r.start >= 0.1, "Selecione pelo menos 0,1 segundo.");
export type VideoRecipe = z.infer<typeof videoRecipeSchema>;
export function validateVideoRecipe(value: unknown, duration: number): VideoRecipe {
  const recipe = videoRecipeSchema.parse(value ?? { version: 1, start: 0, end: duration });
  if (!Number.isFinite(duration) || duration <= 0 || recipe.end > duration + 0.001)
    throw new Error("Intervalo fora da duração do vídeo.");
  return recipe;
}
export const videoOutputSchema = z.strictObject({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  recipe: videoRecipeSchema.nullable(),
  format: z.enum(["mp4", "gif", "png"]),
  preview: z.boolean().default(false),
  width: z.number().int().min(2).max(1920).default(1280),
  fps: z.number().int().min(5).max(20).default(12),
  quality: z.enum(["standard", "compact"]).default("standard"),
  at: z.number().finite().min(0).max(86400).default(0),
});
export type VideoOutput = z.infer<typeof videoOutputSchema>;
export function gifEstimate(recipe: VideoRecipe, width: number, height: number, fps: number) {
  return Math.ceil((recipe.end - recipe.start) * fps * width * height);
}
