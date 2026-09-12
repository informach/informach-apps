import "server-only";
import { PDFDocument } from "pdf-lib";
import type { z } from "zod";
import type { parseNoticeSchema } from "./schemas";

export async function prepareNoticeAttachment(
  attachment: z.infer<typeof parseNoticeSchema>["attachment"],
) {
  if (!attachment) return null;
  const [prefix, base64] = attachment.dataUrl.split(",");
  if (!prefix || !base64) throw new Error("INVALID_ATTACHMENT");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("ATTACHMENT_TOO_LARGE");
  const type = prefix.slice(5, -7);
  if (type === "application/pdf") {
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("INVALID_ATTACHMENT");
    const original = await PDFDocument.load(bytes, { updateMetadata: false });
    const count = original.getPageCount();
    if (count > 500) throw new Error("PDF_TOO_LONG");
    const pages =
      attachment.pages ?? (count <= 3 ? Array.from({ length: count }, (_, i) => i + 1) : []);
    if (
      !pages.length ||
      pages.length > 3 ||
      pages.some((p) => !Number.isInteger(p) || p < 1) ||
      new Set(pages).size !== pages.length ||
      pages.some((p) => p > count)
    )
      throw new Error("SELECT_PDF_PAGES");
    const selected = await PDFDocument.create();
    for (const page of await selected.copyPages(
      original,
      pages.map((p) => p - 1),
    ))
      selected.addPage(page);
    const selectedData = Buffer.from(await selected.save()).toString("base64");
    return {
      type,
      originalData: base64,
      dataUrl: `data:application/pdf;base64,${selectedData}`,
      pages,
      name: attachment.name,
    };
  }
  const valid =
    type === "image/png"
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : type === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : type === "image/webp" &&
          bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid) throw new Error("INVALID_ATTACHMENT");
  return {
    type,
    originalData: base64,
    dataUrl: attachment.dataUrl,
    pages: [],
    name: attachment.name,
  };
}
