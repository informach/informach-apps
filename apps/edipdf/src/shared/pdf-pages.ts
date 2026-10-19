import {
  PDFArray,
  PDFDict,
  type PDFDocument,
  PDFName,
  PDFNumber,
  type PDFObject,
  PDFPage,
  PDFPageLeaf,
  PDFRef,
} from "pdf-lib";

/** The page tree is authoritative: pdf-lib 1.17.1 does not invalidate getPages() after removePage(). */
export function livePdfPages(document: PDFDocument): PDFPage[] {
  const root = document.catalog.get(PDFName.of("Pages"));
  if (!(root instanceof PDFRef)) throw new Error("Árvore de páginas PDF sem raiz indireta.");
  const pages: PDFPage[] = [],
    seen = new Set<PDFObject>(),
    stack: { ref: PDFRef; depth: number; start?: number; count?: number }[] = [
      { ref: root, depth: 0 },
    ];
  while (stack.length) {
    const item = stack.pop();
    if (!item) break;
    if (item.start !== undefined) {
      if (pages.length - item.start !== item.count)
        throw new Error("Contagem inconsistente na árvore de páginas PDF.");
      continue;
    }
    if (item.depth > 256 || seen.size >= 200000)
      throw new Error("Árvore de páginas PDF acima do limite seguro.");
    const node = document.context.lookup(item.ref);
    if (!(node instanceof PDFDict) || seen.has(node))
      throw new Error("Árvore de páginas PDF inválida ou cíclica.");
    seen.add(node);
    if (node instanceof PDFPageLeaf) {
      if (pages.length >= 100000) throw new Error("PDF excede cem mil páginas.");
      pages.push(PDFPage.of(node, item.ref, document));
      continue;
    }
    const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray),
      count = node.lookupMaybe(PDFName.of("Count"), PDFNumber)?.asNumber();
    if (
      node.get(PDFName.of("Type")) !== PDFName.of("Pages") ||
      !kids ||
      count === undefined ||
      !Number.isInteger(count) ||
      count < 0 ||
      count > 100000
    )
      throw new Error("Nó da árvore de páginas PDF inválido.");
    stack.push({ ...item, start: pages.length, count });
    for (let index = kids.size() - 1; index >= 0; index--) {
      const child = kids.get(index);
      if (!(child instanceof PDFRef)) throw new Error("Referência de página PDF inválida.");
      stack.push({ ref: child, depth: item.depth + 1 });
    }
  }
  return pages;
}
