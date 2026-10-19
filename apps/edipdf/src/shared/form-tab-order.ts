import { PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, PDFRef } from "pdf-lib";
import { z } from "zod";

export interface WidgetTabEntry {
  id: string;
  name: string;
  label: string;
}
function pageWidgets(
  document: PDFDocument,
  index: number,
): { id: string; raw: PDFObject; dictionary: PDFDict }[] {
  const page = document.getPages()[z.number().int().nonnegative().parse(index)];
  if (!page) throw new Error("Página indisponível.");
  const annotations = page.node.Annots()?.asArray() ?? [];
  if (annotations.length > 10000) throw new Error("Página com anotações acima do limite local.");
  const result: { id: string; raw: PDFObject; dictionary: PDFDict }[] = [];
  for (const [at, raw] of annotations.entries()) {
    const dictionary = document.context.lookup(raw);
    if (!(dictionary instanceof PDFDict)) throw new Error("Anotação inválida na página.");
    if (dictionary.get(PDFName.of("Subtype")) === PDFName.of("Widget"))
      result.push({ id: raw instanceof PDFRef ? raw.toString() : `direct:${at}`, raw, dictionary });
  }
  if (result.length > 1000 || new Set(result.map((item) => item.id)).size !== result.length)
    throw new Error("Widgets duplicados ou acima do limite local.");
  return result;
}
export function pageWidgetTabOrder(document: PDFDocument, index: number): WidgetTabEntry[] {
  const fields = document.getForm().getFields(),
    widgets = new Map<PDFDict, string>();
  for (const field of fields)
    for (const widget of field.acroField.getWidgets()) widgets.set(widget.dict, field.getName());
  return pageWidgets(document, index).map((item, at) => {
    const name = widgets.get(item.dictionary);
    if (!name) throw new Error("Widget sem campo reconhecido. A ordem original foi preservada.");
    return { id: item.id, name, label: `${name} — controle ${at + 1}` };
  });
}

/** PDF 1.7 Adobe ExtensionLevel 3 defines /W: widgets follow their Annots order. */
export function setCustomWidgetTabOrder(
  document: PDFDocument,
  index: number,
  rawIds: string[],
): void {
  const ids = z
      .array(z.string().min(1))
      .min(1)
      .max(1000)
      .refine((values) => new Set(values).size === values.length)
      .parse(rawIds),
    widgets = pageWidgets(document, index),
    byId = new Map(widgets.map((item) => [item.id, item]));
  if (widgets.length !== ids.length || ids.some((id) => !byId.has(id)))
    throw new Error("A ordem deve conter todos os controles desta página uma única vez.");
  const page = document.getPages()[index];
  if (!page) throw new Error("Página indisponível.");
  const rawExtensions = document.catalog.get(PDFName.of("Extensions")),
    extensions = rawExtensions ? document.context.lookup(rawExtensions) : document.context.obj({});
  if (!(extensions instanceof PDFDict))
    throw new Error("Extensões PDF inválidas. A origem foi preservada.");
  const rawAdobe = extensions.get(PDFName.of("ADBE")),
    adobe = rawAdobe ? document.context.lookup(rawAdobe) : document.context.obj({});
  if (!(adobe instanceof PDFDict)) throw new Error("Extensão Adobe inválida.");
  const base = adobe.get(PDFName.of("BaseVersion")),
    level = adobe.get(PDFName.of("ExtensionLevel"));
  if (
    (base !== undefined && base !== PDFName.of("1.7")) ||
    (level !== undefined &&
      (!(level instanceof PDFNumber) ||
        !Number.isSafeInteger(level.asNumber()) ||
        level.asNumber() < 0))
  )
    throw new Error("Extensão Adobe fora do perfil local de tabulação.");
  const version = document.catalog.get(PDFName.of("Version"));
  if (
    version !== undefined &&
    (!(version instanceof PDFName) || !/^\/(1\.[0-7]|2\.0)$/.test(version.toString()))
  )
    throw new Error("Versão PDF fora do perfil de tabulação.");
  const ordered = ids.map((id) => {
    const widget = byId.get(id);
    if (!widget) throw new Error("Seleção de controles obsoleta.");
    return widget.raw;
  });
  let next = 0;
  const values = (page.node.Annots()?.asArray() ?? []).map((raw) => {
    const dictionary = document.context.lookup(raw);
    if (
      dictionary instanceof PDFDict &&
      dictionary.get(PDFName.of("Subtype")) === PDFName.of("Widget")
    ) {
      const value = ordered[next++];
      if (!value) throw new Error("A ordem de controles mudou.");
      return value;
    }
    return raw;
  });
  // All input/compatibility checks precede mutations. Existing providers and higher Adobe levels survive.
  if (version !== PDFName.of("2.0")) {
    adobe.set(PDFName.of("BaseVersion"), PDFName.of("1.7"));
    adobe.set(
      PDFName.of("ExtensionLevel"),
      PDFNumber.of(Math.max(3, level instanceof PDFNumber ? level.asNumber() : 0)),
    );
    extensions.set(PDFName.of("ADBE"), adobe);
    document.catalog.set(PDFName.of("Extensions"), extensions);
    document.catalog.set(PDFName.of("Version"), PDFName.of("1.7"));
  }
  page.node.set(PDFName.of("Annots"), document.context.obj(values));
  page.node.set(PDFName.of("Tabs"), PDFName.of("W"));
}
