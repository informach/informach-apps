import type { InteractiveDocument } from "../interactiveDocument";
import { matchesGraphicElement } from "./domElements";
import { type Filter, filterDefinitions } from "./filters";
import { type GradientPaints, gradientDefinitions } from "./gradients";
import { paintLayerServers } from "./paintLayers";
/** Canonical definitions must match the typed content, including nested scopes. */
export function validateSvgGradients(root: SVGSVGElement, document: InteractiveDocument) {
  const paints: GradientPaints[] = [],
    filters: Filter[] = [];
  function collect(document: InteractiveDocument) {
    for (const object of document.content) {
      if (object.gradients) paints.push(object.gradients);
      for (const fill of paintLayerServers(object.paintLayers)) paints.push({ fill });
      if (object.filter) filters.push(object.filter);
    }
    for (const child of document.components ?? []) collect(child.document);
  }
  collect(document);
  const byId = new Map<string, Element[]>();
  for (const element of root.querySelectorAll(
    '[id^="edi-gradient-"],[id^="edi-pattern-"],[id^="edi-filter-"]',
  )) {
    const id = element.getAttribute("id");
    if (!id) throw new Error("Gradiente sem identidade.");
    const list = byId.get(id) ?? [];
    list.push(element);
    byId.set(id, list);
  }
  for (const expected of [...gradientDefinitions(paints), ...filterDefinitions(filters)]) {
    const list = byId.get(expected.attrs.id ?? ""),
      actual = list?.[0];
    if (!actual || list?.length !== 1 || !matchesGraphicElement(actual, expected))
      throw new Error("Gradiente/padrão/filtro SVG não corresponde à definição tipada.");
  }
}
