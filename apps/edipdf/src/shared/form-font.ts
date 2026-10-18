import {
  PDFDict,
  type PDFDocument,
  PDFDropdown,
  type PDFField,
  type PDFFont,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFRef,
  PDFTextField,
  StandardFonts,
} from "pdf-lib";
import { readTrueTypeProgram } from "./font-program.ts";
import { choiceAppearance, choiceOptions } from "./form-choice.ts";
import { embedParagraphFont } from "./paragraph-font.ts";

const fontCache = new WeakMap<
  PDFDocument,
  Map<string, Promise<{ font: PDFFont; coverage: Set<number> }>>
>();
const fontPrograms = new WeakMap<PDFDocument, Map<PDFRef, Uint8Array>>();
/** Editable controls need a full font for later input, shared by all controls in this PDF. */
export async function embedFormFont(
  document: PDFDocument,
  bytes: Uint8Array,
  text: string,
): Promise<PDFFont> {
  if (bytes.length < 12 || bytes.length > 8 * 1024 * 1024)
    throw new Error("Fonte de formulário fora do limite local de 8 MB.");
  const owned = new Uint8Array(bytes),
    digest = new Uint8Array(await crypto.subtle.digest("SHA-256", owned.buffer)),
    key = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  let cache = fontCache.get(document);
  if (!cache) {
    cache = new Map();
    fontCache.set(document, cache);
  }
  let pending = cache.get(key);
  if (!pending) {
    const current = cache;
    pending = embedParagraphFont(document, owned, "", { full: true })
      .then((font) => {
        let programs = fontPrograms.get(document);
        if (!programs) {
          programs = new Map();
          fontPrograms.set(document, programs);
        }
        programs.set(font.ref, owned);
        return { font, coverage: new Set(font.getCharacterSet()) };
      })
      .catch((failure: unknown) => {
        current.delete(key);
        throw failure;
      });
    cache.set(key, pending);
  }
  const embedded = await pending;
  for (const char of text.normalize("NFC"))
    if (!/[\r\n\t]/u.test(char) && !embedded.coverage.has(char.codePointAt(0) ?? 0))
      throw new Error(
        `A fonte não contém o caractere “${char}”. Escolha outra fonte para o campo.`,
      );
  return embedded.font;
}

function requiredText(field: PDFField): string {
  if (field instanceof PDFTextField) return field.getText() ?? "";
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const options = choiceOptions(field);
    const exports = new Set(options.map((option) => option.exportValue));
    return [
      ...options.map((option) => option.displayValue),
      ...field.getSelected().filter((value) => !exports.has(value)),
    ].join("");
  }
  return "";
}
export async function setFormWidgetFont(
  document: PDFDocument,
  name: string,
  bytes: Uint8Array,
): Promise<void> {
  const field = document.getForm().getField(name);
  if (
    !(
      field instanceof PDFTextField ||
      field instanceof PDFDropdown ||
      field instanceof PDFOptionList
    )
  )
    throw new Error("Escolha um campo de texto, lista ou seleção para aplicar a fonte.");
  const font = await embedFormFont(document, bytes, requiredText(field));
  if (field instanceof PDFDropdown || field instanceof PDFOptionList)
    field.updateAppearances(font, choiceAppearance);
  else field.updateAppearances(font);
  rememberWidgetFont(document, field, font);
}
export function rememberWidgetFont(document: PDFDocument, field: PDFField, font: PDFFont): void {
  field.acroField.dict.set(
    PDFName.of("EdiWidgetFont"),
    document.context.obj({ Version: 1, Font: font.ref }),
  );
}
/** Validate only fields whose appearances actually need rebuilding; imported clean widgets retain their AP. */
export async function updateDirtyFormAppearances(
  document: PDFDocument,
  bytes?: Uint8Array,
): Promise<void> {
  const form = document.getForm(),
    dirty = form.getFields().filter((field) => field.needsAppearancesUpdate());
  if (!dirty.length) return;
  for (const field of dirty) {
    const raw = field.acroField.dict.get(PDFName.of("EdiWidgetFont"));
    if (!raw) continue;
    const metadata = document.context.lookup(raw);
    if (
      !(metadata instanceof PDFDict) ||
      !(metadata.get(PDFName.of("Version")) instanceof PDFNumber) ||
      String(metadata.get(PDFName.of("Version"))) !== "1"
    )
      throw new Error("Versão de fonte de campo não suportada. A origem foi preservada.");
    const ref = metadata.get(PDFName.of("Font"));
    if (!(ref instanceof PDFRef))
      throw new Error("Referência de fonte de campo ausente ou inválida.");
    // A newly embedded font may not have a stream yet. Its owned bytes are already validated.
    const program = fontPrograms.get(document)?.get(ref) ?? readTrueTypeProgram(document, ref);
    await setFormWidgetFont(document, field.getName(), program);
  }
  const remaining = form.getFields().filter((field) => field.needsAppearancesUpdate());
  if (!remaining.length) return;
  const fallback = bytes
    ? await embedFormFont(document, bytes, remaining.map(requiredText).join(""))
    : await document.embedFont(StandardFonts.Helvetica);
  for (const field of remaining) {
    if (field instanceof PDFDropdown || field instanceof PDFOptionList)
      field.updateAppearances(fallback, choiceAppearance);
    else field.defaultUpdateAppearances(fallback);
  }
}
