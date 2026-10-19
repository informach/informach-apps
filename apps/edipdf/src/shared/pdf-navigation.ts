import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  type PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  type PDFPage,
  PDFRawStream,
  PDFRef,
  PDFString,
} from "pdf-lib";
import { z } from "zod";
import { type Box, pdfToView, type Rotation, viewToPdf } from "./model.ts";

const n = PDFName.of;
const textOf = (value: unknown): string =>
  value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : "";
const refOf = (document: PDFDocument, key: string): PDFRef => {
  const parts = /^(\d+) (\d+) R$/.exec(key);
  if (!parts) throw new Error("Referência PDF inválida.");
  const number = Number(parts[1]),
    generation = Number(parts[2]);
  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > 2147483647 ||
    !Number.isSafeInteger(generation) ||
    generation > 65535
  )
    throw new Error("Referência PDF inválida.");
  const ref = PDFRef.of(number, generation);
  if (!document.context.lookup(ref))
    throw new Error("A referência do documento não está mais disponível.");
  return ref;
};
export const webUrlSchema = z
  .string()
  .max(8192)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use um endereço http:// ou https:// sem credenciais.");
export interface Bookmark {
  id: string;
  title: string;
  level: number;
  parent?: string;
  page?: number;
}
export interface PdfLink {
  id: string;
  page: number;
  box: Box;
  targetPage?: number;
  url?: string;
  unsupported: boolean;
}
export interface PdfAttachment {
  id: string;
  name: string;
  description: string;
  bytes: Uint8Array;
}
function destinationPage(document: PDFDocument, value: unknown): number | undefined {
  const visited = new Set<string>();
  const dictionaries = new Set<PDFDict>();
  while (
    value instanceof PDFName ||
    value instanceof PDFString ||
    value instanceof PDFHexString ||
    value instanceof PDFDict
  ) {
    if (value instanceof PDFDict) {
      if (dictionaries.has(value) || dictionaries.size > 100) throw new Error("Destino cíclico.");
      dictionaries.add(value);
      value = value.lookup(n("D"));
      continue;
    }
    const name = value instanceof PDFName ? value.decodeText() : value.decodeText();
    if (visited.has(name) || visited.size > 100) throw new Error("Destino nomeado cíclico.");
    visited.add(name);
    let resolved: unknown = document.catalog.lookupMaybe(n("Dests"), PDFDict)?.lookup(n(name));
    if (!resolved) {
      const tree = document.catalog
          .lookupMaybe(n("Names"), PDFDict)
          ?.lookupMaybe(n("Dests"), PDFDict),
        seen = new Set<PDFDict>();
      const walk = (node: PDFDict): unknown => {
        if (seen.has(node) || seen.size > 10000)
          throw new Error("Árvore de destinos cíclica ou acima do limite.");
        seen.add(node);
        const names = node.lookupMaybe(n("Names"), PDFArray);
        if (names)
          for (let index = 0; index < names.size(); index += 2)
            if (textOf(names.get(index)) === name)
              return document.context.lookup(names.get(index + 1));
        for (const child of node.lookupMaybe(n("Kids"), PDFArray)?.asArray() ?? []) {
          const found = walk(document.context.lookup(child, PDFDict));
          if (found) return found;
        }
        return undefined;
      };
      if (tree) resolved = walk(tree);
    }
    value = resolved;
  }
  if (!(value instanceof PDFArray)) return undefined;
  const reference = value.get(0),
    pages = document.getPages();
  const page = pages.findIndex((page) => page.ref === reference);
  if (page >= 0) return page;
  return reference instanceof PDFNumber &&
    Number.isInteger(reference.asNumber()) &&
    reference.asNumber() >= 0 &&
    reference.asNumber() < pages.length
    ? reference.asNumber()
    : undefined;
}
function destination(document: PDFDocument, dictionary: PDFDict): number | undefined {
  const action = dictionary.lookupMaybe(n("A"), PDFDict);
  return destinationPage(
    document,
    dictionary.lookup(n("Dest")) ??
      (action?.get(n("S")) === n("GoTo") ? action.lookup(n("D")) : undefined),
  );
}
export function bookmarks(document: PDFDocument): Bookmark[] {
  const root = document.catalog.lookupMaybe(n("Outlines"), PDFDict),
    out: Bookmark[] = [],
    seen = new Set<PDFRef>();
  const walk = (raw: unknown, level: number, parent?: string): void => {
    if (level > 100) throw new Error("Marcadores excedem o limite de profundidade.");
    let value = raw;
    while (value instanceof PDFRef) {
      if (seen.has(value) || out.length >= 10000)
        throw new Error("Árvore de marcadores cíclica ou acima do limite.");
      seen.add(value);
      const item = document.context.lookup(value, PDFDict),
        id = value.toString();
      out.push({
        id,
        title: textOf(item.lookup(n("Title"))),
        level,
        parent,
        page: destination(document, item),
      });
      walk(item.get(n("First")), level + 1, id);
      value = item.get(n("Next"));
    }
  };
  walk(root?.get(n("First")), 0);
  return out;
}
const bookmarkInput = z.object({
  title: z.string().trim().min(1).max(1000),
  page: z.number().int().nonnegative(),
  parent: z.string().optional(),
});
function recountBookmarks(document: PDFDocument): void {
  const items = bookmarks(document),
    root = document.catalog.lookupMaybe(n("Outlines"), PDFDict);
  const visible = new Map<string | undefined, number>();
  for (const item of [...items].reverse()) {
    const dict = document.context.lookup(refOf(document, item.id), PDFDict);
    const count = visible.get(item.id) ?? 0;
    const closed = (dict.lookupMaybe(n("Count"), PDFNumber)?.asNumber() ?? 0) < 0;
    if (count) dict.set(n("Count"), PDFNumber.of(closed ? -count : count));
    else dict.delete(n("Count"));
    visible.set(item.parent, (visible.get(item.parent) ?? 0) + 1 + (closed ? 0 : count));
  }
  root?.set(n("Count"), PDFNumber.of(visible.get(undefined) ?? 0));
}
export function addBookmark(document: PDFDocument, raw: z.infer<typeof bookmarkInput>): void {
  const input = bookmarkInput.parse(raw),
    page = document.getPages()[input.page];
  if (!page) throw new Error("Página de destino inexistente.");
  const items = bookmarks(document);
  if (input.parent && !items.some((item) => item.id === input.parent))
    throw new Error("Marcador pai indisponível.");
  let root = document.catalog.get(n("Outlines"));
  if (!(root instanceof PDFRef)) {
    root = document.context.register(document.context.obj({ Type: "Outlines" }));
    document.catalog.set(n("Outlines"), root);
  }
  const parentRef = input.parent ? refOf(document, input.parent) : root,
    parent = document.context.lookup(parentRef, PDFDict);
  const previous = parent.get(n("Last"));
  const item = document.context.obj({
    Title: PDFHexString.fromText(input.title),
    Parent: parentRef,
    Dest: [page.ref, "Fit"],
  });
  const reference = document.context.register(item);
  if (previous instanceof PDFRef) {
    document.context.lookup(previous, PDFDict).set(n("Next"), reference);
    item.set(n("Prev"), previous);
  } else parent.set(n("First"), reference);
  parent.set(n("Last"), reference);
  recountBookmarks(document);
}
export function editBookmark(
  document: PDFDocument,
  id: string,
  change: { title?: string; page?: number } | "remove",
): void {
  if (!bookmarks(document).some((item) => item.id === id))
    throw new Error("Marcador indisponível.");
  const ref = refOf(document, id),
    dict = document.context.lookup(ref, PDFDict);
  if (change === "remove") {
    const parent = dict.lookup(n("Parent"), PDFDict),
      previous = dict.get(n("Prev")),
      next = dict.get(n("Next"));
    if (previous instanceof PDFRef) {
      const prev = document.context.lookup(previous, PDFDict);
      if (next) prev.set(n("Next"), next);
      else prev.delete(n("Next"));
    } else if (next) parent.set(n("First"), next);
    else parent.delete(n("First"));
    if (next instanceof PDFRef) {
      const after = document.context.lookup(next, PDFDict);
      if (previous) after.set(n("Prev"), previous);
      else after.delete(n("Prev"));
    } else if (previous) parent.set(n("Last"), previous);
    else parent.delete(n("Last"));
  } else {
    if (change.title !== undefined)
      dict.set(n("Title"), PDFHexString.fromText(bookmarkInput.shape.title.parse(change.title)));
    if (change.page !== undefined) {
      const page = document.getPages()[bookmarkInput.shape.page.parse(change.page)];
      if (!page) throw new Error("Página de destino inexistente.");
      dict.set(n("Dest"), document.context.obj([page.ref, "Fit"]));
      dict.delete(n("A"));
    }
  }
  recountBookmarks(document);
}
export function moveBookmark(document: PDFDocument, id: string, direction: "up" | "down"): void {
  const entries = bookmarks(document),
    selected = entries.find((item) => item.id === id);
  if (!selected) throw new Error("Marcador indisponível.");
  const siblings = entries.filter((item) => item.parent === selected.parent),
    index = siblings.findIndex((item) => item.id === id),
    target = index + (direction === "up" ? -1 : 1);
  if (target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
  const dictionary = document.context.lookup(refOf(document, id), PDFDict),
    parent = dictionary.lookup(n("Parent"), PDFDict);
  const references = siblings.map((item) => refOf(document, item.id));
  parent.set(n("First"), references[0]);
  parent.set(n("Last"), references[references.length - 1]);
  references.forEach((reference, index) => {
    const item = document.context.lookup(reference, PDFDict);
    if (index) item.set(n("Prev"), references[index - 1]);
    else item.delete(n("Prev"));
    if (index < references.length - 1) item.set(n("Next"), references[index + 1]);
    else item.delete(n("Next"));
  });
}
function pageGeometry(page: PDFPage): {
  crop: { x: number; y: number; w: number; h: number };
  rotation: Rotation;
} {
  const box = page.getCropBox(),
    angle = ((page.getRotation().angle % 360) + 360) % 360;
  if (angle !== 0 && angle !== 90 && angle !== 180 && angle !== 270)
    throw new Error("Rotação de página não suportada.");
  return { crop: { x: box.x, y: box.y, w: box.width, h: box.height }, rotation: angle };
}
export function links(document: PDFDocument): PdfLink[] {
  const out: PdfLink[] = [];
  document.getPages().forEach((page, index) => {
    for (const ref of page.node.Annots()?.asArray() ?? []) {
      const annotation = document.context.lookup(ref);
      if (
        !(ref instanceof PDFRef) ||
        !(annotation instanceof PDFDict) ||
        annotation.get(n("Subtype")) !== n("Link")
      )
        continue;
      const rect = annotation.lookupMaybe(n("Rect"), PDFArray),
        geometry = pageGeometry(page);
      if (!rect || rect.size() !== 4) throw new Error("Link contém área inválida.");
      const values = rect
        .asArray()
        .map((value) => document.context.lookup(value, PDFNumber).asNumber());
      const a = pdfToView(geometry.rotation, geometry.crop, values[0], values[1]),
        b = pdfToView(geometry.rotation, geometry.crop, values[2], values[3]);
      const action = annotation.lookupMaybe(n("A"), PDFDict),
        url = action?.get(n("S")) === n("URI") ? textOf(action.lookup(n("URI"))) : undefined;
      const targetPage = destination(document, annotation);
      out.push({
        id: ref.toString(),
        page: index,
        box: {
          x: Math.min(a[0], b[0]),
          y: Math.min(a[1], b[1]),
          w: Math.abs(b[0] - a[0]),
          h: Math.abs(b[1] - a[1]),
        },
        url,
        targetPage,
        unsupported: targetPage === undefined && !webUrlSchema.safeParse(url).success,
      });
    }
  });
  return out;
}
const linkInputSchema = z.object({
  page: z.number().int().nonnegative(),
  box: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().finite().positive(),
    h: z.number().finite().positive(),
  }),
  target: z.union([
    z.object({ url: webUrlSchema }),
    z.object({ page: z.number().int().nonnegative() }),
  ]),
});
export function addLink(document: PDFDocument, raw: z.infer<typeof linkInputSchema>): void {
  const input = linkInputSchema.parse(raw),
    page = document.getPages()[input.page];
  if (!page) throw new Error("Página do link indisponível.");
  const geometry = pageGeometry(page),
    a = viewToPdf(geometry.rotation, geometry.crop, input.box.x, input.box.y),
    b = viewToPdf(
      geometry.rotation,
      geometry.crop,
      input.box.x + input.box.w,
      input.box.y + input.box.h,
    );
  const width = geometry.rotation % 180 ? geometry.crop.h : geometry.crop.w,
    height = geometry.rotation % 180 ? geometry.crop.w : geometry.crop.h;
  if (
    input.box.x < 0 ||
    input.box.y < 0 ||
    input.box.x + input.box.w > width ||
    input.box.y + input.box.h > height
  )
    throw new Error("A área do link precisa estar dentro da página.");
  const annotation = document.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
    Border: [0, 0, 0],
    P: page.ref,
  });
  if ("url" in input.target)
    annotation.set(
      n("A"),
      document.context.obj({ S: "URI", URI: PDFHexString.fromText(input.target.url) }),
    );
  else {
    const target = document.getPages()[input.target.page];
    if (!target) throw new Error("Página de destino inexistente.");
    annotation.set(n("Dest"), document.context.obj([target.ref, "Fit"]));
  }
  page.node.addAnnot(document.context.register(annotation));
}
export function removeLink(document: PDFDocument, id: string): void {
  const link = links(document).find((link) => link.id === id);
  if (!link) throw new Error("Link indisponível.");
  document.getPage(link.page).node.removeAnnot(refOf(document, id));
}
function embeddedPairs(
  document: PDFDocument,
): { node: PDFDict; array: PDFArray; index: number; spec: PDFDict; id: string; name: string }[] {
  const root = document.catalog
      .lookupMaybe(n("Names"), PDFDict)
      ?.lookupMaybe(n("EmbeddedFiles"), PDFDict),
    out: ReturnType<typeof embeddedPairs> = [],
    seen = new Set<PDFDict>();
  const walk = (node: PDFDict) => {
    if (seen.has(node) || seen.size > 10000)
      throw new Error("Árvore de anexos cíclica ou acima do limite.");
    seen.add(node);
    const array = node.lookupMaybe(n("Names"), PDFArray);
    if (array)
      for (let index = 0; index < array.size(); index += 2) {
        const raw = array.get(index + 1),
          spec = document.context.lookup(raw, PDFDict);
        out.push({
          node,
          array,
          index,
          spec,
          id: raw instanceof PDFRef ? raw.toString() : `direct:${out.length}`,
          name:
            textOf(spec.lookup(n("UF"))) || textOf(spec.lookup(n("F"))) || textOf(array.get(index)),
        });
      }
    for (const raw of node.lookupMaybe(n("Kids"), PDFArray)?.asArray() ?? [])
      walk(document.context.lookup(raw, PDFDict));
  };
  if (root) walk(root);
  return out;
}
export function attachments(document: PDFDocument): PdfAttachment[] {
  return embeddedPairs(document).map((entry) => {
    const ef = entry.spec.lookup(n("EF"), PDFDict),
      stream = ef.lookup(n("UF")) ?? ef.lookup(n("F"));
    if (!(stream instanceof PDFRawStream)) throw new Error("Anexo com conteúdo inválido.");
    const bytes = decodePDFRawStream(stream).decode();
    if (bytes.length > 64 * 1024 * 1024) throw new Error("Anexo excede o limite local de 64 MB.");
    return {
      id: entry.id,
      name: entry.name,
      description: textOf(entry.spec.lookup(n("Desc"))),
      bytes,
    };
  });
}
export function removeAttachment(document: PDFDocument, id: string): void {
  const entry = embeddedPairs(document).find((entry) => entry.id === id);
  if (!entry) throw new Error("Anexo indisponível.");
  entry.array.remove(entry.index + 1);
  entry.array.remove(entry.index);
  // Limits are optional and become stale when removing the first or last name.
  const names = document.catalog
    .lookupMaybe(n("Names"), PDFDict)
    ?.lookupMaybe(n("EmbeddedFiles"), PDFDict);
  const clearLimits = (node: PDFDict): void => {
    node.delete(n("Limits"));
    for (const child of node.lookupMaybe(n("Kids"), PDFArray)?.asArray() ?? [])
      clearLimits(document.context.lookup(child, PDFDict));
  };
  if (names) clearLimits(names);
  const associated = document.catalog.lookupMaybe(n("AF"), PDFArray);
  if (associated)
    for (let index = associated.size() - 1; index >= 0; index--)
      if (document.context.lookup(associated.get(index)) === entry.spec) associated.remove(index);
}
export function safeAttachmentName(name: string): string {
  const leaf = name.split(/[\\/]/).at(-1) ?? "";
  const safe =
    [...leaf.replace(/[<>:"|?*]/g, "_")]
      .map((char) =>
        char.charCodeAt(0) < 32 ||
        (char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff)
          ? "_"
          : char,
      )
      .join("")
      .replace(/[. ]+$/, "")
      .replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?=\.|$)/i, "_$1") || "anexo.bin";
  const prefix = (value: string, limit: number) => {
    let result = "";
    for (const char of value) {
      if (result.length + char.length > limit) break;
      result += char;
    }
    return result;
  };
  if (safe.length <= 180) return safe;
  const dot = safe.lastIndexOf("."),
    extension = dot > 0 ? safe.slice(dot) : "";
  return extension && extension.length < 180
    ? `${prefix(safe.slice(0, dot), 180 - extension.length)}${extension}`
    : prefix(safe, 180);
}
