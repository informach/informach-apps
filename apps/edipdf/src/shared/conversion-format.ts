import { z } from "zod";
import { tableEvidenceSchema, tableSettingsSchema } from "./table-format.ts";

export const conversionImportExtensions = [
  "docx",
  "xlsx",
  "rtf",
  "tif",
  "tiff",
  "odt",
  "ods",
  "pptx",
  "odp",
];
export function conversionImportKind(
  name: string,
):
  | "docx-to-pdf"
  | "xlsx-to-pdf"
  | "rtf-to-pdf"
  | "tiff-to-pdf"
  | "odt-to-pdf"
  | "ods-to-pdf"
  | "pptx-to-pdf"
  | "odp-to-pdf" {
  if (/\.odp$/i.test(name)) return "odp-to-pdf";
  if (/\.pptx$/i.test(name)) return "pptx-to-pdf";
  if (/\.docx$/i.test(name)) return "docx-to-pdf";
  if (/\.xlsx$/i.test(name)) return "xlsx-to-pdf";
  if (/\.rtf$/i.test(name)) return "rtf-to-pdf";
  if (/\.tiff?$/i.test(name)) return "tiff-to-pdf";
  if (/\.odt$/i.test(name)) return "odt-to-pdf";
  if (/\.ods$/i.test(name)) return "ods-to-pdf";
  throw new Error("O formato escolhido não pertence ao perfil de conversão local.");
}

export const conversionExportFormatSchema = z.enum([
  "docx",
  "txt",
  "tif",
  "rtf",
  "odt",
  "xlsx",
  "ods",
  "csv",
  "json",
  "pptx",
  "odp",
]);
export type ConversionExportFormat = z.infer<typeof conversionExportFormatSchema>;
export const conversionExportKind = (format: ConversionExportFormat) =>
  (
    ({
      docx: "pdf-to-docx",
      txt: "pdf-to-txt",
      tif: "pdf-to-tiff",
      rtf: "pdf-to-rtf",
      odt: "pdf-to-odt",
      xlsx: "pdf-to-xlsx",
      ods: "pdf-to-ods",
      csv: "pdf-to-csv",
      json: "pdf-to-table-json",
      pptx: "pdf-to-pptx",
      odp: "pdf-to-odp",
    }) as const
  )[format];

const bytes = z
  .custom<Uint8Array>((data) => data instanceof Uint8Array)
  .refine((data) => data.length > 0 && data.length <= 256 * 1024 * 1024);
const fonts = z.strictObject({ regular: bytes, bold: bytes, italic: bytes, boldItalic: bytes });
export const conversionRequestSchema = z.strictObject({
  kind: z.enum([
    "docx-to-pdf",
    "xlsx-to-pdf",
    "tiff-to-pdf",
    "rtf-to-pdf",
    "odt-to-pdf",
    "ods-to-pdf",
    "pptx-to-pdf",
    "odp-to-pdf",
    "pdf-to-docx",
    "pdf-to-txt",
    "pdf-to-tiff",
    "pdf-to-rtf",
    "pdf-to-odt",
    "pdf-to-xlsx",
    "pdf-to-ods",
    "pdf-to-csv",
    "pdf-to-table-json",
    "pdf-to-pptx",
    "pdf-to-odp",
  ]),
  bytes,
  title: z.string().min(1).max(1000),
  fonts,
  fontLicense: z.string().min(100).max(100000),
  dpi: z.union([z.literal(150), z.literal(200), z.literal(300)]).default(200),
  table: tableSettingsSchema.optional(),
});
export type ConversionRequest = z.infer<typeof conversionRequestSchema>;
export const conversionResultSchema = z.strictObject({
  bytes: z
    .custom<Uint8Array>((data) => data instanceof Uint8Array)
    .refine((data) => data.length > 0 && data.length <= 64 * 1024 * 1024),
  pdf: bytes,
  pages: z.number().int().positive().max(1000),
  warnings: z.array(z.string().max(2000)).max(1000),
  extension: z.enum([
    "pdf",
    "docx",
    "txt",
    "tif",
    "rtf",
    "odt",
    "xlsx",
    "ods",
    "csv",
    "json",
    "pptx",
    "odp",
    "zip",
  ]),
  table: tableEvidenceSchema.optional(),
});
export type ConversionResult = z.infer<typeof conversionResultSchema>;
