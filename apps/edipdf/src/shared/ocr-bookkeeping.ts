import { PDFDocument, PDFName } from "pdf-lib";
import { pruneUnreachable } from "./compress.ts";

/** Native content rewrites invalidate stream ownership; remove pointers before the rewrite.
 * The live OCR layer remains in Contents. Historical/private copies cannot keep an old stream alive. */
export async function clearOcrBookkeeping(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  let changed = false;
  for (const index of new Set(pages)) {
    if (!Number.isInteger(index) || index < 0 || index >= document.getPageCount())
      throw new Error("Página de edição inexistente.");
    const page = document.getPage(index);
    for (const key of ["EdiOCRStream", "EdiOCRVersion", "EdiOCRReview"]) {
      if (page.node.has(PDFName.of(key))) {
        page.node.delete(PDFName.of(key));
        changed = true;
      }
    }
  }
  if (!changed) return bytes;
  await document.flush();
  pruneUnreachable(document);
  return document.save({ updateFieldAppearances: false });
}
