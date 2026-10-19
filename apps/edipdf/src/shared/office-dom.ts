import { type Document, Element } from "@xmldom/xmldom";
import { officePart } from "./office-package.ts";
import { parseOfficeXml } from "./office-xml.ts";

export const OFFICE_NS = {
  word: [
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "http://purl.oclc.org/ooxml/wordprocessingml/main",
  ],
  sheet: [
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "http://purl.oclc.org/ooxml/spreadsheetml/main",
  ],
  drawing: [
    "http://schemas.openxmlformats.org/drawingml/2006/main",
    "http://purl.oclc.org/ooxml/drawingml/main",
  ],
  presentation: [
    "http://schemas.openxmlformats.org/presentationml/2006/main",
    "http://purl.oclc.org/ooxml/presentationml/main",
  ],
  relation: [
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "http://purl.oclc.org/ooxml/officeDocument/relationships",
  ],
};
type Family = keyof typeof OFFICE_NS;
export function isOfficeElement(node: unknown, family: Family, local: string): boolean {
  return (
    node instanceof Element &&
    node.localName === local &&
    OFFICE_NS[family].some((uri) => uri === node.namespaceURI)
  );
}
export function children(node: Element | Document): Element[] {
  return Array.from(node.childNodes).filter((child): child is Element => child instanceof Element);
}
export function child(
  node: Element | undefined,
  family: Family,
  local: string,
): Element | undefined {
  return node && children(node).find((item) => isOfficeElement(item, family, local));
}
export function descendants(node: Element, family: Family, local: string): Element[] {
  const found: Element[] = [],
    pending = [node];
  while (pending.length) {
    const item = pending.pop();
    if (!item) break;
    if (item !== node && isOfficeElement(item, family, local)) found.push(item);
    const list = children(item);
    pending.push(...list.reverse());
  }
  return found;
}
export function attr(node: Element | undefined, family: Family, name: string): string | undefined {
  if (!node) return undefined;
  for (const ns of OFFICE_NS[family])
    if (node.hasAttributeNS(ns, name)) return node.getAttributeNS(ns, name) ?? undefined;
  return undefined;
}
export function wordValue(node: Element | undefined): string | undefined {
  return attr(node, "word", "val");
}
export function officeXmlPart(parts: Map<string, Uint8Array>, name: string): Document {
  return parseOfficeXml(officePart(parts, name));
}

export interface OfficeRelationship {
  target: string;
  type: string;
  external: boolean;
}
export function officeRelationships(
  parts: Map<string, Uint8Array>,
  source: string,
): Map<string, OfficeRelationship> {
  const slash = source.lastIndexOf("/"),
    base = source.slice(0, slash + 1),
    file = source.slice(slash + 1);
  const bytes = parts.get(`${base}_rels/${file}.rels`.toLowerCase());
  if (!bytes) return new Map();
  const root = parseOfficeXml(bytes).documentElement;
  if (
    root?.localName !== "Relationships" ||
    root.namespaceURI !== "http://schemas.openxmlformats.org/package/2006/relationships"
  )
    throw new Error("Relacionamentos Office inválidos.");
  const result = new Map<string, OfficeRelationship>();
  for (const item of children(root)) {
    if (item.localName !== "Relationship" || item.namespaceURI !== root.namespaceURI)
      throw new Error("Relacionamento Office desconhecido.");
    const id = item.getAttribute("Id"),
      target = item.getAttribute("Target"),
      type = item.getAttribute("Type");
    if (!id || !target || !type || result.has(id))
      throw new Error("Relacionamento Office incompleto ou duplicado.");
    const mode = item.getAttribute("TargetMode");
    if (mode && !["Internal", "External"].includes(mode))
      throw new Error("Modo de relacionamento Office inválido.");
    const external = mode === "External";
    let resolved = target;
    if (!external) {
      if (
        /[\\?#]/.test(target) ||
        [...target].some((char) => char.charCodeAt(0) < 32) ||
        /^[a-z][a-z\d+.-]*:/i.test(target)
      )
        throw new Error("Caminho de relacionamento Office inválido.");
      const stack = target.startsWith("/") ? [] : base.split("/").filter(Boolean);
      for (const part of target.replace(/^\//, "").split("/")) {
        let decoded: string;
        try {
          decoded = decodeURIComponent(part);
        } catch {
          throw new Error("Caminho Office com escape inválido.");
        }
        if (decoded === "..") {
          if (!stack.length) throw new Error("Relacionamento Office sai do pacote.");
          stack.pop();
        } else if (decoded && decoded !== ".") {
          if (/[\\/]/.test(decoded) || [...decoded].some((char) => char.charCodeAt(0) < 32))
            throw new Error("Caminho Office inválido.");
          stack.push(decoded);
        }
      }
      resolved = stack.join("/").normalize("NFC").toLowerCase();
      if (!resolved) throw new Error("Relacionamento Office sem destino.");
    }
    result.set(id, { target: resolved, type, external });
  }
  return result;
}
