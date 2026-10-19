import { z } from "zod";
import { distinctPdfPasswords, pdfNewPasswordSchema, pdfPasswordProblem } from "./pdf-password.ts";

const coordinate = z.number().finite().min(-1e7).max(1e7);
const pageIndex = z.number().int().nonnegative().max(100000);
export const pdfRectSchema = z
  .object({
    left: coordinate,
    bottom: coordinate,
    right: coordinate,
    top: coordinate,
  })
  .refine((r) => r.right > r.left && r.top > r.bottom, "Área inválida");
export const engineOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("delete"), page: pageIndex, object: pageIndex }),
  z.object({
    kind: z.literal("text"),
    page: pageIndex,
    object: pageIndex,
    text: z.string().max(100000),
    font: z
      .custom<Uint8Array>((value) => value instanceof Uint8Array)
      .refine((bytes) => bytes.length >= 12 && bytes.length <= 8 * 1024 * 1024)
      .optional(),
  }),
  z.object({
    kind: z.literal("transform"),
    page: pageIndex,
    object: pageIndex,
    matrix: z.tuple([coordinate, coordinate, coordinate, coordinate, coordinate, coordinate]),
  }),
  z.object({ kind: z.literal("redact"), page: pageIndex, rect: pdfRectSchema }),
  z.object({
    kind: z.literal("image"),
    page: pageIndex,
    object: pageIndex,
    width: z.number().int().positive().max(30000),
    height: z.number().int().positive().max(30000),
    pixels: z
      .custom<Uint8Array>((value) => value instanceof Uint8Array)
      .refine((value) => value.length <= 200_000_000),
  }),
]);
export type EngineOperation = z.infer<typeof engineOperationSchema>;
export const securitySchema = z
  .object({
    user: pdfNewPasswordSchema,
    owner: pdfNewPasswordSchema,
    print: z.boolean(),
    copy: z.boolean(),
    modify: z.boolean(),
    fill: z.boolean(),
  })
  .refine(
    (v) =>
      !v.user ||
      !v.owner ||
      !!pdfPasswordProblem(v.user, true) ||
      !!pdfPasswordProblem(v.owner, true) ||
      distinctPdfPasswords(v.user, v.owner),
    "As senhas são equivalentes para o motor PDF. Escolha outra senha de administração.",
  );
export type PdfSecurity = z.infer<typeof securitySchema>;
export const engineObjectSchema = z.object({
  index: pageIndex,
  type: z.number().int(),
  text: z.string(),
  size: z.number().finite(),
  bounds: z.object({ left: coordinate, bottom: coordinate, right: coordinate, top: coordinate }),
  matrix: z.tuple([coordinate, coordinate, coordinate, coordinate, coordinate, coordinate]),
});
export const inspectionSchema = z.object({
  pages: z.array(
    z.object({
      index: pageIndex,
      rotation: z.number().int(),
      crop: pdfRectSchema,
      objects: z.array(engineObjectSchema),
    }),
  ),
  encrypted: z.boolean(),
  ownerUnlocked: z.boolean(),
  signatures: z.number().int().nonnegative(),
});
export type PdfInspection = z.infer<typeof inspectionSchema>;
export const imagePixelsSchema = z
  .object({
    width: z.number().int().positive().max(16384),
    height: z.number().int().positive().max(16384),
    pixels: z.custom<Uint8Array>((value) => value instanceof Uint8Array),
  })
  .refine(
    (image) =>
      image.width * image.height <= 50_000_000 &&
      image.pixels.length === image.width * image.height * 4,
    "Bitmap PDF inválido ou acima do limite.",
  );
export type ImagePixels = z.infer<typeof imagePixelsSchema>;
export const glyphSchema = z.object({
  text: z.string().max(8),
  angle: z.number().finite().min(0).max(360).optional(),
  layoutBox: z
    .object({
      x: coordinate,
      y: coordinate,
      w: z.number().finite().nonnegative(),
      h: z.number().finite().nonnegative(),
    })
    .optional(),
  style: z
    .object({
      family: z.string().max(512).optional(),
      size: z.number().finite().positive().max(10000),
      bold: z.boolean(),
      italic: z.boolean(),
    })
    .optional(),
  box: z
    .object({
      x: coordinate,
      y: coordinate,
      w: z.number().finite().nonnegative(),
      h: z.number().finite().nonnegative(),
    })
    .optional(),
});
export const textDocumentSchema = z.object({
  pages: z.array(
    z.object({
      index: pageIndex,
      glyphs: z.array(glyphSchema).max(2_000_000),
      missingUnicode: z.number().int().nonnegative(),
      error: z.string().optional(),
    }),
  ),
});
export type PdfGlyph = z.infer<typeof glyphSchema>;
export type TextDocument = z.infer<typeof textDocumentSchema>;

export class PdfEngineError extends Error {
  readonly code: "password" | "permission" | "operation";
  constructor(code: "password" | "permission" | "operation", message: string) {
    super(message);
    this.code = code;
  }
}
