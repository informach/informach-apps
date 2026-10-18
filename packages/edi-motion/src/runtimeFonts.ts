import { fontStackIds } from "./assets/fontStack";
import type { InteractiveDocument } from "./interactiveDocument";
export function documentFontIds(document: InteractiveDocument): Set<string> {
  const result = new Set<string>();
  function collect(document: InteractiveDocument) {
    for (const object of document.content) for (const id of fontStackIds(object)) result.add(id);
    for (const child of document.components ?? []) collect(child.document);
  }
  collect(document);
  return result;
}
export function hasLoadedFont(fonts: FontFaceSet, id: string) {
  const family = `edi-${id}`;
  for (const font of fonts)
    if (font.family.replace(/^["']|["']$/g, "") === family && font.status === "loaded") return true;
  return false;
}
export async function loadDocumentFonts(
  root: SVGSVGElement,
  document: InteractiveDocument,
  signal?: AbortSignal,
) {
  const fonts = root.ownerDocument.fonts;
  for (const id of documentFontIds(document)) {
    signal?.throwIfAborted();
    if (hasLoadedFont(fonts, id)) continue;
    await fonts.load(`16px "edi-${id}"`);
    signal?.throwIfAborted();
    if (!hasLoadedFont(fonts, id))
      throw new Error("Fonte incorporada não foi carregada; fallback silencioso recusado.");
  }
}
