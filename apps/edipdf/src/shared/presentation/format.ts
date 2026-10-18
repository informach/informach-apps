import { z } from "zod";
import { officeParagraphSchema } from "../office-format.ts";

const color = z.string().regex(/^#[a-f\d]{6}$/i);
export const presentationBoxSchema = z.strictObject({
  x: z.number().finite().nonnegative().max(4032),
  y: z.number().finite().nonnegative().max(4032),
  w: z.number().finite().positive().max(4032),
  h: z.number().finite().positive().max(4032),
});
const position = {
  id: z.string().min(1).max(200),
  box: presentationBoxSchema,
  rotation: z.number().finite().min(-360).max(360).default(0),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
};
export const presentationElementSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("text"),
    ...position,
    paragraphs: z.array(officeParagraphSchema).min(1).max(1000),
    vertical: z.enum(["top", "middle", "bottom"]).default("top"),
    margins: z
      .strictObject({
        left: z.number().finite().nonnegative().max(200),
        right: z.number().finite().nonnegative().max(200),
        top: z.number().finite().nonnegative().max(200),
        bottom: z.number().finite().nonnegative().max(200),
      })
      .default({ left: 0, right: 0, top: 0, bottom: 0 }),
  }),
  z.strictObject({
    kind: z.literal("image"),
    ...position,
    bytes: z
      .instanceof(Uint8Array)
      .refine((value) => value.length > 0 && value.length <= 32 * 1024 * 1024),
    format: z.enum(["png", "jpg"]),
    alt: z.string().max(2000).default(""),
  }),
  z.strictObject({
    kind: z.literal("shape"),
    ...position,
    box: presentationBoxSchema.extend({
      w: z.number().finite().nonnegative().max(4032),
      h: z.number().finite().nonnegative().max(4032),
    }),
    shape: z.enum(["rect", "ellipse", "line"]),
    fill: color.nullable().default(null),
    stroke: color.nullable().default(null),
    width: z.number().finite().nonnegative().max(100).default(1),
    opacity: z.number().finite().min(0).max(1).default(1),
  }),
]);
export const presentationSchema = z
  .strictObject({
    title: z.string().max(1000),
    width: z.number().finite().min(72).max(4032),
    height: z.number().finite().min(72).max(4032),
    slides: z
      .array(
        z.strictObject({
          name: z.string().max(1000),
          elements: z.array(presentationElementSchema).max(10000),
          background: color.default("#ffffff"),
        }),
      )
      .min(1)
      .max(200),
    warnings: z.array(z.string().max(2000)).max(1000),
  })
  .superRefine((document, context) => {
    let elements = 0,
      characters = 0,
      images = 0,
      runs = 0;
    for (const slide of document.slides) {
      const identifiers = new Set<string>();
      for (const element of slide.elements) {
        elements++;
        if (identifiers.has(element.id))
          context.addIssue({
            code: "custom",
            message: "Identificadores de objetos repetidos no slide.",
          });
        identifiers.add(element.id);
        if (
          element.box.x + element.box.w > document.width + 0.01 ||
          element.box.y + element.box.h > document.height + 0.01
        )
          context.addIssue({
            code: "custom",
            message: "Objeto fora da área do slide. Ajuste o documento antes de converter.",
          });
        if (element.kind === "image") images += element.bytes.length;
        if (
          element.kind === "shape" &&
          (element.shape === "line"
            ? element.box.w + element.box.h === 0
            : element.box.w === 0 || element.box.h === 0)
        )
          context.addIssue({
            code: "custom",
            message: "Forma de apresentação sem extensão válida.",
          });
        if (element.kind === "text") {
          if (
            element.margins.left + element.margins.right >= element.box.w ||
            element.margins.top + element.margins.bottom >= element.box.h
          )
            context.addIssue({ code: "custom", message: "A margem ocupa toda a caixa de texto." });
          for (const paragraph of element.paragraphs)
            for (const run of paragraph.runs) {
              runs++;
              characters += run.text.length;
            }
        }
      }
    }
    if (elements > 50000 || characters > 2_000_000 || images > 64 * 1024 * 1024 || runs > 200000)
      context.addIssue({
        code: "custom",
        message: "Apresentação excede os limites locais de objetos/texto/imagens.",
      });
  });
export type Presentation = z.infer<typeof presentationSchema>;
export type PresentationElement = z.infer<typeof presentationElementSchema>;
export type PresentationText = Extract<PresentationElement, { kind: "text" }>;
