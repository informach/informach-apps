import { z } from "zod";
import { BLEND_IDS } from "./blendModes.ts";
import type { Doc } from "./doc.ts";

export const MAX_SIDE = 8192;
export const MAX_PIXELS = 32_000_000;
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_JSON = 8 * 1024 * 1024;
const id = z.string().min(1).max(160);
const finite = z.number().finite();
const side = finite.int().min(1).max(MAX_SIDE);
const unit = finite.min(0).max(1);
const color = z.string().regex(/^#[\da-f]{6}$/i);
const point = z.object({ x: finite, y: finite }).passthrough();
const transform = z
  .object({
    basis: z
      .tuple([finite, finite, finite, finite])
      .refine(([a, b, c, d]) => Math.abs(a * d - b * c) > 1e-10, "Base de transformação inválida")
      .optional(),
    x: finite,
    y: finite,
    scale: finite.positive().max(1000),
    rotation: finite,
    flipX: z.boolean(),
    flipY: z.boolean(),
  })
  .passthrough();
const base = {
  role: z.enum(["style", "image-placeholder"]).optional(),
  id,
  name: z.string().max(500),
  visible: z.boolean(),
  locked: z.boolean(),
  blendMode: z.enum(BLEND_IDS),
  opacity: unit,
  fill: unit,
  mask: z
    .object({ bitmap: id, enabled: z.boolean(), reference: transform.optional() })
    .passthrough()
    .optional(),
};
const channel = z.tuple([finite.min(0).max(255), finite.min(0).max(255), finite.min(0).max(255)]);
const adjustment = z
  .object({
    exposure: finite.min(-3).max(3),
    brightness: finite.min(-100).max(100),
    contrast: finite.min(-100).max(100),
    highlights: finite.min(-100).max(100),
    shadows: finite.min(-100).max(100),
    temperature: finite.min(-100).max(100),
    tint: finite.min(-100).max(100),
    vibrance: finite.min(-100).max(100),
    saturation: finite.min(-100).max(100),
    hue: finite.min(-180).max(180),
    levels: z
      .object({ black: channel, white: channel, gamma: finite.positive().max(10) })
      .passthrough(),
    grayscale: z.boolean(),
    invert: z.boolean(),
    curves: z.tuple([unit, unit, unit, unit, unit]).optional(),
  })
  .passthrough();
const layer = z.discriminatedUnion("kind", [
  z
    .object({
      ...base,
      kind: z.literal("raster"),
      bitmap: id,
      width: side,
      height: side,
      transform,
    })
    .passthrough(),
  z.object({ ...base, kind: z.literal("solid"), color }).passthrough(),
  z
    .object({
      ...base,
      kind: z.literal("gradient"),
      gradient: z
        .object({
          space: z
            .object({
              width: side,
              height: side,
              toLocal: z
                .tuple([finite, finite, finite, finite, finite, finite])
                .refine(
                  ([a, b, c, d]) => Math.abs(a * d - b * c) > 1e-10,
                  "Referência de gradiente inválido",
                ),
            })
            .passthrough()
            .optional(),
          type: z.enum(["linear", "radial"]),
          angle: finite,
          cx: finite,
          cy: finite,
          scale: finite.positive(),
          stops: z
            .array(
              z.object({ id: id.optional(), color, position: unit, opacity: unit }).passthrough(),
            )
            .min(2)
            .max(8),
        })
        .passthrough(),
    })
    .passthrough(),
  z
    .object({
      ...base,
      kind: z.literal("adjust"),
      preset: z.enum(["natural", "warm", "cool", "mono"]).optional(),
      adjust: adjustment,
    })
    .passthrough(),
  z
    .object({
      ...base,
      kind: z.literal("text"),
      transform,
      text: z
        .object({
          content: z.string().max(50_000),
          font: z.string().min(1).max(200),
          size: finite.positive().max(2000),
          weight: finite.min(100).max(900),
          italic: z.boolean(),
          color,
          align: z.enum(["left", "center", "right"]),
          lineHeight: finite.min(0.6).max(3),
          letterSpacing: finite.min(-50).max(200),
          maxWidth: finite.min(20).max(MAX_SIDE).optional(),
        })
        .passthrough(),
    })
    .passthrough(),
  z
    .object({
      ...base,
      kind: z.literal("vector"),
      transform,
      vector: z
        .object({
          shape: z.enum(["rectangle", "ellipse", "triangle", "polygon", "star", "line", "path"]),
          width: finite.positive().max(16384),
          height: finite.positive().max(16384),
          radius: finite.min(0),
          sides: finite.int().min(3).max(40),
          innerRadius: unit,
          fillOpacity: unit.optional(),
          fillColor: color.nullable(),
          strokeColor: color.nullable(),
          strokeWidth: finite.min(0).max(500),
          strokeAlign: z.enum(["inside", "center", "outside"]),
          closed: z.boolean(),
          points: z
            .array(
              point.extend({
                incoming: point.optional(),
                outgoing: point.optional(),
                smooth: z.boolean().optional(),
              }),
            )
            .max(10_000),
        })
        .passthrough(),
    })
    .passthrough(),
]);
export const documentSchema = z
  .object({
    id,
    name: z.string().max(500),
    width: side,
    height: side,
    layers: z.array(layer).max(250),
  })
  .passthrough()
  .superRefine((doc, ctx) => {
    const sizes = new Map<string, number>();
    const dimensions = new Map<string, string>();
    const add = (id: string, w: number, h: number) => {
      const size = `${w}x${h}`;
      if (dimensions.has(id) && dimensions.get(id) !== size)
        ctx.addIssue({
          code: "custom",
          message: "Uma imagem possui dimensões conflitantes no projeto.",
        });
      dimensions.set(id, size);
      sizes.set(id, w * h);
    };
    for (const l of doc.layers) {
      if (l.kind === "raster") add(l.bitmap, l.width, l.height);
      if (l.mask) add(l.mask.bitmap, doc.width, doc.height);
    }
    if ([...sizes.values()].reduce((sum, size) => sum + size, 0) > 64_000_000)
      ctx.addIssue({
        code: "custom",
        message:
          "O projeto contém imagens grandes demais. Reduza as dimensões ou a quantidade de imagens.",
      });
    if (doc.width * doc.height > MAX_PIXELS)
      ctx.addIssue({ code: "custom", message: "A imagem excede 32 milhões de pixels." });
    if (new Set(doc.layers.map((l) => l.id)).size !== doc.layers.length)
      ctx.addIssue({ code: "custom", message: "Existem camadas com identificadores repetidos." });
    for (const l of doc.layers)
      if (l.kind === "raster" && l.width * l.height > MAX_PIXELS)
        ctx.addIssue({ code: "custom", message: "Uma imagem excede o limite de pixels." });
  });
const metadataSchema = z
  .object({
    format: z.literal("edifoto"),
    version: z.union([z.literal(1), z.literal(2)]),
    doc: documentSchema,
    bitmaps: z.record(id, z.tuple([finite.int().min(0), finite.int().positive()])),
  })
  .passthrough();

export function validateDocument(input: unknown): Doc {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Projeto inválido: ${parsed.error.issues[0]?.message ?? "conteúdo incompatível"}`,
    );
  return parsed.data;
}
export function validateDimensions(width: number, height: number, maxSide = MAX_SIDE): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > Math.min(MAX_SIDE, maxSide) ||
    height > Math.min(MAX_SIDE, maxSide) ||
    width * height > MAX_PIXELS
  )
    throw new Error(
      `Use dimensões inteiras de 1 a ${Math.min(MAX_SIDE, maxSide)} px, com até 32 milhões de pixels no total.`,
    );
}
export function referencedBitmaps(doc: Doc): Set<string> {
  const ids = new Set<string>();
  for (const l of doc.layers) {
    if (l.kind === "raster") ids.add(l.bitmap);
    if (l.mask) ids.add(l.mask.bitmap);
  }
  return ids;
}
export function encodeArchive(doc: Doc, bitmaps: ReadonlyMap<string, Uint8Array>): Uint8Array {
  validateDocument(doc);
  const index = new Map<string, [number, number]>();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (const key of referencedBitmaps(doc)) {
    const bytes = bitmaps.get(key);
    if (!bytes?.length)
      throw new Error("Não foi possível salvar: uma imagem ou máscara está ausente.");
    index.set(key, [length, bytes.length]);
    chunks.push(bytes);
    length += bytes.length;
  }
  const json = new TextEncoder().encode(
    JSON.stringify({ format: "edifoto", version: 2, doc, bitmaps: Object.fromEntries(index) }),
  );
  if (json.length > MAX_JSON || 12 + json.length + length > MAX_ARCHIVE_BYTES)
    throw new Error("O projeto excede o limite de tamanho.");
  const result = new Uint8Array(12 + json.length + length);
  result.set(new TextEncoder().encode("EDIFOTO2"));
  new DataView(result.buffer).setUint32(8, json.length, true);
  result.set(json, 12);
  let offset = 12 + json.length;
  for (const bytes of chunks) {
    result.set(bytes, offset);
    offset += bytes.length;
  }
  return result;
}
export function decodeArchive(bytes: Uint8Array): { doc: Doc; bitmaps: Map<string, Uint8Array> } {
  if (
    bytes.length < 12 ||
    bytes.length > MAX_ARCHIVE_BYTES ||
    !["EDIFOTO1", "EDIFOTO2"].includes(new TextDecoder().decode(bytes.subarray(0, 8)))
  )
    throw new Error("Este arquivo não é um projeto EdiFoto válido.");
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
  if (length < 2 || length > MAX_JSON || 12 + length > bytes.length)
    throw new Error("O projeto está incompleto ou danificado.");
  let input: unknown;
  try {
    input = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(12, 12 + length)),
    );
  } catch {
    throw new Error("O projeto contém dados inválidos.");
  }
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("Projeto inválido ou criado em uma versão não compatível do EdiFoto.");
  const meta = parsed.data,
    baseOffset = 12 + length;
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== `EDIFOTO${meta.version}`)
    throw new Error("A versão do projeto está inconsistente.");
  const result = new Map<string, Uint8Array>();
  const intervals: [number, number][] = [];
  if (Object.keys(meta.bitmaps).length > 500) throw new Error("O projeto contém imagens demais.");
  const referenced = referencedBitmaps(meta.doc);
  for (const [key, [offset, size]] of Object.entries(meta.bitmaps)) {
    if (!referenced.has(key)) throw new Error("O projeto contém uma imagem sem referência.");
    if (!Number.isSafeInteger(offset + size) || baseOffset + offset + size > bytes.length)
      throw new Error("O projeto contém uma imagem incompleta.");
    intervals.push([offset, offset + size]);
    result.set(key, bytes.subarray(baseOffset + offset, baseOffset + offset + size));
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let previousEnd = 0;
  for (const [start, end] of intervals) {
    if (start < previousEnd) throw new Error("O índice de imagens está danificado.");
    previousEnd = end;
  }
  for (const key of referencedBitmaps(meta.doc))
    if (!result.has(key)) throw new Error("O projeto está sem uma imagem ou máscara.");
  return { doc: meta.doc, bitmaps: result };
}
