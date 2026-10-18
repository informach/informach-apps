import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFObject,
  PDFRef,
  PDFStream,
} from "pdf-lib";
import { z } from "zod";
import { pruneUnreachable } from "./compress.ts";

export interface SanitizeOptions {
  metadata: boolean;
  attachments: boolean;
  comments: boolean;
  activeContent: boolean;
  hiddenData: boolean;
  flattenForms: boolean;
}
export const sanitizeOptionsSchema = z.object({
  metadata: z.boolean(),
  attachments: z.boolean(),
  comments: z.boolean(),
  activeContent: z.boolean(),
  hiddenData: z.boolean(),
  flattenForms: z.boolean(),
});
export const REDACTION_SANITIZE: SanitizeOptions = {
  metadata: true,
  attachments: true,
  comments: false,
  activeContent: true,
  hiddenData: true,
  flattenForms: true,
};

/** Remove document-level disclosure channels before a complete, non-incremental rewrite. */
export async function sanitizePdf(
  bytes: Uint8Array,
  options: SanitizeOptions,
): Promise<Uint8Array> {
  options = sanitizeOptionsSchema.parse(options);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (options.flattenForms && doc.catalog.has(PDFName.of("AcroForm"))) {
    const acroForm = doc.catalog.lookup(PDFName.of("AcroForm"), PDFDict);
    if (acroForm.has(PDFName.of("XFA")))
      throw new Error("Formulário XFA: converta-o para um PDF estático antes de sanitizar.");
    doc.getForm().flatten({ updateFieldAppearances: false });
    doc.catalog.delete(PDFName.of("AcroForm"));
  }
  if (options.metadata) {
    delete doc.context.trailerInfo.Info;
    doc.catalog.delete(PDFName.of("Metadata"));
  }
  if (options.hiddenData) {
    for (const key of ["StructTreeRoot", "MarkInfo", "PieceInfo", "SpiderInfo", "Collection", "AF"])
      doc.catalog.delete(PDFName.of(key));
  }
  const seen = new Set<PDFObject>();
  const visit = (object: PDFObject): void => {
    if (seen.has(object)) return;
    seen.add(object);
    if (object instanceof PDFRef) {
      const value = doc.context.lookup(object);
      if (value) visit(value);
    } else if (object instanceof PDFStream) visit(object.dict);
    else if (object instanceof PDFArray) {
      for (let i = 0; i < object.size(); i++) visit(object.get(i));
    } else if (object instanceof PDFDict) {
      if (options.metadata) object.delete(PDFName.of("Metadata"));
      if (options.hiddenData) {
        for (const key of [
          "ActualText",
          "Alt",
          "E",
          "PieceInfo",
          "LastModified",
          "PresSteps",
          "EdiOCRStream",
          "EdiOCRVersion",
          "EdiOCRReview",
        ])
          object.delete(PDFName.of(key));
      }
      if (options.activeContent) {
        for (const key of ["AA", "OpenAction", "JavaScript", "JS"]) object.delete(PDFName.of(key));
        const action = object.get(PDFName.of("S"));
        if (
          action instanceof PDFName &&
          [
            "JavaScript",
            "Launch",
            "SubmitForm",
            "ImportData",
            "Rendition",
            "Movie",
            "Sound",
            "GoToR",
            "GoToE",
          ].includes(action.decodeText())
        ) {
          for (const [key] of object.entries()) object.delete(key);
        }
      }
      if (options.attachments) {
        for (const key of ["EmbeddedFiles", "EF", "AF", "Collection"])
          object.delete(PDFName.of(key));
      }
      const annots = object.lookupMaybe(PDFName.of("Annots"), PDFArray);
      if (annots)
        for (let i = annots.size() - 1; i >= 0; i--) {
          const annot = annots.lookupMaybe(i, PDFDict);
          if (!annot) {
            annots.remove(i);
            continue;
          }
          const subtype = annot?.get(PDFName.of("Subtype"));
          const type = subtype instanceof PDFName ? subtype.decodeText() : "";
          if (
            (options.attachments && type === "FileAttachment") ||
            (options.activeContent &&
              ["RichMedia", "Movie", "Sound", "Screen", "3D"].includes(type)) ||
            (options.comments && !["Widget", "Link"].includes(type))
          )
            annots.remove(i);
        }
      for (const [, value] of object.entries()) visit(value);
    }
  };
  visit(doc.catalog);
  await doc.flush();
  pruneUnreachable(doc);
  return doc.save({ updateFieldAppearances: false });
}
