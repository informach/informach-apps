import { Unzlib } from "fflate";
import {
  PDFArray,
  PDFDict,
  type PDFDocument,
  PDFName,
  type PDFObject,
  PDFRawStream,
} from "pdf-lib";

/** Bounded TrueType decoding; compressed font data is never passed to an unbounded inflate. */
export function readTrueTypeProgram(document: PDFDocument, raw: PDFObject): Uint8Array {
  let font = document.context.lookup(raw);
  if (!(font instanceof PDFDict)) throw new Error("Fonte de campo inválida.");
  if (font.get(PDFName.of("Subtype")) === PDFName.of("Type0")) {
    const descendants = font.lookup(PDFName.of("DescendantFonts"));
    if (!(descendants instanceof PDFArray) || descendants.size() !== 1)
      throw new Error("Fonte composta fora do perfil local.");
    font = document.context.lookup(descendants.get(0));
    if (!(font instanceof PDFDict)) throw new Error("Fonte descendente inválida.");
  }
  const descriptor = font.lookup(PDFName.of("FontDescriptor"));
  if (!(descriptor instanceof PDFDict)) throw new Error("Fonte sem programa TrueType incorporado.");
  const program = descriptor.lookup(PDFName.of("FontFile2"));
  if (!(program instanceof PDFRawStream))
    throw new Error("Fonte sem programa TrueType incorporado.");
  const filter = program.dict.get(PDFName.of("Filter")),
    contents = program.getContents(),
    max = 8 * 1024 * 1024;
  if (
    contents.length > max ||
    program.dict.has(PDFName.of("DecodeParms")) ||
    (filter !== undefined && filter !== PDFName.of("FlateDecode"))
  )
    throw new Error("Compressão de fonte fora do perfil local.");
  if (filter === undefined) return new Uint8Array(contents);
  const parts: Uint8Array[] = [];
  let length = 0;
  const decoder = new Unzlib((chunk) => {
    length += chunk.length;
    if (length > max) throw new Error("A fonte expandida ultrapassa 8 MB.");
    parts.push(new Uint8Array(chunk));
  });
  for (let at = 0; at < contents.length; at += 4096)
    decoder.push(contents.subarray(at, at + 4096), at + 4096 >= contents.length);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
