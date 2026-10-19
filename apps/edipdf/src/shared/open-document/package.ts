import type { Document } from "@xmldom/xmldom";
import { strToU8 } from "fflate";
import { children } from "../office-dom.ts";
import { readOfficePackage, writeOfficePackage } from "../office-package.ts";
import { parseOfficeXml, XML_HEADER, xml } from "../office-xml.ts";
import { attr, child, descendants, is, NS } from "./dom.ts";

export const MIMES = {
  text: "application/vnd.oasis.opendocument.text",
  spreadsheet: "application/vnd.oasis.opendocument.spreadsheet",
  presentation: "application/vnd.oasis.opendocument.presentation",
};
export interface OpenPackage {
  parts: Map<string, Uint8Array>;
  content: Document;
  styles?: Document;
}
export function required(parts: Map<string, Uint8Array>, name: string): Uint8Array {
  const bytes = parts.get(name);
  if (!bytes) throw new Error(`Parte OpenDocument ausente: ${name}.`);
  return bytes;
}
/** References stay inside the ZIP. They never become filesystem paths or network requests. */
export function resourceName(href: string): string {
  if (
    !href ||
    href.length > 1000 ||
    /[\\?#]/.test(href) ||
    [...href].some((character) => character.charCodeAt(0) <= 32) ||
    /^[a-z][a-z\d+.-]*:/i.test(href) ||
    href.startsWith("/")
  )
    throw new Error("Recurso externo ou caminho OpenDocument não permitido.");
  const segments = href
    .replace(/^\.\//, "")
    .split("/")
    .map((segment) => decodeURIComponent(segment));
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\\/:?#]/.test(segment) ||
        [...segment].some((character) => character.charCodeAt(0) < 32),
    )
  )
    throw new Error("Caminho de recurso OpenDocument inválido.");
  return segments.join("/");
}
export function readOpenPackage(bytes: Uint8Array, kind: keyof typeof MIMES): OpenPackage {
  const parts = readOfficePackage(bytes, { caseSensitive: true }),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x04034b50 ||
    view.getUint16(8, true) !== 0 ||
    view.getUint16(26, true) !== 8 ||
    view.getUint16(28, true) !== 0 ||
    new TextDecoder().decode(bytes.subarray(30, 38)) !== "mimetype"
  )
    throw new Error(
      "OpenDocument exige mimetype como primeira entrada ZIP, sem compressão nem campos extras.",
    );
  if (new TextDecoder("utf-8", { fatal: true }).decode(required(parts, "mimetype")) !== MIMES[kind])
    throw new Error("O tipo OpenDocument não corresponde ao formato escolhido.");
  const manifest = parseOfficeXml(required(parts, "META-INF/manifest.xml")).documentElement;
  if (!manifest || !is(manifest, "manifest", "manifest"))
    throw new Error("Manifesto OpenDocument inválido.");
  const declared = new Set<string>();
  let rootType = "";
  for (const entry of children(manifest)) {
    if (!is(entry, "manifest", "file-entry"))
      throw new Error("Entrada desconhecida no manifesto OpenDocument.");
    if (children(entry).length)
      throw new Error(
        "Criptografia/assinatura de pacote OpenDocument não pertence ao perfil local.",
      );
    const path = attr(entry, "manifest", "full-path");
    if (!path || declared.has(path))
      throw new Error("Manifesto OpenDocument com caminhos ausentes ou duplicados.");
    declared.add(path);
    if (path === "/") rootType = attr(entry, "manifest", "media-type") ?? "";
    else if (!path.endsWith("/")) required(parts, resourceName(path));
  }
  if (rootType !== MIMES[kind] || !declared.has("content.xml"))
    throw new Error("Manifesto OpenDocument não corresponde ao conteúdo.");
  for (const name of parts.keys())
    if (/^(?:basic|scripts)\//i.test(name) || /^META-INF\/.*signature/i.test(name))
      throw new Error("Macros e assinaturas de pacote OpenDocument não pertencem ao perfil local.");
  const content = parseOfficeXml(required(parts, "content.xml")),
    stylesBytes = parts.get("styles.xml"),
    styles = stylesBytes ? parseOfficeXml(stylesBytes) : undefined;
  for (const document of [content, styles]) {
    if (!document?.documentElement) continue;
    if (
      descendants(document.documentElement, "office", "scripts").some(
        (node) => children(node).length,
      ) ||
      descendants(document.documentElement, "office", "event-listeners").length
    )
      throw new Error("Scripts e eventos OpenDocument não são executados nem importados.");
  }
  if (
    !content.documentElement ||
    !is(content.documentElement, "office", "document-content") ||
    !child(child(content.documentElement, "office", "body"), "office", kind)
  )
    throw new Error("Corpo OpenDocument inválido para o formato escolhido.");
  if (
    styles &&
    (!styles.documentElement || !is(styles.documentElement, "office", "document-styles"))
  )
    throw new Error("Estilos OpenDocument inválidos.");
  return { parts, content, styles };
}
export const namespaces = Object.entries(NS)
  .map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
  .join(" ");
export function writeOpenPackage(
  kind: keyof typeof MIMES,
  parts: Record<string, Uint8Array>,
  media: ReadonlyMap<string, string> = new Map(),
): Uint8Array {
  if (Object.hasOwn(parts, "mimetype") || Object.hasOwn(parts, "META-INF/manifest.xml"))
    throw new Error("Partes reservadas OpenDocument.");
  const manifest = `${XML_HEADER}<manifest:manifest xmlns:manifest="${NS.manifest}" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${MIMES[kind]}" manifest:version="1.3"/>${Object.keys(
    parts,
  )
    .map(
      (name) =>
        `<manifest:file-entry manifest:full-path="${xml(name)}" manifest:media-type="${xml(media.get(name) ?? (name.endsWith(".xml") ? "text/xml" : ""))}"/>`,
    )
    .join("")}</manifest:manifest>`;
  return writeOfficePackage(
    { mimetype: strToU8(MIMES[kind]), ...parts, "META-INF/manifest.xml": strToU8(manifest) },
    { uncompressed: ["mimetype"] },
  );
}
