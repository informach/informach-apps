import { gradientPaintsSchema } from "@informach/edi-motion/graphics";
import { z } from "zod";
import { validateSvgNumbers } from "./svgValidation";

export const appearanceKeys = [
  "fill",
  "stroke",
  "stroke-width",
  "fill-opacity",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "fill-rule",
];
export const appearanceSchema = z
  .record(z.string(), z.string().max(500))
  .superRefine((attrs, ctx) => {
    for (const [key, value] of Object.entries(attrs)) {
      if (
        !appearanceKeys.includes(key) ||
        /url\s*\(|[<>\\]|(?:javascript|data|https?):/i.test(value)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "O estilo aceita apenas atributos seguros de aparência.",
        });
        continue;
      }
      try {
        validateSvgNumbers(key, value);
      } catch {
        ctx.addIssue({ code: "custom", message: `Valor de aparência inválido: ${key}` });
      }
    }
  });
export const appearanceStyleSchema = z.strictObject({
  id: z.string().regex(/^style-[\w-]{1,100}$/),
  name: z.string().trim().min(1).max(120),
  attrs: appearanceSchema,
  gradients: gradientPaintsSchema.optional(),
});
export type AppearanceStyle = z.infer<typeof appearanceStyleSchema>;
export const paletteSchema = z
  .array(z.string().regex(/^#[\da-f]{6}$/i))
  .max(64)
  .refine(
    (items) => new Set(items.map((item) => item.toLowerCase())).size === items.length,
    "Cores duplicadas na paleta.",
  );
