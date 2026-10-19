import {
  PDFArray,
  PDFDict,
  type PDFDocument,
  PDFName,
  PDFNull,
  PDFNumber,
  type PDFObject,
  PDFRef,
} from "pdf-lib";
import { livePdfPages } from "./pdf-pages.ts";

/** Reconcile tags and parent/id indexes when pages disappear, preserving tags on live pages. */
export function reconcileStructureTree(doc: PDFDocument, removedPages: Set<PDFRef>): void {
  const n = PDFName.of;
  const resolve = (value: PDFObject | undefined): PDFObject | undefined =>
    value instanceof PDFRef ? doc.context.lookup(value) : value;
  const root = resolve(doc.catalog.get(n("StructTreeRoot")));
  if (!(root instanceof PDFDict)) return;
  const removed = new Set<PDFObject>();
  const visiting = new Set<PDFObject>();
  const cleaned = new Map<PDFObject, PDFObject | undefined>();
  let count = 0;
  const clean = (value: PDFObject, inheritedPage?: PDFObject, depth = 0): PDFObject | undefined => {
    const object = resolve(value);
    if (!object || object === PDFNull) return undefined;
    if (depth > 100 || ++count > 1_000_000)
      throw new Error("Estrutura de acessibilidade acima do limite de revisão segura.");
    if (object instanceof PDFNumber)
      return inheritedPage instanceof PDFRef && removedPages.has(inheritedPage) ? undefined : value;
    if (cleaned.has(object)) return cleaned.get(object) ? value : undefined;
    if (visiting.has(object))
      throw new Error("Estrutura de acessibilidade circular. O arquivo foi preservado.");
    visiting.add(object);
    let result: PDFObject | undefined = value;
    if (object instanceof PDFArray) {
      for (let i = object.size() - 1; i >= 0; i--)
        if (!clean(object.get(i), inheritedPage, depth + 1)) object.remove(i);
      if (!object.size()) result = undefined;
    } else if (object instanceof PDFDict) {
      const page = object.get(n("Pg")) ?? inheritedPage;
      const dead = page instanceof PDFRef && removedPages.has(page);
      const child = object.get(n("K"));
      const childrenBefore = resolve(child);
      const before = childrenBefore instanceof PDFArray ? childrenBefore.size() : child ? 1 : 0;
      const next = child ? clean(child, page, depth + 1) : undefined;
      const childrenAfter = resolve(next);
      const after = childrenAfter instanceof PDFArray ? childrenAfter.size() : next ? 1 : 0;
      if (next) object.set(n("K"), next);
      else object.delete(n("K"));
      const target = resolve(object.get(n("Obj")));
      const targetPage = target instanceof PDFDict ? target.get(n("P")) : undefined;
      const deadTarget = targetPage instanceof PDFRef && removedPages.has(targetPage);
      if ((dead && !next) || deadTarget) result = undefined;
      else if (dead || before !== after) {
        if (dead) object.delete(n("Pg"));
        for (const key of ["ActualText", "Alt", "E", "T"]) object.delete(n(key));
      }
    } else throw new Error("Estrutura de acessibilidade inválida. O arquivo foi preservado.");
    visiting.delete(object);
    cleaned.set(object, result);
    if (!result) {
      removed.add(value);
      removed.add(object);
    }
    return result;
  };
  const kids = root.get(n("K"));
  const kept = kids ? clean(kids) : undefined;
  if (kept) root.set(n("K"), kept);
  else root.delete(n("K"));
  const indexes = new Set<PDFObject>();
  const cleanIndex = (value: PDFObject | undefined, type: "Nums" | "Names", depth = 0): boolean => {
    const object = resolve(value);
    if (!(object instanceof PDFDict)) return false;
    if (depth > 100 || indexes.has(object))
      throw new Error("Índice da estrutura de acessibilidade inválido.");
    indexes.add(object);
    const entries = object.lookupMaybe(n(type), PDFArray);
    if (entries) {
      if (entries.size() % 2) throw new Error("Índice da estrutura de acessibilidade incompleto.");
      for (let i = entries.size() - 2; i >= 0; i -= 2) {
        const reference = entries.get(i + 1),
          entry = resolve(reference);
        let live = !removed.has(reference) && !!entry && !removed.has(entry);
        if (entry instanceof PDFArray) {
          let liveCount = 0;
          for (let j = 0; j < entry.size(); j++) {
            const ref = entry.get(j),
              target = resolve(ref);
            if (removed.has(ref) || !target || removed.has(target) || !clean(ref))
              entry.set(j, PDFNull);
            else if (target !== PDFNull) liveCount++;
          }
          live = liveCount > 0;
        } else if (live && entry instanceof PDFDict) live = !!clean(reference);
        if (!live) {
          entries.remove(i + 1);
          entries.remove(i);
        }
      }
    }
    const children = object.lookupMaybe(n("Kids"), PDFArray);
    if (children)
      for (let i = children.size() - 1; i >= 0; i--)
        if (!cleanIndex(children.get(i), type, depth + 1)) children.remove(i);
    const bounds: PDFObject[] = [];
    if (entries?.size()) bounds.push(entries.get(0), entries.get(entries.size() - 2));
    if (children)
      for (let i = 0; i < children.size(); i++) {
        const limits = children.lookup(i, PDFDict).lookupMaybe(n("Limits"), PDFArray);
        if (limits?.size() === 2) bounds.push(limits.get(0), limits.get(1));
      }
    if (bounds.length)
      object.set(n("Limits"), doc.context.obj([bounds[0], bounds[bounds.length - 1]]));
    else object.delete(n("Limits"));
    indexes.delete(object);
    return !!bounds.length;
  };
  for (const [key, type] of [
    ["ParentTree", "Nums"],
    ["IDTree", "Names"],
  ] as const)
    if (root.has(n(key))) {
      if (!cleanIndex(root.get(n(key)), type)) root.delete(n(key));
    }
  if (!kept) {
    doc.catalog.delete(n("StructTreeRoot"));
    doc.catalog.delete(n("MarkInfo"));
    for (const page of livePdfPages(doc)) page.node.delete(n("StructParents"));
  }
}
