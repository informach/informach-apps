import { DOMParser, type Document, Element, onErrorStopParsing } from "@xmldom/xmldom";

export const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export function xml(value: string): string {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (
      !(
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
      )
    )
      throw new Error(
        "O texto contém um caractere não representável em XML. Corrija-o antes da conversão.",
      );
  }
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
/** Office XML has no reason to declare DTDs/entities. No recovery or external resolution is accepted. */
export function parseOfficeXml(bytes: Uint8Array): Document {
  if (bytes.length > 8 * 1024 * 1024) throw new Error("Parte XML excede 8 MB.");
  const utf16 =
    bytes[0] === 255 && bytes[1] === 254
      ? "utf-16le"
      : bytes[0] === 254 && bytes[1] === 255
        ? "utf-16be"
        : "utf-8";
  const source = new TextDecoder(utf16, { fatal: true }).decode(bytes);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source))
    throw new Error("DTD e entidades externas não são permitidos na conversão local.");
  const document = new DOMParser({ onError: onErrorStopParsing }).parseFromString(
    source,
    "application/xml",
  );
  if (!document.documentElement) throw new Error("Parte Office sem elemento raiz.");
  let count = 0;
  const pending: { node: Element; depth: number }[] = [
    { node: document.documentElement, depth: 0 },
  ];
  while (pending.length) {
    const item = pending.pop();
    if (!item) break;
    if (++count > 200000 || item.depth > 100)
      throw new Error("Parte XML grande ou profunda demais.");
    for (const child of item.node.childNodes)
      if (child instanceof Element) pending.push({ node: child, depth: item.depth + 1 });
  }
  return document;
}
