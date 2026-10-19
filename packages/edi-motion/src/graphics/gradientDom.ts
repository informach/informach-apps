import type { InteractiveDocument } from "../interactiveDocument";
import { matchesGraphicElement } from "./domElements";
import { type GradientPaints, gradientDefinitions } from "./gradients";
/** Canonical definitions must match the typed content, including nested scopes. */
export function validateSvgGradients(root: SVGSVGElement, document: InteractiveDocument) {
  const paints: GradientPaints[] = [];
  function collect(document: InteractiveDocument) {
    for (const object of document.content) if (object.gradients) paints.push(object.gradients);
    for (const child of document.components ?? []) collect(child.document);
  }
  collect(document);
  const byId = new Map<string, Element[]>();
  for (const element of root.querySelectorAll('[id^="edi-gradient-"]')) {
    const id = element.getAttribute("id");
    if (!id) throw new Error("Gradiente sem identidade.");
    const list = byId.get(id) ?? [];
    list.push(element);
    byId.set(id, list);
  }
  for (const expected of gradientDefinitions(paints)) {
    const list = byId.get(expected.attrs.id ?? ""),
      actual = list?.[0];
    if (!actual || list?.length !== 1 || !matchesGraphicElement(actual, expected))
      throw new Error("Gradiente SVG não corresponde à definição tipada.");
  }
}
