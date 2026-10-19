import { z } from "zod";

export const officeCellSchema = z.union([
  z.string().max(32767),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type OfficeCell = z.infer<typeof officeCellSchema>;
const runSchema = z.strictObject({
  text: z.string().max(1_000_000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  size: z.number().finite().min(4).max(200).optional(),
  color: z
    .string()
    .regex(/^#[a-f\d]{6}$/i)
    .optional(),
});
export const officeParagraphSchema = z.strictObject({
  kind: z.literal("paragraph"),
  runs: z.array(runSchema).max(10000),
  align: z.enum(["left", "center", "right", "justify"]).default("left"),
  heading: z.number().int().min(1).max(6).optional(),
  bullet: z.boolean().optional(),
});
export const officeTableSchema = z.strictObject({
  kind: z.literal("table"),
  rows: z.array(z.array(officeCellSchema).max(200)).max(10000),
  header: z.boolean().default(false),
});
export const officeImageSchema = z.strictObject({
  kind: z.literal("image"),
  bytes: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.length > 0 && bytes.length <= 32 * 1024 * 1024),
  format: z.enum(["png", "jpg"]),
  width: z.number().finite().positive().max(16000),
  height: z.number().finite().positive().max(16000),
  alt: z.string().max(2000).default(""),
});
export const officeBlockSchema = z.discriminatedUnion("kind", [
  officeParagraphSchema,
  officeTableSchema,
  officeImageSchema,
]);
export const officeDocumentSchema = z
  .strictObject({
    title: z.string().max(1000),
    pages: z
      .array(
        z.strictObject({
          width: z.number().finite().min(72).max(16000),
          height: z.number().finite().min(72).max(16000),
          margins: z
            .strictObject({
              left: z.number().finite().nonnegative().max(2000),
              right: z.number().finite().nonnegative().max(2000),
              top: z.number().finite().nonnegative().max(2000),
              bottom: z.number().finite().nonnegative().max(2000),
            })
            .optional(),
          blocks: z.array(officeBlockSchema).max(10000),
        }),
      )
      .min(1)
      .max(1000),
    warnings: z.array(z.string().max(2000)).max(1000),
  })
  .superRefine((document, context) => {
    let cells = 0,
      text = 0,
      images = 0;
    let blocks = 0,
      runs = 0;
    for (const page of document.pages) {
      const margins = page.margins ?? { left: 36, right: 36, top: 36, bottom: 36 };
      if (
        page.width - margins.left - margins.right < 24 ||
        page.height - margins.top - margins.bottom < 24
      )
        context.addIssue({
          code: "custom",
          message: "As margens não deixam uma área de conteúdo válida.",
        });
      for (const block of page.blocks) {
        blocks++;
        if (block.kind === "paragraph") runs += block.runs.length;
        if (block.kind === "paragraph")
          text += block.runs.reduce((sum, run) => sum + run.text.length, 0);
        if (block.kind === "table")
          for (const row of block.rows) {
            cells += row.length;
            text += row.reduce<number>((sum, cell) => sum + String(cell ?? "").length, 0);
          }
        if (block.kind === "image") images += block.bytes.length;
      }
    }
    if (
      cells > 200000 ||
      text > 5_000_000 ||
      images > 128 * 1024 * 1024 ||
      blocks > 20000 ||
      runs > 200000
    )
      context.addIssue({
        code: "custom",
        message: "Documento Office excede os limites locais de células, texto ou imagens.",
      });
  });
export type OfficeDocument = z.infer<typeof officeDocumentSchema>;
export type OfficeBlock = z.infer<typeof officeBlockSchema>;
export type OfficeParagraph = z.infer<typeof officeParagraphSchema>;
export type OfficeTable = z.infer<typeof officeTableSchema>;

export const excelSheetNameSchema = z
  .string()
  .min(1)
  .max(31, "O nome de planilha Excel deve ter até 31 caracteres.")
  .refine(
    (name) =>
      !/[\\/?*[\]:]/.test(name) &&
      !name.startsWith("'") &&
      !name.endsWith("'") &&
      ![...name].some((char) => char.charCodeAt(0) < 32),
    "Nome de planilha Excel inválido.",
  );
export const spreadsheetSchema = z
  .array(
    z.strictObject({
      name: z
        .string()
        .min(1)
        .max(255)
        .refine(
          (name) => ![...name].some((char) => char.charCodeAt(0) < 32),
          "Nome de planilha inválido.",
        ),
      rows: z.array(z.array(officeCellSchema).max(16384)).max(100000),
      header: z.boolean().default(false),
    }),
  )
  .min(1)
  .max(100)
  .superRefine((sheets, context) => {
    const names = sheets.map((sheet) => sheet.name.normalize("NFC").toLowerCase());
    if (new Set(names).size !== names.length)
      context.addIssue({ code: "custom", message: "Nomes de planilhas precisam ser únicos." });
    let cells = 0,
      text = 0;
    for (const sheet of sheets)
      for (const row of sheet.rows) {
        cells += row.length;
        text += row.reduce<number>((sum, cell) => sum + String(cell ?? "").length, 0);
      }
    if (cells > 200000 || text > 5_000_000)
      context.addIssue({
        code: "custom",
        message: "Planilha excede os limites locais de células ou texto.",
      });
  });
export type OfficeSpreadsheet = z.infer<typeof spreadsheetSchema>;
