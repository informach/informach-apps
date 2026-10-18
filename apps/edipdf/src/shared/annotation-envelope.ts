import { Unzlib } from "fflate";
import {
  type PDFDocument,
  PDFHexString,
  PDFName,
  type PDFObject,
  PDFRawStream,
  PDFRef,
  PDFString,
  pdfDocEncodingDecode,
} from "pdf-lib";
import { annotationEnvelopeSchema, annotationSchema } from "./document-format.ts";
import type { Annot } from "./model.ts";

const MAX_BYTES = 128 * 1024 * 1024;
export function decodePdfString(value: PDFString | PDFHexString): string {
  const bytes = value.asBytes();
  if (bytes.length > MAX_BYTES * 2)
    throw new Error("Modelo editável legado acima do limite local.");
  if (bytes[0] === 254 && bytes[1] === 255)
    return new TextDecoder("utf-16be", { fatal: true }).decode(bytes);
  if (bytes[0] === 255 && bytes[1] === 254)
    return new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
  // PDFDocEncoding is single-byte. Bounded chunks avoid the library's unbounded spread of code points.
  const parts: string[] = [];
  for (let at = 0; at < bytes.length; at += 16384)
    parts.push(pdfDocEncodingDecode(bytes.subarray(at, at + 16384)));
  return parts.join("");
}
export function readAnnotationEnvelope(
  doc: PDFDocument,
  raw: PDFObject | undefined,
): { version: number; annotation: Annot } | undefined {
  if (!raw) return undefined;
  const value = raw instanceof PDFRef ? doc.context.lookup(raw) : raw;
  let text: string;
  if (value instanceof PDFString || value instanceof PDFHexString) text = decodePdfString(value);
  else if (value instanceof PDFRawStream) {
    const contents = value.getContents(),
      filter = value.dict.get(PDFName.of("Filter"));
    if (
      contents.length > 64 * 1024 * 1024 ||
      (filter !== undefined && filter !== PDFName.of("FlateDecode")) ||
      value.dict.has(PDFName.of("DecodeParms"))
    )
      throw new Error("Compressão do modelo editável fora do perfil local.");
    let bytes: Uint8Array;
    if (filter === undefined) bytes = contents;
    else {
      const parts: Uint8Array[] = [];
      let length = 0;
      const decoder = new Unzlib((chunk) => {
        length += chunk.length;
        if (length > MAX_BYTES)
          throw new Error("O modelo editável expandido excede o limite local.");
        parts.push(new Uint8Array(chunk));
      });
      for (let at = 0; at < contents.length; at += 4096)
        decoder.push(contents.subarray(at, at + 4096), at + 4096 >= contents.length);
      bytes = new Uint8Array(length);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
      }
    }
    if (bytes.length > MAX_BYTES) throw new Error("Modelo editável acima do limite local.");
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } else throw new Error("Modelo editável com representação inválida. A origem foi preservada.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Modelo editável corrompido. A origem foi preservada.");
  }
  if (parsed && typeof parsed === "object" && "version" in parsed)
    return annotationEnvelopeSchema.parse(parsed);
  return { version: 0, annotation: annotationSchema.parse(parsed) };
}
export function writeAnnotationEnvelope(doc: PDFDocument, annotation: Annot): PDFObject {
  const legacy = JSON.stringify({ version: 1, annotation });
  if (annotation.kind !== "paragraph" && legacy.length <= 32768)
    return PDFHexString.fromText(legacy);
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 2, annotation }));
  if (bytes.length > MAX_BYTES) throw new Error("Modelo editável acima do limite local.");
  return doc.context.register(doc.context.flateStream(bytes));
}
