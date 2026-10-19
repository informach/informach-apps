import {
  PDFDict,
  type PDFDocument,
  PDFDropdown,
  type PDFField,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFTextField,
} from "pdf-lib";
import { readTrueTypeProgram } from "./font-program.ts";

export type WidgetFont =
  | {
      kind: "builtin";
      family: "serif" | "sans-serif" | "monospace";
      bold: boolean;
      italic: boolean;
    }
  | { kind: "truetype"; bytes: Uint8Array }
  | { kind: "fallback"; reason: string };

/** Shared font-program buffers are transient source data, never duplicated into renderer document state. */
export function widgetFonts(document: PDFDocument): Map<string, WidgetFont> {
  const result = new Map<string, WidgetFont>(),
    programs = new Map<PDFDict, Uint8Array>(),
    rejected = new Map<PDFDict, string>();
  let total = 0;
  const read = (field: PDFField): WidgetFont => {
    const authoredRaw = field.acroField.dict.get(PDFName.of("EdiWidgetFont"));
    let font: unknown;
    if (authoredRaw) {
      const metadata = document.context.lookup(authoredRaw);
      if (
        !(metadata instanceof PDFDict) ||
        !(metadata.get(PDFName.of("Version")) instanceof PDFNumber) ||
        String(metadata.get(PDFName.of("Version"))) !== "1"
      )
        throw new Error("Versão da fonte de campo não reconhecida.");
      const ref = metadata.get(PDFName.of("Font"));
      if (!ref) throw new Error("Fonte de campo sem referência.");
      font = document.context.lookup(ref);
    } else {
      const widget = field.acroField.getWidgets()[0],
        appearance = widget?.dict.lookup(PDFName.of("AP"));
      if (!(appearance instanceof PDFDict))
        throw new Error("Campo sem aparência de fonte reconhecível.");
      const normal = appearance.lookup(PDFName.of("N"));
      if (!normal || !("dict" in normal) || !(normal.dict instanceof PDFDict))
        throw new Error("Aparência de campo fora do perfil tipográfico.");
      const resources = normal.dict.lookup(PDFName.of("Resources"));
      if (!(resources instanceof PDFDict)) throw new Error("Campo sem recursos de fonte.");
      const fonts = resources.lookup(PDFName.of("Font"));
      if (!(fonts instanceof PDFDict) || fonts.entries().length !== 1)
        throw new Error("Campo com fontes múltiplas ou ausentes ainda exige revisão tipográfica.");
      const entry = fonts.entries()[0];
      if (!entry) throw new Error("Campo sem fonte.");
      font = document.context.lookup(entry[1]);
    }
    if (!(font instanceof PDFDict)) throw new Error("Fonte de campo inválida.");
    const name = font.get(PDFName.of("BaseFont"));
    if (!(name instanceof PDFName) || name.toString().length > 512)
      throw new Error("Nome de fonte inválido.");
    const base = name.decodeText();
    const family = /^(Courier)(-|$)/.test(base)
      ? "monospace"
      : /^(Times)(-|$)/.test(base)
        ? "serif"
        : /^(Helvetica)(-|$)/.test(base)
          ? "sans-serif"
          : undefined;
    if (family)
      return {
        kind: "builtin",
        family,
        bold: /Bold/.test(base),
        italic: /Italic|Oblique/.test(base),
      };
    if (/^[A-Z]{6}\+/.test(base))
      throw new Error("Fonte incorporada em subconjunto ainda fora da prévia de campos.");
    const previousFailure = rejected.get(font);
    if (previousFailure) throw new Error(previousFailure);
    let bytes = programs.get(font);
    if (!bytes) {
      if (programs.size + rejected.size >= 32)
        throw new Error("Mais de 32 fontes de campos neste documento.");
      try {
        bytes = readTrueTypeProgram(document, font);
      } catch (failure) {
        const reason = failure instanceof Error ? failure.message : "Fonte de campo inválida.";
        rejected.set(font, reason);
        throw failure;
      }
      if (total + bytes.length > 32 * 1024 * 1024) {
        rejected.set(font, "Fontes de campos acima do orçamento de 32 MB.");
        throw new Error("Fontes de campos acima do orçamento de 32 MB.");
      }
      total += bytes.length;
      programs.set(font, bytes);
    }
    return { kind: "truetype", bytes };
  };
  for (const field of document.getForm().getFields()) {
    if (
      !(
        field instanceof PDFTextField ||
        field instanceof PDFDropdown ||
        field instanceof PDFOptionList
      )
    )
      continue;
    try {
      result.set(field.getName(), read(field));
    } catch (failure) {
      result.set(field.getName(), {
        kind: "fallback",
        reason: failure instanceof Error ? failure.message : "Fonte de campo não disponível.",
      });
    }
  }
  return result;
}
