import { Element } from "@xmldom/xmldom";
import { children } from "../office-dom.ts";
import {
  type OfficeBlock,
  type OfficeDocument,
  type OfficeParagraph,
  officeDocumentSchema,
} from "../office-format.ts";
import { validateRasterImage } from "../raster-image.ts";
import { attr, child, descendants, integer, is, length } from "./dom.ts";
import { readOpenPackage, required, resourceName } from "./package.ts";
import { OpenStyles, type RunStyle } from "./styles.ts";

export function importOdt(bytes: Uint8Array, title: string): OfficeDocument {
  const input = readOpenPackage(bytes, "text"),
    warnings = new Set<string>([
      "ODT é convertido como fluxo editável; quebras automáticas e posicionamento podem mudar.",
    ]),
    styles = new OpenStyles(input, warnings),
    body = child(
      child(input.content.documentElement ?? undefined, "office", "body"),
      "office",
      "text",
    );
  if (!body) throw new Error("Documento ODT sem corpo.");
  if (descendants(body, "text", "tracked-changes").some((node) => children(node).length))
    throw new Error("Aceite/rejeite as alterações controladas antes de converter este ODT.");
  const pages: OfficeDocument["pages"] = [];
  const listStyles = new Map<string, Element>();
  for (const document of [input.styles, input.content])
    if (document?.documentElement)
      for (const node of descendants(document.documentElement, "text", "list-style")) {
        const name = attr(node, "style", "name");
        if (!name || listStyles.has(name))
          throw new Error("Estilo de lista ODT duplicado/inválido.");
        listStyles.set(name, node);
      }
  const listLabel = (node: Element) => {
    if (attr(node, "text", "continue-list") || attr(node, "text", "continue-numbering") === "true")
      throw new Error(
        "Continuação entre listas ODT ainda não suportada; use numeração explícita antes de converter.",
      );
    let level = 1,
      ancestor = node.parentNode;
    while (ancestor instanceof Element) {
      if (is(ancestor, "text", "list")) level++;
      ancestor = ancestor.parentNode;
    }
    const name = attr(node, "text", "style-name"),
      definition = name ? listStyles.get(name) : undefined;
    if (name && !definition) throw new Error("Estilo de lista ODT não encontrado.");
    const entry =
      definition &&
      children(definition).find((item) => Number(attr(item, "text", "level")) === level);
    if (definition && !entry) throw new Error("Nível de lista ODT não encontrado.");
    if (entry && is(entry, "text", "list-level-style-image"))
      throw new Error("Marcador de lista ODT por imagem ainda não suportado.");
    const numbered = entry && is(entry, "text", "list-level-style-number"),
      format = attr(entry, "style", "num-format") ?? "1",
      before = attr(entry, "style", "num-prefix") ?? "",
      after = attr(entry, "style", "num-suffix") ?? ".",
      start = integer(attr(entry, "text", "start-value"), 1, 1000000);
    if (
      numbered &&
      (!["1", "a", "A"].includes(format) ||
        Number(attr(entry, "text", "display-levels") ?? "1") > 1)
    )
      throw new Error("Formato de numeração ODT ainda não suportado.");
    const bullet = attr(entry, "text", "bullet-char") ?? "•";
    return {
      start,
      label: (value: number) => {
        let number = String(value);
        if (format === "a" || format === "A") {
          number = "";
          let current = value;
          while (current) {
            current--;
            number = String.fromCharCode((format === "a" ? 97 : 65) + (current % 26)) + number;
            current = Math.floor(current / 26);
          }
        }
        return `${"  ".repeat(level - 1)}${numbered ? before + number + after : bullet} `;
      },
    };
  };
  let currentMaster: string | undefined;
  let page: OfficeDocument["pages"][number] = { ...styles.page(), blocks: [] };
  let textLength = 0,
    runsCount = 0,
    blocksCount = 0,
    cells = 0,
    imageBytes = 0,
    pendingBreak = false;
  const nextPage = (master?: string) => {
    if (page.blocks.length) pages.push(page);
    if (pages.length >= 1000) throw new Error("ODT excede mil páginas explícitas.");
    currentMaster = master ?? currentMaster;
    page = { ...styles.page(currentMaster), blocks: [] };
  };
  const add = (block: OfficeBlock) => {
    if (++blocksCount > 20000) throw new Error("ODT excede o limite local de blocos.");
    page.blocks.push(block);
  };
  const inline = (node: Element, inherited: RunStyle): OfficeParagraph["runs"] => {
    const result: OfficeParagraph["runs"] = [];
    const append = (text: string, style: RunStyle) => {
      if (!text) return;
      textLength += text.length;
      if (textLength > 5_000_000 || ++runsCount > 200000)
        throw new Error("Texto ODT excede os limites locais.");
      const previous = result.at(-1);
      if (
        previous &&
        previous.bold === style.bold &&
        previous.italic === style.italic &&
        previous.size === style.size &&
        previous.color === style.color
      )
        previous.text += text;
      else result.push({ text, ...style });
    };
    for (const current of node.childNodes) {
      if (!(current instanceof Element)) {
        if (current.nodeType === 3 || current.nodeType === 4)
          append((current.nodeValue ?? "").replace(/[\t\r\n ]+/g, " "), inherited);
        continue;
      }
      if (is(current, "text", "s"))
        append(" ".repeat(integer(attr(current, "text", "c"), 1, 32767)), inherited);
      else if (is(current, "text", "tab")) append("\t", inherited);
      else if (is(current, "text", "line-break")) append("\n", inherited);
      else if (is(current, "text", "span") || is(current, "text", "a")) {
        const named = attr(current, "text", "style-name"),
          nested = inline(current, named ? styles.run("text", named, inherited) : inherited);
        result.push(...nested);
        if (is(current, "text", "a"))
          warnings.add("Links são preservados como texto visível; endereços não são acessados.");
      } else if (is(current, "text", "soft-page-break"))
        warnings.add("Quebras automáticas de página ODT são recalculadas.");
      else if (
        is(current, "text", "bookmark") ||
        is(current, "text", "bookmark-start") ||
        is(current, "text", "bookmark-end") ||
        is(current, "text", "reference-mark-start") ||
        is(current, "text", "reference-mark-end")
      )
        warnings.add("Marcadores de navegação ODT não entram neste perfil.");
      else if (is(current, "draw", "frame")) {
        throw new Error(
          "Imagem misturada a texto no mesmo parágrafo ODT ainda não suportada. Separe a imagem em um parágrafo próprio.",
        );
      } else if (is(current, "office", "annotation") || is(current, "office", "annotation-end"))
        warnings.add("Comentários ODT não são incluídos no PDF convertido.");
      else throw new Error(`Elemento de texto ODT ainda não suportado: ${current.tagName}.`);
    }
    return result;
  };
  const image = (frame: Element): OfficeBlock => {
    styles.graphic(attr(frame, "draw", "style-name"));
    if (attr(frame, "draw", "transform"))
      throw new Error("Transformações de imagem ODT ainda não suportadas.");
    const content = children(frame),
      item = content.find((node) => is(node, "draw", "image"));
    if (
      !item ||
      content.some(
        (node) =>
          !is(node, "draw", "image") && !is(node, "svg", "title") && !is(node, "svg", "desc"),
      )
    )
      throw new Error("Quadro ODT com objeto/vetor não suportado.");
    if (content.filter((node) => is(node, "draw", "image")).length !== 1 || children(item).length)
      throw new Error("Imagem ODT incorporada em XML/alternativas ainda não suportada.");
    const href = attr(item, "xlink", "href"),
      name = href ? resourceName(href) : "",
      data = required(input.parts, name),
      format = /\.png$/i.test(name) ? "png" : /\.jpe?g$/i.test(name) ? "jpg" : undefined;
    if (!format) throw new Error("ODT suporta imagens locais PNG/JPEG neste perfil.");
    const dimensions = validateRasterImage(data, format);
    imageBytes += data.length;
    if (imageBytes > 128 * 1024 * 1024) throw new Error("Imagens ODT excedem o limite local.");
    warnings.add("Imagens ODT são recompostas no fluxo; ancoragem flutuante pode mudar.");
    return {
      kind: "image",
      bytes: new Uint8Array(data),
      format,
      width: length(attr(frame, "svg", "width"), dimensions.width * 0.75),
      height: length(attr(frame, "svg", "height"), dimensions.height * 0.75),
      alt:
        child(frame, "svg", "desc")?.textContent ?? child(frame, "svg", "title")?.textContent ?? "",
    };
  };
  const walk = (container: Element, depth = 0, prefix = "") => {
    if (depth > 40) throw new Error("Estrutura ODT profunda demais.");
    for (const node of children(container)) {
      if (is(node, "text", "p") || is(node, "text", "h")) {
        const name = attr(node, "text", "style-name"),
          props = styles.paragraph(name);
        if (pendingBreak || props.before || (props.master && props.master !== currentMaster)) {
          nextPage(props.master);
          pendingBreak = false;
        }
        const frames = children(node).filter((item) => is(item, "draw", "frame"));
        if (
          frames.length &&
          !Array.from(node.childNodes).some(
            (item) => item.nodeType === 3 && (item.nodeValue ?? "").trim(),
          ) &&
          children(node).length === frames.length
        ) {
          for (const frame of frames) add(image(frame));
        } else {
          const runs = inline(node, styles.run("paragraph", name));
          if (prefix) {
            runs.unshift({ text: prefix });
            prefix = "";
          }
          add({
            kind: "paragraph",
            runs,
            align: props.align,
            ...(is(node, "text", "h")
              ? { heading: Math.min(6, integer(attr(node, "text", "outline-level"), 1, 10)) }
              : {}),
          });
        }
        pendingBreak = props.after;
      } else if (is(node, "text", "list")) {
        warnings.add(
          "Listas ODT são preservadas com marcadores literais; numeração automática não é mantida.",
        );
        const numbering = listLabel(node);
        let ordinal = numbering.start;
        for (const item of children(node)) {
          if (!is(item, "text", "list-item") && !is(item, "text", "list-header"))
            throw new Error("Item de lista ODT não suportado.");
          if (is(item, "text", "list-header")) walk(item, depth + 1);
          else {
            ordinal = integer(attr(item, "text", "start-value"), ordinal, 1000000);
            walk(item, depth + 1, numbering.label(ordinal++));
          }
        }
      } else if (is(node, "text", "section")) {
        warnings.add("Seções ODT são recompostas no fluxo principal.");
        walk(node, depth + 1);
      } else if (is(node, "table", "table")) {
        const props = styles.paragraph(attr(node, "table", "style-name"), "table");
        if (pendingBreak || props.before || (props.master && props.master !== currentMaster)) {
          nextPage(props.master);
          pendingBreak = false;
        }
        const rows: (string | null)[][] = [];
        const readRows = (parent: Element) => {
          for (const row of children(parent)) {
            if (is(row, "table", "table-header-rows") || is(row, "table", "table-rows")) {
              readRows(row);
              continue;
            }
            if (is(row, "table", "table-column")) continue;
            if (!is(row, "table", "table-row"))
              throw new Error("Estrutura de tabela ODT não suportada.");
            const values: (string | null)[] = [];
            for (const cell of children(row)) {
              if (!is(cell, "table", "table-cell") && !is(cell, "table", "covered-table-cell"))
                throw new Error("Célula ODT inválida.");
              const repeat = integer(attr(cell, "table", "number-columns-repeated"), 1, 200);
              if (values.length + repeat > 200)
                throw new Error("Tabela ODT excede duzentas colunas.");
              if (
                attr(cell, "table", "number-columns-spanned") ||
                attr(cell, "table", "number-rows-spanned")
              )
                warnings.add(
                  "Mesclagens ODT mantêm valores e posições, sem reproduzir a mesclagem.",
                );
              const paragraphs = children(cell);
              if (paragraphs.some((item) => !is(item, "text", "p") && !is(item, "text", "h")))
                throw new Error("Tabela ODT contém conteúdo fora do perfil textual.");
              const text = paragraphs
                .map((item) =>
                  inline(item, {})
                    .map((run) => run.text)
                    .join(""),
                )
                .join("\n");
              values.push(...Array.from({ length: repeat }, () => text || null));
            }
            const repeat = integer(attr(row, "table", "number-rows-repeated"), 1, 10000);
            cells += repeat * values.length;
            if (rows.length + repeat > 10000 || cells > 200000)
              throw new Error("Tabela ODT excede os limites locais.");
            for (let i = 0; i < repeat; i++) rows.push(values.slice());
          }
        };
        if (pendingBreak) {
          nextPage();
          pendingBreak = false;
        }
        readRows(node);
        add({ kind: "table", rows, header: !!child(node, "table", "table-header-rows") });
        pendingBreak = props.after;
      } else if (
        is(node, "text", "sequence-decls") ||
        is(node, "text", "variable-decls") ||
        is(node, "text", "user-field-decls") ||
        is(node, "text", "tracked-changes")
      ) {
        if (children(node).length) warnings.add("Declarações de campos ODT não são executadas.");
      } else throw new Error(`Bloco ODT ainda não suportado: ${node.tagName}.`);
    }
  };
  walk(body);
  if (page.blocks.length || !pages.length) pages.push(page);
  return officeDocumentSchema.parse({ title, pages, warnings: [...warnings] });
}
