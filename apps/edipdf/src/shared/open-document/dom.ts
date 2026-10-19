import type { Element } from "@xmldom/xmldom";
import { children } from "../office-dom.ts";

export const NS = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  presentation: "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  table: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  draw: "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
  fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
  svg: "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0",
  manifest: "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0",
  xlink: "http://www.w3.org/1999/xlink",
  dc: "http://purl.org/dc/elements/1.1/",
  meta: "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
};
export type Family = keyof typeof NS;
export function is(node: Element, ns: Family, local: string): boolean {
  return node.namespaceURI === NS[ns] && node.localName === local;
}
export function attr(node: Element | undefined, ns: Family, local: string): string | undefined {
  return node?.hasAttributeNS(NS[ns], local)
    ? (node.getAttributeNS(NS[ns], local) ?? undefined)
    : undefined;
}
export function child(node: Element | undefined, ns: Family, local: string): Element | undefined {
  return node && children(node).find((element) => is(element, ns, local));
}
export function descendants(node: Element, ns: Family, local: string): Element[] {
  const result: Element[] = [],
    pending = [node];
  while (pending.length) {
    const current = pending.pop();
    if (!current) break;
    if (is(current, ns, local)) result.push(current);
    pending.push(...children(current).reverse());
  }
  return result;
}
export function integer(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max)
    throw new Error("Quantidade OpenDocument fora dos limites locais.");
  return Number(value);
}
export function length(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const match = /^(\d+(?:\.\d+)?)(pt|pc|in|cm|mm)$/.exec(value.trim()),
    unit = match?.[2];
  if (!match?.[1] || !unit) throw new Error("Medida OpenDocument não suportada.");
  const factor = { pt: 1, pc: 12, in: 72, cm: 72 / 2.54, mm: 72 / 25.4 };
  const scale = Object.entries(factor).find(([name]) => name === unit)?.[1];
  if (scale === undefined) throw new Error("Unidade OpenDocument inválida.");
  const result = Number(match[1]) * scale;
  if (!Number.isFinite(result) || result > 16000)
    throw new Error("Medida OpenDocument excede o perfil local.");
  return result;
}
