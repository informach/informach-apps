import {
  PDFArray,
  PDFDict,
  type PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  type PDFObject,
  PDFRef,
  PDFStream,
  PDFString,
} from "pdf-lib";
import { livePdfPages } from "./pdf-pages.ts";
import { reconcileStructureTree } from "./pdf-structure.ts";

const name = PDFName.of;
const textOf = (value: PDFObject | undefined): string | undefined =>
  value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : undefined;

/** Repair references before garbage collection. A removed page must not remain reachable. */
export function reconcilePageReferences(doc: PDFDocument): void {
  const pages = livePdfPages(doc),
    live = new Set(pages.map((page) => page.ref));
  const removed = new Set<PDFRef>();
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict && object.get(name("Type")) === name("Page") && !live.has(ref))
      removed.add(ref);
  }
  if (!removed.size) return;
  reconcileStructureTree(doc, removed);
  const resolve = (value: PDFObject | undefined): PDFObject | undefined =>
    value instanceof PDFRef ? doc.context.lookup(value) : value;
  const removedNames = new Set<string>();
  const isRemoved = (value: PDFObject | undefined): boolean =>
    value instanceof PDFRef && removed.has(value);
  const deadDestination = (value: PDFObject | undefined): boolean => {
    const object = resolve(value);
    if (object instanceof PDFArray) return object.size() > 0 && isRemoved(object.get(0));
    if (object instanceof PDFDict) return deadDestination(object.get(name("D")));
    const text = textOf(object) ?? (object instanceof PDFName ? object.decodeText() : undefined);
    return text !== undefined && removedNames.has(text);
  };
  const deadAction = (value: PDFObject | undefined): boolean => {
    const action = resolve(value);
    return (
      action instanceof PDFDict &&
      action.get(name("S")) === name("GoTo") &&
      deadDestination(action.get(name("D")))
    );
  };

  const destinations = doc.catalog.lookupMaybe(name("Dests"), PDFDict);
  if (destinations) {
    for (const [key, value] of destinations.entries()) {
      if (deadDestination(value)) {
        removedNames.add(key.decodeText());
        destinations.delete(key);
      }
    }
  }
  const visitedNames = new Set<PDFDict>();
  const cleanNames = (node: PDFDict): [PDFObject, PDFObject] | null => {
    if (visitedNames.has(node)) throw new Error("Árvore de destinos cíclica no PDF.");
    visitedNames.add(node);
    const entries = node.lookupMaybe(name("Names"), PDFArray);
    let bounds: [PDFObject, PDFObject] | null = null;
    if (entries) {
      if (entries.size() % 2) throw new Error("Árvore de destinos inválida no PDF.");
      for (let i = entries.size() - 2; i >= 0; i -= 2) {
        if (!deadDestination(entries.get(i + 1))) continue;
        const key = textOf(entries.get(i));
        if (key !== undefined) removedNames.add(key);
        entries.remove(i + 1);
        entries.remove(i);
      }
      if (entries.size()) bounds = [entries.get(0), entries.get(entries.size() - 2)];
    }
    const kids = node.lookupMaybe(name("Kids"), PDFArray);
    if (kids)
      for (let i = kids.size() - 1; i >= 0; i--) {
        const child = resolve(kids.get(i));
        if (!(child instanceof PDFDict)) throw new Error("Destino filho inválido no PDF.");
        const childBounds = cleanNames(child);
        if (!childBounds) kids.remove(i);
        else bounds = [childBounds[0], bounds?.[1] ?? childBounds[1]];
      }
    if (bounds) node.set(name("Limits"), doc.context.obj(bounds));
    else node.delete(name("Limits"));
    return bounds;
  };
  const names = doc.catalog.lookupMaybe(name("Names"), PDFDict);
  const tree = names?.lookupMaybe(name("Dests"), PDFDict);
  if (tree) cleanNames(tree);

  // Widgets on deleted pages must be detached even if another widget of the same field survives.
  const acroForm = doc.catalog.lookupMaybe(name("AcroForm"), PDFDict);
  if (acroForm) {
    if (acroForm.has(name("XFA")))
      throw new Error("Este formulário XFA precisa ser convertido antes de reorganizar páginas.");
    const form = doc.getForm();
    for (const field of form.getFields()) {
      const widgets = field.acroField.getWidgets();
      const dead = widgets
        .map((widget, i) => (isRemoved(widget.P()) ? i : -1))
        .filter((i) => i >= 0);
      if (!dead.length) continue;
      if (dead.length === widgets.length) form.acroForm.removeField(field.acroField);
      else for (const index of dead.reverse()) field.acroField.removeWidget(index);
    }
  }

  const outlinesSeen = new Set<PDFDict>();
  const cleanOutline = (parent: PDFDict, parentRef: PDFRef | undefined): number => {
    if (outlinesSeen.has(parent)) throw new Error("Árvore de marcadores cíclica no PDF.");
    outlinesSeen.add(parent);
    const keep: { ref: PDFObject; dict: PDFDict; descendants: number }[] = [];
    let current = parent.get(name("First"));
    while (current) {
      const dict = resolve(current);
      if (!(dict instanceof PDFDict)) throw new Error("Marcador inválido no PDF.");
      const next = dict.get(name("Next"));
      const descendants = cleanOutline(dict, current instanceof PDFRef ? current : undefined);
      const dead = deadDestination(dict.get(name("Dest"))) || deadAction(dict.get(name("A")));
      if (dead) {
        dict.delete(name("Dest"));
        dict.delete(name("A"));
      }
      if (!dead || descendants) keep.push({ ref: current, dict, descendants });
      current = next;
    }
    parent.delete(name("First"));
    parent.delete(name("Last"));
    const total = keep.reduce(
      (sum, item) =>
        sum +
        1 +
        ((item.dict.lookupMaybe(name("Count"), PDFNumber)?.asNumber() ?? 0) > 0
          ? item.descendants
          : 0),
      0,
    );
    if (keep.length) {
      parent.set(name("First"), keep[0].ref);
      parent.set(name("Last"), keep[keep.length - 1].ref);
    }
    const oldCount = parent.lookupMaybe(name("Count"), PDFNumber)?.asNumber() ?? 0;
    parent.set(name("Count"), PDFNumber.of(oldCount < 0 ? -total : total));
    keep.forEach((item, i) => {
      item.dict.delete(name("Prev"));
      item.dict.delete(name("Next"));
      if (i) item.dict.set(name("Prev"), keep[i - 1].ref);
      if (i + 1 < keep.length) item.dict.set(name("Next"), keep[i + 1].ref);
      if (parentRef) item.dict.set(name("Parent"), parentRef);
    });
    return total;
  };
  const outlineRef = doc.catalog.get(name("Outlines"));
  const outline = resolve(outlineRef);
  if (outline instanceof PDFDict)
    cleanOutline(outline, outlineRef instanceof PDFRef ? outlineRef : undefined);
  if (
    deadDestination(doc.catalog.get(name("OpenAction"))) ||
    deadAction(doc.catalog.get(name("OpenAction")))
  )
    doc.catalog.delete(name("OpenAction"));
  for (const page of pages) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const annot = resolve(annots.get(i));
      if (
        annot instanceof PDFDict &&
        (deadDestination(annot.get(name("Dest"))) || deadAction(annot.get(name("A"))))
      )
        annots.remove(i);
    }
  }

  // Other reference-bearing structures (tags, threads, private extensions) cannot resurrect pages.
  const seen = new Set<PDFObject>();
  const visit = (object: PDFObject): void => {
    if (seen.has(object)) return;
    seen.add(object);
    if (object instanceof PDFRef) {
      if (!removed.has(object)) {
        const target = resolve(object);
        if (target) visit(target);
      }
    } else if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) {
        if (value instanceof PDFRef && removed.has(value)) object.delete(key);
        else visit(value);
      }
    } else if (object instanceof PDFArray) {
      for (let i = object.size() - 1; i >= 0; i--) {
        const value = object.get(i);
        if (value instanceof PDFRef && removed.has(value)) object.remove(i);
        else visit(value);
      }
    } else if (object instanceof PDFStream) visit(object.dict);
  };
  visit(doc.catalog);
}
