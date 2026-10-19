import { type SemanticMetadata, semanticSchema } from "@informach/edi-motion/visual";

export const svgSemanticAttributes: ReadonlySet<string> = new Set([
  "role",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-hidden",
]);
/** Convert a closed static SVG naming profile. Never dereference URLs or
 * flatten arbitrary markup as an accessible name. IDs do not leave import. */
export function createSvgSemanticCatalog(root: Element) {
  const ids = new Map<string, Element>(),
    used = new Set<Element>();
  let visited = 0,
    textBudget = 0;
  function collect(element: Element, depth: number) {
    if (++visited > 2000 || depth > 32)
      throw new Error("SVG excede orçamento de semântica/elementos.");
    const id = element.getAttribute("id");
    if (id) {
      if (ids.has(id)) throw new Error("IDs SVG duplicados tornam a semântica ambígua.");
      ids.set(id, element);
    }
    if (element.localName !== "metadata")
      for (const child of element.children) collect(child, depth + 1);
  }
  collect(root, 0);
  function plain(element: Element, maximum: number, pending: Set<Element>) {
    if (
      !["title", "desc"].includes(element.localName) ||
      !["", "http://www.w3.org/2000/svg"].includes(element.namespaceURI ?? "") ||
      element.children.length
    )
      throw new Error("Nome/descrição SVG requer title/desc local com texto simples, sem markup.");
    for (const attr of element.attributes)
      if (!["id", "xmlns"].includes(attr.name))
        throw new Error("Atributo de title/desc fora do perfil semântico.");
    const text = element.textContent ?? "";
    if (text.length > maximum) throw new Error("Nome/descrição SVG excede o limite semântico.");
    pending.add(element);
    return text;
  }
  function reference(raw: string, maximum: number, pending: Set<Element>) {
    if (raw.length > 2000) throw new Error("Referências semânticas SVG excessivas.");
    const normalized = raw.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ""),
      names = normalized.split(/[\t\n\f\r ]+/);
    if (!normalized || names.length > 16 || new Set(names).size !== names.length)
      throw new Error("Referências semânticas SVG vazias/repetidas/excessivas.");
    const values = names.map((id) => {
      const element = ids.get(id);
      if (!element)
        throw new Error("Referência semântica SVG local ausente; URLs não são aceitas.");
      return plain(element, maximum, pending);
    });
    const text = values.join(" ");
    if (!text.trim() || text.length > maximum)
      throw new Error("Nome/descrição referenciado vazio/excessivo.");
    return text;
  }
  function read(element: Element): SemanticMetadata | undefined {
    const pending = new Set<Element>();
    const hidden = element.getAttribute("aria-hidden"),
      role = element.getAttribute("role"),
      children = [...element.children],
      titles = children.filter((child) => child.localName === "title"),
      descriptions = children.filter((child) => child.localName === "desc");
    if (hidden !== null && hidden !== "true" && hidden !== "false")
      throw new Error("aria-hidden SVG requer true/false explícito.");
    if (role !== null && role !== "group" && role !== "img")
      throw new Error(
        "Papel SVG fora do perfil estático (group/img); presentation/none não equivalem a decorative, e botões exigem ações configuradas.",
      );
    if (titles.length > 1 || descriptions.length > 1)
      throw new Error(
        "Múltiplos title/desc locais requerem seleção explícita de idioma antes de importar.",
      );
    const labelledBy = element.getAttribute("aria-labelledby"),
      ariaLabel = element.getAttribute("aria-label"),
      describedBy = element.getAttribute("aria-describedby");
    const label =
      labelledBy !== null
        ? reference(labelledBy, 500, pending)
        : ariaLabel !== null
          ? ariaLabel
          : titles[0]
            ? plain(titles[0], 500, pending)
            : undefined;
    const description =
      describedBy !== null
        ? reference(describedBy, 2000, pending)
        : descriptions[0]
          ? plain(descriptions[0], 2000, pending)
          : undefined;
    if (hidden === "true") {
      if (label?.trim() || description?.trim() || role)
        throw new Error(
          "Elemento oculto com significado próprio requer revisão explícita; metadados não são descartados.",
        );
      return semanticSchema.parse({ kind: "decorative" });
    }
    if (!label?.trim()) {
      if (labelledBy !== null || ariaLabel !== null || role)
        throw new Error("Elemento SVG com semântica explícita requer nome acessível não vazio.");
      // No invented name for a description-only graphic. Import reports the
      // unconverted desc and retains the exact original source.
      if (describedBy !== null)
        throw new Error("Descrição referenciada sem nome acessível requer revisão explícita.");
      return undefined;
    }
    const result = semanticSchema.parse({
      kind:
        role === "img" || (role === null && !["g", "svg"].includes(element.localName))
          ? "image"
          : "group",
      label,
      ...(description?.trim() ? { description } : {}),
    });
    textBudget += label.length + (description?.length ?? 0);
    if (textBudget > 1_000_000) throw new Error("SVG excede orçamento textual semântico agregado.");
    for (const source of pending) used.add(source);
    return result;
  }
  return { read, used: (element: Element) => used.has(element) };
}
