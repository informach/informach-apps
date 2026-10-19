import type { Element } from "@xmldom/xmldom";
import { children } from "../office-dom.ts";
import type { OfficeDocument, OfficeParagraph } from "../office-format.ts";
import { attr, child, descendants, length } from "./dom.ts";
import type { OpenPackage } from "./package.ts";

export type RunStyle = Omit<OfficeParagraph["runs"][number], "text">;
export class OpenStyles {
  private named = new Map<string, Element>();
  private defaults = new Map<string, Element>();
  private layouts = new Map<string, Element>();
  private masters = new Map<string, string>();
  private warnings: Set<string>;
  constructor(input: OpenPackage, warnings: Set<string>, options: { presentation?: boolean } = {}) {
    this.warnings = warnings;
    for (const document of [input.styles, input.content]) {
      const root = document?.documentElement;
      if (!root) continue;
      for (const element of descendants(root, "style", "style")) {
        const name = attr(element, "style", "name"),
          family = attr(element, "style", "family");
        if (!name || !family) throw new Error("Estilo OpenDocument sem nome/família.");
        const key = `${family}:${name}`;
        if (this.named.has(key)) throw new Error("Estilos OpenDocument duplicados.");
        this.named.set(key, element);
      }
      for (const element of descendants(root, "style", "default-style")) {
        const family = attr(element, "style", "family");
        if (!family || this.defaults.has(family))
          throw new Error("Estilo padrão OpenDocument duplicado/inválido.");
        this.defaults.set(family, element);
      }
      for (const element of descendants(root, "style", "page-layout")) {
        const name = attr(element, "style", "name");
        if (!name || this.layouts.has(name))
          throw new Error("Layout OpenDocument duplicado/inválido.");
        this.layouts.set(name, element);
      }
      for (const element of descendants(root, "style", "master-page")) {
        const name = attr(element, "style", "name"),
          layout = attr(element, "style", "page-layout-name");
        if (!name || !layout || this.masters.has(name))
          throw new Error("Página mestre OpenDocument inválida.");
        this.masters.set(name, layout);
        if (children(element).length && !options.presentation)
          warnings.add("Cabeçalhos e rodapés OpenDocument não entram no perfil inicial de fluxo.");
      }
    }
    if (this.named.size > 10000) throw new Error("OpenDocument excede dez mil estilos.");
    for (const key of this.named.keys()) {
      const colon = key.indexOf(":");
      this.chain(key.slice(0, colon), key.slice(colon + 1));
    }
  }
  chain(family: string, name?: string): Element[] {
    const result: Element[] = [],
      seen = new Set<string>();
    while (name) {
      if (seen.has(name) || seen.size >= 100)
        throw new Error("Herança de estilo OpenDocument circular/profunda.");
      seen.add(name);
      const node = this.named.get(`${family}:${name}`);
      if (!node) throw new Error(`Estilo OpenDocument não encontrado: ${name}.`);
      result.unshift(node);
      name = attr(node, "style", "parent-style-name");
    }
    const fallback = this.defaults.get(family);
    if (fallback) result.unshift(fallback);
    return result;
  }
  run(family: string, name?: string, inherited: RunStyle = {}): RunStyle {
    const result = { ...inherited };
    for (const node of this.chain(family, name)) {
      const properties = child(node, "style", "text-properties");
      if (!properties) continue;
      const weight = attr(properties, "fo", "font-weight"),
        italic = attr(properties, "fo", "font-style"),
        size = attr(properties, "fo", "font-size"),
        color = attr(properties, "fo", "color");
      if (weight !== undefined) result.bold = weight === "bold" || Number(weight) >= 600;
      if (italic !== undefined) result.italic = italic === "italic" || italic === "oblique";
      if (size !== undefined) {
        if (size.endsWith("%"))
          throw new Error("Tamanho relativo de fonte OpenDocument ainda não suportado.");
        result.size = length(size, 11);
      }
      if (color !== undefined && color !== "font-color") {
        if (!/^#[a-f\d]{6}$/i.test(color))
          throw new Error("Cor de texto OpenDocument não suportada.");
        result.color = color;
      }
      if (attr(properties, "style", "font-name") || attr(properties, "fo", "font-family"))
        this.warnings.add(
          "Fontes são recompostas com Noto Sans local; métricas e paginação podem mudar.",
        );
      if (
        attr(properties, "style", "text-underline-style") ||
        attr(properties, "style", "text-line-through-style")
      )
        this.warnings.add("Sublinhados e tachados OpenDocument não entram neste perfil inicial.");
    }
    return result;
  }
  paragraph(
    name?: string,
    family = "paragraph",
  ): { align: OfficeParagraph["align"]; before: boolean; after: boolean; master?: string } {
    const result: {
      align: OfficeParagraph["align"];
      before: boolean;
      after: boolean;
      master?: string;
    } = { align: "left", before: false, after: false };
    for (const node of this.chain(family, name)) {
      const master = attr(node, "style", "master-page-name");
      if (master) result.master = master;
      const properties = child(
          node,
          "style",
          family === "table" ? "table-properties" : "paragraph-properties",
        ),
        align = attr(properties, "fo", "text-align");
      if (align) {
        if (!["left", "start", "center", "right", "end", "justify"].includes(align))
          throw new Error("Alinhamento OpenDocument não suportado.");
        result.align =
          align === "center"
            ? "center"
            : align === "right" || align === "end"
              ? "right"
              : align === "justify"
                ? "justify"
                : "left";
      }
      result.before = attr(properties, "fo", "break-before") === "page" || result.before;
      result.after = attr(properties, "fo", "break-after") === "page" || result.after;
      if (properties && children(properties).length)
        this.warnings.add(
          "Tabulações e capitulares são recompostas como texto no perfil de fluxo.",
        );
    }
    return result;
  }
  page(master?: string): Omit<OfficeDocument["pages"][number], "blocks"> {
    const masterName = master ?? this.masters.keys().next().value,
      layoutName = masterName ? this.masters.get(masterName) : this.layouts.keys().next().value,
      layout = layoutName ? this.layouts.get(layoutName) : undefined;
    if (master && !layout) throw new Error("Página mestre OpenDocument não encontrada.");
    const props = child(layout, "style", "page-layout-properties"),
      margin = length(attr(props, "fo", "margin"), 36);
    if (child(props, "style", "columns"))
      this.warnings.add("Colunas de página são recompostas em uma única coluna.");
    return {
      width: length(attr(props, "fo", "page-width"), 595.276),
      height: length(attr(props, "fo", "page-height"), 841.89),
      margins: {
        left: length(attr(props, "fo", "margin-left"), margin),
        right: length(attr(props, "fo", "margin-right"), margin),
        top: length(attr(props, "fo", "margin-top"), margin),
        bottom: length(attr(props, "fo", "margin-bottom"), margin),
      },
    };
  }
  graphic(name?: string): void {
    for (const node of this.chain("graphic", name)) {
      const props = child(node, "style", "graphic-properties"),
        clip = attr(props, "fo", "clip");
      if (clip && clip !== "auto")
        throw new Error(
          "Recorte de imagem OpenDocument ainda não suportado; conversão interrompida para preservar a área oculta.",
        );
      for (const [property, identity] of [
        ["opacity", /^100(?:\.0+)?%$/],
        ["image-opacity", /^100(?:\.0+)?%$/],
        ["mirror", /^none$/],
        ["color-mode", /^standard$/],
        ["gamma", /^(?:1(?:\.0+)?|100(?:\.0+)?%)$/],
        ["luminance", /^[+-]?0(?:\.0+)?%$/],
        ["contrast", /^[+-]?0(?:\.0+)?%$/],
      ] as const) {
        const value = attr(props, "draw", property);
        if (value !== undefined && !identity.test(value))
          throw new Error(
            "Efeito de imagem OpenDocument ainda não suportado; conversão interrompida para não alterar a imagem visível.",
          );
      }
    }
  }
}
