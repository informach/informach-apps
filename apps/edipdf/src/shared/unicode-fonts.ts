import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";

export interface UnicodeFonts {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
  boldItalic: Uint8Array;
}
export function assertGlyphs(bytes: Uint8Array, text: string): void {
  const font = fontkit.create(bytes);
  for (const char of text) {
    if (char === "\n" || char === "\r" || char === "\t") continue;
    if (!font.hasGlyphForCodePoint(char.codePointAt(0) ?? 0))
      throw new Error(
        `A fonte não contém o caractere “${char}”. O texto foi preservado; escolha uma fonte que o contenha.`,
      );
  }
}
export async function embedUnicodeFont(
  doc: PDFDocument,
  bytes: Uint8Array,
  text: string,
): Promise<PDFFont> {
  assertGlyphs(bytes, text);
  doc.registerFontkit(fontkit);
  return doc.embedFont(bytes, { subset: true });
}
