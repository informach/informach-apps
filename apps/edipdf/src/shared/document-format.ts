import { z } from "zod";
import type { Annot, DocContent } from "./model.ts";
import { pageNumbersSchema, watermarkSchema } from "./page-decorations.ts";

const coord = z.number().finite().min(-1e7).max(1e7);
const size = z.number().finite().positive().max(1e7);
const color = z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i);
const id = z.string().min(1).max(160);
const base = {
  id,
  page: id,
  opacity: z.number().min(0).max(1).optional(),
  locked: z.boolean().optional(),
  group: id.optional(),
};
const box = {
  x: coord,
  y: coord,
  w: z.number().nonnegative().max(1e7),
  h: z.number().nonnegative().max(1e7),
};
const text = z.string().max(1_000_000);
export const paragraphAnnotationSchema = z.object({
  ...base,
  ...box,
  kind: z.literal("paragraph"),
  text: z
    .string()
    .min(1)
    .max(100000)
    .refine((value) => value.trim().length > 0, "Digite o texto da caixa."),
  size,
  color,
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: z.enum(["left", "center", "right", "justify"]),
  spacing: z.number().finite().min(1).max(3),
  padding: z.number().finite().min(0).max(14400),
  list: z.enum(["none", "bullet", "numbered"]),
  fontData: z
    .strictObject({
      name: z.string().min(1).max(512),
      data: z.string().min(16).max(11184812).base64(),
    })
    .optional(),
});
export const annotationSchema = z.discriminatedUnion("kind", [
  paragraphAnnotationSchema,
  z.object({
    ...base,
    kind: z.literal("text"),
    x: coord,
    y: coord,
    text,
    font: z.enum(["helvetica", "times", "courier"]),
    size,
    color,
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
  }),
  z.object({
    ...base,
    ...box,
    kind: z.enum(["rect", "ellipse"]),
    stroke: color.nullable(),
    fill: color.nullable(),
    width: z.number().min(0).max(1000),
  }),
  z.object({
    ...base,
    kind: z.enum(["line", "arrow"]),
    x1: coord,
    y1: coord,
    x2: coord,
    y2: coord,
    stroke: color,
    width: size,
  }),
  z.object({
    ...base,
    kind: z.literal("ink"),
    signature: z.boolean().optional(),
    paths: z
      .array(
        z
          .array(coord)
          .min(2)
          .max(1_000_000)
          .refine((p) => p.length % 2 === 0),
      )
      .min(1)
      .max(10000),
    stroke: color,
    width: size,
  }),
  z.object({
    ...base,
    kind: z.enum(["highlight", "underline", "strike"]),
    rects: z.array(z.object(box)).min(1).max(100000),
    color,
  }),
  z.object({
    ...base,
    ...box,
    kind: z.literal("image"),
    src: z
      .string()
      .max(80_000_000)
      .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/),
    signature: z.boolean().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal("note"),
    x: coord,
    y: coord,
    text,
    color,
    resolved: z.boolean().optional(),
    author: z.string().max(200).optional(),
  }),
]) satisfies z.ZodType<Annot>;

export const annotationEnvelopeSchema = z.strictObject({
  version: z.union([z.literal(1), z.literal(2)]),
  annotation: annotationSchema,
});

export const contentSchema = z
  .object({
    baseSource: id.optional(),
    requiresCopy: z.boolean().optional(),
    pages: z
      .array(
        z.object({
          id,
          src: z.string().max(160),
          index: z.number().int().nonnegative(),
          rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
          blank: z.object({ w: size, h: size }).optional(),
        }),
      )
      .min(1)
      .max(100000),
    annots: z.array(annotationSchema).max(200000),
    forms: z.record(
      z.string().max(1000),
      z.union([z.string().max(1_000_000), z.boolean(), z.array(z.string().max(10000)).max(10000)]),
    ),
    meta: z.object({
      title: text.optional(),
      author: text.optional(),
      subject: text.optional(),
      keywords: text.optional(),
    }),
    watermark: watermarkSchema.nullable(),
    pageNumbers: pageNumbersSchema.nullable(),
  })
  .superRefine((content, context) => {
    const pages = new Set(content.pages.map((p) => p.id));
    if (pages.size !== content.pages.length)
      context.addIssue({ code: "custom", message: "Páginas com identidade repetida." });
    if (new Set(content.annots.map((a) => a.id)).size !== content.annots.length)
      context.addIssue({ code: "custom", message: "Anotações com identidade repetida." });
    for (const a of content.annots)
      if (!pages.has(a.page)) context.addIssue({ code: "custom", message: "Anotação sem página." });
    const fontCharacters = content.annots.reduce(
      (sum, a) => sum + (a.kind === "paragraph" ? (a.fontData?.data.length ?? 0) : 0),
      0,
    );
    if (fontCharacters > 64 * 1024 * 1024)
      context.addIssue({
        code: "custom",
        message:
          "As fontes das caixas ultrapassam o limite de 64 MB no modelo. Reduza as fontes personalizadas.",
      });
  }) satisfies z.ZodType<DocContent>;

export const recoverySchema = z
  .strictObject({
    version: z.literal(1),
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
    name: z.string().min(1).max(1000),
    updatedAt: z.number().int().nonnegative(),
    primary: id.nullable(),
    originPaths: z.array(z.string().min(1).max(32768)).max(10000).optional(),
    content: contentSchema,
    draft: z
      .object({
        annot: annotationSchema.refine((a) => a.kind === "text"),
        cover: annotationSchema.refine((a) => a.kind === "rect").optional(),
        before: annotationSchema.refine((a) => a.kind === "text").optional(),
        existing: z.boolean().optional(),
      })
      .optional(),
    sources: z
      .array(
        z.object({
          id,
          name: z.string().max(1000),
          data: z
            .string()
            .max(160_000_000)
            .regex(/^[A-Za-z0-9+/]*={0,2}$/),
        }),
      )
      .max(10000),
  })
  .superRefine((document, context) => {
    const sources = new Set(document.sources.map((s) => s.id));
    if (sources.size !== document.sources.length)
      context.addIssue({ code: "custom", message: "Fontes repetidas." });
    if (document.primary && !sources.has(document.primary))
      context.addIssue({ code: "custom", message: "Fonte principal ausente." });
    if (document.content.baseSource && !sources.has(document.content.baseSource))
      context.addIssue({ code: "custom", message: "Fonte da revisão estrutural ausente." });
    for (const p of document.content.pages)
      if (!p.blank && !sources.has(p.src))
        context.addIssue({ code: "custom", message: "Fonte de página ausente." });
  });
export type RecoveryDocument = z.infer<typeof recoverySchema>;
export interface RecoveryEntry {
  id: string;
  name: string;
  updatedAt: number;
}
export interface RecoveryList {
  entries: RecoveryEntry[];
  unreadable: number;
}
export interface VersionEntry extends RecoveryEntry {
  documentId: string;
  bytes: number;
}
export interface VersionList {
  entries: VersionEntry[];
  unreadable: number;
  totalBytes: number;
}
