import {
  PDFDict,
  type PDFDocument,
  PDFHexString,
  PDFName,
  type PDFPage,
  PDFRef,
  PDFString,
} from "pdf-lib";

const n = PDFName.of;
export const formValueKey = (source: string, name: string): string => `${source}\u001f${name}`;

/** Register copied AcroForm roots under a deterministic source namespace. */
export function registerCopiedForms(doc: PDFDocument, pages: PDFPage[], prefix: string): string {
  const roots = new Set<PDFRef>();
  for (const page of pages) {
    const annotations = page.node.Annots();
    if (!annotations) continue;
    for (const value of annotations.asArray()) {
      const widget = doc.context.lookup(value);
      if (
        !(widget instanceof PDFDict) ||
        widget.get(n("Subtype")) !== n("Widget") ||
        !(value instanceof PDFRef)
      )
        continue;
      widget.set(n("P"), page.ref);
      let ref = value,
        field = widget;
      const visited = new Set<PDFRef>();
      while (field.get(n("Parent")) instanceof PDFRef) {
        if (visited.has(ref)) throw new Error("Árvore de formulário cíclica.");
        visited.add(ref);
        const parent = field.get(n("Parent"));
        if (!(parent instanceof PDFRef)) break;
        const dictionary = doc.context.lookup(parent);
        if (!(dictionary instanceof PDFDict)) throw new Error("Campo de formulário inválido.");
        ref = parent;
        field = dictionary;
      }
      roots.add(ref);
    }
  }
  if (!roots.size) return prefix;
  const originalPrefix = prefix;
  const names = doc
    .getForm()
    .getFields()
    .map((field) => field.getName());
  for (
    let suffix = 2;
    names.some((name) => name === prefix || name.startsWith(`${prefix}.`));
    suffix++
  )
    prefix = `${originalPrefix} (${suffix})`;
  const group = doc.context.obj({ T: PDFString.of(prefix), Kids: [...roots] });
  const groupRef = doc.context.register(group);
  for (const root of roots) doc.context.lookup(root, PDFDict).set(n("Parent"), groupRef);
  doc.catalog.getOrCreateAcroForm().addField(groupRef);
  return prefix;
}

/** Copies of a page share its original fields; they don't create unregistered clones. */
export function attachDuplicateWidgets(doc: PDFDocument, pages: PDFPage[]): void {
  const fields = doc.getForm().getFields();
  const nameOf = (dictionary: PDFDict): string => {
    const parts: string[] = [];
    const seen = new Set<PDFDict>();
    let field: PDFDict | undefined = dictionary;
    while (field) {
      if (seen.has(field)) throw new Error("Árvore de formulário cíclica.");
      seen.add(field);
      const part = field.get(n("T"));
      if (part instanceof PDFString || part instanceof PDFHexString)
        parts.unshift(part.decodeText());
      field = field.lookupMaybe(n("Parent"), PDFDict);
    }
    return parts.join(".");
  };
  for (const page of pages)
    for (const ref of page.node.Annots()?.asArray() ?? []) {
      const widget = doc.context.lookup(ref);
      if (
        !(widget instanceof PDFDict) ||
        widget.get(n("Subtype")) !== n("Widget") ||
        !(ref instanceof PDFRef)
      )
        continue;
      const original = fields.find((field) => field.getName() === nameOf(widget));
      if (!original) throw new Error("Campo duplicado sem origem.");
      widget.set(n("Parent"), original.ref);
      for (const key of ["T", "FT", "V", "DV", "Ff"]) widget.delete(n(key));
      widget.set(n("P"), page.ref);
      original.acroField.addWidget(ref);
    }
}
