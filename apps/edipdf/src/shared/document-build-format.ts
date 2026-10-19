import { z } from "zod";
import { contentSchema } from "./document-format.ts";
import type { DocContent } from "./model.ts";
import type { UnicodeFonts } from "./unicode-fonts.ts";

export function documentBuildPayloadSize(input: {
  content: DocContent;
  sources: Record<string, Uint8Array>;
  primary: string | null;
  fonts?: UnicodeFonts;
}): number {
  const metadata = new TextEncoder().encode(
    JSON.stringify({
      content: input.content,
      primary: input.primary,
      sources: Object.keys(input.sources),
    }),
  ).length;
  return (
    metadata +
    Object.values(input.sources).reduce((sum, bytes) => sum + bytes.length, 0) +
    (input.fonts ? Object.values(input.fonts).reduce((sum, bytes) => sum + bytes.length, 0) : 0)
  );
}

const bytes = z
  .custom<Uint8Array>((value) => value instanceof Uint8Array)
  .refine((value) => value.length > 0 && value.length <= 512 * 1024 * 1024);
const font = z
  .custom<Uint8Array>((value) => value instanceof Uint8Array)
  .refine((value) => value.length > 0 && value.length <= 32 * 1024 * 1024);
export const documentBuildRequestSchema = z
  .strictObject({
    content: contentSchema,
    sources: z.record(z.string().min(1).max(160), bytes),
    primary: z.string().min(1).max(160).nullable(),
    fonts: z.strictObject({ regular: font, bold: font, italic: font, boldItalic: font }).optional(),
  })
  .superRefine((input, context) => {
    if (
      Object.keys(input.sources).length > 1000 ||
      documentBuildPayloadSize(input) > 512 * 1024 * 1024
    )
      context.addIssue({
        code: "custom",
        message: "A composição excede mil fontes ou 512 MB de PDFs.",
      });
    if (input.primary && !Object.hasOwn(input.sources, input.primary))
      context.addIssue({ code: "custom", message: "Fonte principal ausente na composição." });
    for (const page of input.content.pages)
      if (!page.blank && !Object.hasOwn(input.sources, page.src))
        context.addIssue({
          code: "custom",
          message: "Uma página da composição referencia uma fonte ausente.",
        });
  });
export type BuildInput = z.infer<typeof documentBuildRequestSchema>;
export const documentBuildResponseSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), bytes }),
  z.strictObject({ ok: z.literal(false), error: z.string().max(2000) }),
]);
