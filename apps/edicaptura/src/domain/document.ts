import { z } from "zod";
import { videoRecipeSchema } from "./quick-video.ts";

const coordinate = z.number().finite().min(-100_000).max(100_000);
const point = z.object({ x: coordinate, y: coordinate });
const style = {
  id: z.string().uuid().optional(),
  color: z
    .string()
    .regex(/^#[a-f0-9]{6}$/i)
    .default("#0062ff"),
  stroke: z.number().min(1).max(100).default(4),
  opacity: z.number().min(0).max(1).default(1),
  fontSize: z.number().min(8).max(256).default(24),
  fill: z
    .string()
    .regex(/^#[a-f0-9]{6}$/i)
    .nullable()
    .default(null),
  rotation: z.number().finite().min(-3600).max(3600).default(0),
  groupId: z.string().uuid().optional(),
  shadow: z.boolean().default(false),
  arrowHeads: z.enum(["end", "both", "none"]).default("end"),
  x: coordinate,
  y: coordinate,
};
const endpoints = { ...style, x2: coordinate, y2: coordinate };
export const annotationSchema = z.discriminatedUnion("kind", [
  z.object({ ...endpoints, kind: z.literal("arrow") }),
  z.object({ ...endpoints, kind: z.literal("square") }),
  z.object({ ...endpoints, kind: z.literal("highlighter") }),
  z.object({ ...endpoints, kind: z.literal("blur") }),
  z.object({ ...endpoints, kind: z.literal("ellipse") }),
  z.object({ ...endpoints, kind: z.literal("line") }),
  z.object({ ...endpoints, kind: z.literal("callout"), text: z.string().max(10_000).default("") }),
  z.object({ ...endpoints, kind: z.literal("redact") }),
  z.object({ ...endpoints, kind: z.literal("spotlight") }),
  z.object({
    ...endpoints,
    kind: z.literal("magnify"),
    factor: z.number().min(1).max(5).default(2),
  }),
  z.object({
    ...endpoints,
    kind: z.literal("image"),
    assetId: z.string().uuid(),
    dataUrl: z.string().startsWith("data:image/png;base64,").max(70_000_000).optional(),
  }),
  z.object({ ...style, kind: z.literal("text"), text: z.string().min(1).max(10_000) }),
  z.object({
    ...style,
    kind: z.literal("steps"),
    number: z.number().int().min(1).max(1000),
    radius: z.number().min(4).max(300).default(18),
  }),
  z.object({ ...style, kind: z.literal("pen"), points: z.array(point).min(1).max(20_000) }),
]);
export const cropSchema = z
  .object({
    x: z.number().int().min(0).max(100_000),
    y: z.number().int().min(0).max(100_000),
    width: z.number().int().min(1).max(100_000),
    height: z.number().int().min(1).max(100_000),
  })
  .refine((value) => value.width * value.height <= 100_000_000, "Recorte excede 100 megapixels.");
export const viewTransformSchema = z.object({
  turns: z.number().int().min(0).max(3).default(0),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
  scale: z.number().min(0.01).max(8).default(1),
  padding: z.number().int().min(0).max(2000).default(0),
  background: z
    .string()
    .regex(/^#[a-f0-9]{6}$/i)
    .nullable()
    .default(null),
  borderWidth: z.number().int().min(0).max(100).default(0),
  borderColor: z
    .string()
    .regex(/^#[a-f0-9]{6}$/i)
    .default("#283142"),
});
export const imageEditSchema = z.object({
  annotations: z.array(annotationSchema).max(1000),
  crop: cropSchema.nullable().default(null),
  viewTransform: viewTransformSchema.default({
    turns: 0,
    flipX: false,
    flipY: false,
    scale: 1,
    padding: 0,
    background: null,
    borderWidth: 0,
    borderColor: "#283142",
  }),
});
export const documentSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  kind: z.enum(["image", "video"]),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  annotations: z.array(annotationSchema).max(1000).default([]),
  crop: cropSchema.nullable().default(null),
  viewTransform: viewTransformSchema.default({
    turns: 0,
    flipX: false,
    flipY: false,
    scale: 1,
    padding: 0,
    background: null,
    borderWidth: 0,
    borderColor: "#283142",
  }),
  preview: z.string().max(2_000_000).startsWith("data:image/png;base64,").optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  favorite: z.boolean().default(false),
  collection: z.string().trim().max(80).default(""),
  sourceApp: z.string().trim().max(120).default(""),
  deletedAt: z.string().datetime().nullable().default(null),
  videoRecipe: videoRecipeSchema.nullable().default(null),
  media: z
    .object({
      status: z.enum(["pending", "ready", "failed"]),
      durationSeconds: z.number().finite().nonnegative().optional(),
      width: z.number().int().positive().max(100_000).optional(),
      height: z.number().int().positive().max(100_000).optional(),
      hasAudio: z.boolean().optional(),
      error: z.string().max(500).optional(),
    })
    .optional(),
});
export type CaptureDocument = z.infer<typeof documentSchema>;
export const metadataUpdateSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  videoRecipe: videoRecipeSchema.nullable().optional(),
  tags: documentSchema.shape.tags.removeDefault().optional(),
  favorite: z.boolean().optional(),
  collection: documentSchema.shape.collection.removeDefault().optional(),
  sourceApp: documentSchema.shape.sourceApp.removeDefault().optional(),
  deletedAt: documentSchema.shape.deletedAt.removeDefault().optional(),
});
export function parseDocument(value: unknown): CaptureDocument {
  const result = documentSchema.safeParse(value);
  if (!result.success)
    throw new Error("Metadados do projeto inválidos. O original foi preservado.", {
      cause: result.error,
    });
  const document = result.data;
  document.annotations = document.annotations.map((annotation) => ({
    ...annotation,
    id: annotation.id || crypto.randomUUID(),
  }));
  return document;
}
