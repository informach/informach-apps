import type { Element } from "@xmldom/xmldom";
import {
  attr,
  child,
  children,
  descendants,
  isOfficeElement,
  officeRelationships,
  officeXmlPart,
  wordValue,
} from "./office-dom.ts";
import {
  excelSheetNameSchema,
  type OfficeBlock,
  type OfficeCell,
  type OfficeDocument,
  type OfficeParagraph,
  type OfficeSpreadsheet,
  officeDocumentSchema,
  spreadsheetSchema,
} from "./office-format.ts";
import { officePart, readOfficePackage } from "./office-package.ts";

type RunStyle = Omit<OfficeParagraph["runs"][number], "text">;
const on = (node: Element | undefined): boolean | undefined =>
  node ? !["0", "false", "off"].includes(wordValue(node) ?? "1") : undefined;
function numeric(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number) || number < min || number > max)
    throw new Error("Medida Office inválida ou fora dos limites locais.");
  return number;
}
function runStyle(node: Element | undefined): RunStyle {
  const size = wordValue(child(node, "word", "sz")),
    color = wordValue(child(node, "word", "color"));
  return {
    bold: on(child(node, "word", "b")),
    italic: on(child(node, "word", "i")),
    ...(size ? { size: numeric(size, 22, 8, 400) / 2 } : {}),
    ...(/^[a-f\d]{6}$/i.test(color ?? "") ? { color: `#${color}` } : {}),
  };
}
const defined = (style: RunStyle): RunStyle =>
  Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined));
const textContent = (node: Element): string =>
  descendants(node, "word", "t")
    .map((item) => item.textContent ?? "")
    .join("");

/** Local reflow profile. Complex layout is reported before a converted document can be accepted. */
export function importDocx(bytes: Uint8Array, title: string): OfficeDocument {
  const parts = readOfficePackage(bytes),
    xml = officeXmlPart(parts, "word/document.xml"),
    root = xml.documentElement;
  if (!root || !isOfficeElement(root, "word", "document"))
    throw new Error("O pacote não contém um documento Word válido.");
  const body = child(root, "word", "body");
  if (!body) throw new Error("Documento Word sem conteúdo principal.");
  const warnings = new Set<string>([
    "Conversão local por fluxo: fontes são substituídas por Noto Sans e a paginação pode mudar. Revise a prévia antes de aceitar.",
  ]);
  const relationships = officeRelationships(parts, "word/document.xml");
  if ([...relationships.values()].some((relation) => relation.external))
    warnings.add(
      "Links e imagens externas não são acessados. Destinos externos não são incorporados ao PDF.",
    );
  const styles = new Map<string, Element>(),
    styleCache = new Map<string, RunStyle>();
  const styleBytes = parts.get("word/styles.xml");
  if (styleBytes) {
    const styleRoot = officeXmlPart(parts, "word/styles.xml").documentElement;
    if (!styleRoot || !isOfficeElement(styleRoot, "word", "styles"))
      throw new Error("Tabela de estilos Word inválida.");
    for (const item of children(styleRoot))
      if (isOfficeElement(item, "word", "style")) {
        const id = attr(item, "word", "styleId");
        if (!id || styles.has(id)) throw new Error("Estilo Word sem identificador ou duplicado.");
        styles.set(id, item);
      }
  }
  function resolveStyle(id: string, chain = new Set<string>()): RunStyle {
    const cached = styleCache.get(id);
    if (cached) return cached;
    if (chain.has(id) || chain.size > 50)
      throw new Error("Herança circular ou profunda demais nos estilos Word.");
    const node = styles.get(id);
    if (!node) {
      warnings.add(
        "Há estilos sem definição; o texto correspondente usa a fonte e o tamanho padrão.",
      );
      return {};
    }
    const next = new Set(chain).add(id),
      parent = wordValue(child(node, "word", "basedOn"));
    const value = {
      ...(parent ? resolveStyle(parent, next) : {}),
      ...defined(runStyle(child(node, "word", "rPr"))),
    };
    styleCache.set(id, value);
    return value;
  }
  const defaults = styleBytes
    ? child(
        officeXmlPart(parts, "word/styles.xml").documentElement ?? undefined,
        "word",
        "docDefaults",
      )
    : undefined;
  const defaultStyle = defined(
    runStyle(child(child(defaults, "word", "rPrDefault"), "word", "rPr")),
  );
  const pages: OfficeDocument["pages"] = [],
    pageBase = {
      width: 595.28,
      height: 841.89,
      margins: { left: 36, right: 36, top: 36, bottom: 36 },
    };
  let current: OfficeDocument["pages"][number] = { ...pageBase, blocks: [] },
    blockCount = 0,
    characterCount = 0;
  const append = (block: OfficeBlock) => {
    if (++blockCount > 20000) throw new Error("Documento Word excede 20 mil blocos.");
    current.blocks.push(block);
  };
  const endPage = () => {
    if (pages.length >= 1000) throw new Error("Documento Word excede mil páginas/seções.");
    pages.push(current);
    current = { ...current, blocks: [] };
  };
  const countText = (text: string) => {
    characterCount += text.length;
    if (characterCount > 5_000_000)
      throw new Error("Documento Word excede 5 milhões de caracteres.");
    return text;
  };
  const section = (node: Element) => {
    const size = child(node, "word", "pgSz"),
      margins = child(node, "word", "pgMar");
    current.width = numeric(attr(size, "word", "w"), current.width * 20, 1440, 320000) / 20;
    current.height = numeric(attr(size, "word", "h"), current.height * 20, 1440, 320000) / 20;
    current.margins = {
      left: numeric(attr(margins, "word", "left"), 720, 0, 40000) / 20,
      right: numeric(attr(margins, "word", "right"), 720, 0, 40000) / 20,
      top: numeric(attr(margins, "word", "top"), 720, 0, 40000) / 20,
      bottom: numeric(attr(margins, "word", "bottom"), 720, 0, 40000) / 20,
    };
    if (child(node, "word", "headerReference") || child(node, "word", "footerReference"))
      warnings.add(
        "Cabeçalhos e rodapés do Word não entram neste perfil de fluxo; confira esses conteúdos no original.",
      );
    const cols = child(node, "word", "cols");
    if (cols && numeric(attr(cols, "word", "num"), 1, 1, 100) > 1)
      warnings.add("Colunas de texto são convertidas para um único fluxo de leitura.");
  };
  function paragraph(node: Element) {
    const properties = child(node, "word", "pPr"),
      styleId = wordValue(child(properties, "word", "pStyle"));
    const inherited = { ...defaultStyle, ...(styleId ? resolveStyle(styleId) : {}) };
    const align = wordValue(child(properties, "word", "jc"));
    const heading = styleId?.match(/^Heading([1-6])$/i)?.[1];
    const number = child(properties, "word", "numPr");
    if (number)
      warnings.add(
        "Listas são convertidas em marcadores; numeração hierárquica e reinícios precisam de revisão.",
      );
    let runs: OfficeParagraph["runs"] = [];
    const flush = () => {
      if (runs.length) {
        append({
          kind: "paragraph",
          runs,
          align:
            align === "center" || align === "right"
              ? align
              : align === "both" || align === "distribute"
                ? "justify"
                : "left",
          ...(heading ? { heading: Number(heading) } : {}),
          ...(number ? { bullet: true } : {}),
        });
        runs = [];
      }
    };
    function visit(element: Element, depth: number) {
      if (depth > 100) throw new Error("Parágrafo Word profundo demais.");
      if (isOfficeElement(element, "word", "del")) {
        warnings.add(
          "Alterações controladas são aceitas na conversão: inserções entram e exclusões ficam fora.",
        );
        return;
      }
      if (isOfficeElement(element, "word", "r")) {
        const properties = child(element, "word", "rPr"),
          charStyle = wordValue(child(properties, "word", "rStyle"));
        const style = {
          ...inherited,
          ...(charStyle ? resolveStyle(charStyle) : {}),
          ...defined(runStyle(properties)),
        };
        if (on(child(properties, "word", "vanish"))) {
          warnings.add("Texto marcado como oculto no Word não é exibido na conversão.");
          return;
        }
        for (const item of children(element)) {
          if (isOfficeElement(item, "word", "t"))
            runs.push({ text: countText(item.textContent ?? ""), ...style });
          else if (isOfficeElement(item, "word", "tab")) runs.push({ text: "\t", ...style });
          else if (isOfficeElement(item, "word", "br")) {
            if (attr(item, "word", "type") === "page") {
              flush();
              endPage();
            } else runs.push({ text: "\n", ...style });
          } else if (isOfficeElement(item, "word", "drawing")) {
            flush();
            const blip = descendants(item, "drawing", "blip")[0],
              id = attr(blip, "relation", "embed"),
              relation = id ? relationships.get(id) : undefined;
            if (!relation || relation.external || !relation.type.endsWith("/image")) {
              warnings.add("Uma imagem externa ou sem relacionamento válido não foi incorporada.");
              continue;
            }
            const data = officePart(parts, relation.target);
            let format: "png" | "jpg";
            if (data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71)
              format = "png";
            else if (data[0] === 255 && data[1] === 216) format = "jpg";
            else {
              warnings.add(
                "Imagens Office em formatos diferentes de PNG/JPEG precisam de conversão no original.",
              );
              continue;
            }
            const ext = descendants(item, "drawing", "ext")[0];
            const extent = children(item)
              .flatMap((container) => children(container))
              .find((element) => element.localName === "extent");
            const width =
                numeric(
                  (extent ?? ext)?.getAttribute("cx") ?? undefined,
                  2540000,
                  12700,
                  203200000,
                ) / 12700,
              height =
                numeric(
                  (extent ?? ext)?.getAttribute("cy") ?? undefined,
                  1905000,
                  12700,
                  203200000,
                ) / 12700;
            append({ kind: "image", bytes: new Uint8Array(data), format, width, height, alt: "" });
            warnings.add(
              "Imagens são colocadas no fluxo; ancoragem, corte e sobreposição do Word podem mudar.",
            );
          } else if (
            isOfficeElement(item, "word", "fldChar") ||
            isOfficeElement(item, "word", "instrText")
          )
            warnings.add(
              "Campos automáticos usam apenas o resultado salvo no Word; não são recalculados.",
            );
          else if (!["rPr", "lastRenderedPageBreak", "proofErr"].includes(item.localName ?? ""))
            warnings.add(
              "Há elementos de texto ou desenho fora do perfil local. Confira a prévia com o original.",
            );
        }
      } else
        for (const item of children(element))
          if (!isOfficeElement(item, "word", "pPr")) visit(item, depth + 1);
    }
    if (on(child(properties, "word", "pageBreakBefore")) && current.blocks.length) endPage();
    visit(node, 0);
    flush();
    const sect = child(properties, "word", "sectPr");
    if (sect) {
      section(sect);
      endPage();
    }
  }
  function blocks(container: Element, depth = 0) {
    if (depth > 50) throw new Error("Estrutura Word profunda demais.");
    for (const node of children(container)) {
      if (isOfficeElement(node, "word", "p")) paragraph(node);
      else if (isOfficeElement(node, "word", "tbl")) {
        const rows = children(node)
          .filter((element) => isOfficeElement(element, "word", "tr"))
          .map((row) =>
            children(row)
              .filter((element) => isOfficeElement(element, "word", "tc"))
              .map((cell) => {
                if (
                  descendants(cell, "word", "gridSpan").length ||
                  descendants(cell, "word", "vMerge").length
                )
                  warnings.add(
                    "Mesclagens de células são convertidas em células de texto independentes.",
                  );
                if (descendants(cell, "word", "drawing").length)
                  warnings.add(
                    "Imagens dentro de tabelas não entram no perfil tabular; confira o original.",
                  );
                return countText(descendants(cell, "word", "p").map(textContent).join("\n"));
              }),
          );
        append({ kind: "table", rows, header: descendants(node, "word", "tblHeader").length > 0 });
      } else if (isOfficeElement(node, "word", "sectPr")) section(node);
      else if (isOfficeElement(node, "word", "sdt")) {
        const content = child(node, "word", "sdtContent");
        if (content) blocks(content, depth + 1);
      } else
        warnings.add(
          "Há blocos Word fora do perfil local, como conteúdo vinculado. Confira o original antes de usar a conversão.",
        );
    }
  }
  blocks(body);
  if (current.blocks.length || !pages.length) endPage();
  const document = officeDocumentSchema.parse({ title, pages, warnings: [...warnings] });
  if (!document.pages.some((page) => page.blocks.length))
    throw new Error("O documento não tem conteúdo conversível neste perfil local.");
  return document;
}

export interface ImportedSpreadsheet {
  sheets: OfficeSpreadsheet;
  warnings: string[];
}
export function importXlsx(bytes: Uint8Array): ImportedSpreadsheet {
  const parts = readOfficePackage(bytes),
    workbook = officeXmlPart(parts, "xl/workbook.xml").documentElement;
  if (!workbook || !isOfficeElement(workbook, "sheet", "workbook"))
    throw new Error("Pacote sem pasta de trabalho Excel válida.");
  const relationships = officeRelationships(parts, "xl/workbook.xml"),
    warnings = new Set<string>();
  const sharedRoot = parts.has("xl/sharedstrings.xml")
    ? officeXmlPart(parts, "xl/sharedStrings.xml").documentElement
    : undefined;
  const strings = sharedRoot
    ? children(sharedRoot)
        .filter((item) => isOfficeElement(item, "sheet", "si"))
        .map((item) =>
          descendants(item, "sheet", "t")
            .map((text) => text.textContent ?? "")
            .join(""),
        )
    : [];
  const result: OfficeSpreadsheet = [];
  let cellCount = 0,
    textCount = 0;
  for (const sheet of children(child(workbook, "sheet", "sheets") ?? workbook)) {
    if (!isOfficeElement(sheet, "sheet", "sheet")) continue;
    const id = attr(sheet, "relation", "id"),
      relation = id ? relationships.get(id) : undefined;
    if (!relation || relation.external || !relation.type.endsWith("/worksheet"))
      throw new Error("Planilha sem relacionamento interno válido.");
    if (sheet.getAttribute("state") && sheet.getAttribute("state") !== "visible")
      warnings.add("Planilhas ocultas também são incluídas; revise-as antes de compartilhar.");
    const root = officeXmlPart(parts, relation.target).documentElement;
    if (!root || !isOfficeElement(root, "sheet", "worksheet"))
      throw new Error("Parte Excel não é uma planilha válida.");
    const rows: OfficeCell[][] = [],
      occupied = new Set<string>();
    const data = child(root, "sheet", "sheetData");
    for (const row of data ? children(data) : []) {
      if (!isOfficeElement(row, "sheet", "row")) continue;
      const rowNumber = numeric(row.getAttribute("r") ?? undefined, rows.length + 1, 1, 100000);
      if (!Number.isInteger(rowNumber)) throw new Error("Índice de linha Excel inválido.");
      for (const cell of children(row)) {
        if (!isOfficeElement(cell, "sheet", "c")) continue;
        if (++cellCount > 200000) throw new Error("Planilha excede 200 mil células.");
        const ref = cell.getAttribute("r"),
          match = ref?.match(/^([A-Z]{1,3})([1-9]\d*)$/);
        if (!match?.[1] || Number(match[2]) !== rowNumber)
          throw new Error("Referência de célula Excel inválida.");
        let column = 0;
        for (const char of match[1]) column = column * 26 + char.charCodeAt(0) - 64;
        if (column > 16384 || occupied.has(ref ?? ""))
          throw new Error("Coluna Excel fora dos limites ou célula duplicada.");
        occupied.add(ref ?? "");
        if (rowNumber * column > 200000)
          throw new Error(
            "Área esparsa da planilha excede 200 mil células. Reduza a área utilizada antes da conversão.",
          );
        while (rows.length < rowNumber) rows.push([]);
        const output = rows[rowNumber - 1];
        if (!output) throw new Error("Linha Excel indisponível.");
        while (output.length < column) output.push(null);
        const raw = child(cell, "sheet", "v")?.textContent,
          type = cell.getAttribute("t"),
          formula = child(cell, "sheet", "f");
        if (formula) {
          if (raw === undefined || raw === null)
            throw new Error(
              `A fórmula em ${ref} não tem resultado salvo. Recalcule e salve no aplicativo de origem.`,
            );
          warnings.add(
            "Fórmulas não são executadas: a conversão usa resultados salvos, que podem estar desatualizados.",
          );
        }
        let value: OfficeCell = null;
        if (type === "s") {
          const index = numeric(raw ?? undefined, -1, 0, strings.length - 1);
          if (!Number.isInteger(index) || strings[index] === undefined)
            throw new Error("Índice de texto compartilhado Excel inválido.");
          value = strings[index] ?? "";
        } else if (type === "inlineStr") {
          const inline = child(cell, "sheet", "is");
          value = inline
            ? descendants(inline, "sheet", "t")
                .map((text) => text.textContent ?? "")
                .join("")
            : "";
        } else if (type === "str" || type === "d" || type === "e") {
          value = raw ?? "";
          if (type === "e")
            warnings.add(
              "A planilha contém erros de fórmula; eles aparecem como texto na conversão.",
            );
        } else if (type === "b") {
          if (raw !== "0" && raw !== "1") throw new Error("Valor booleano Excel inválido.");
          value = raw === "1";
        } else if (!type || type === "n") {
          if (raw?.trim()) {
            value = Number(raw);
            if (!Number.isFinite(value)) throw new Error("Número Excel inválido.");
          }
        } else throw new Error(`Tipo de célula Excel não suportado: ${type}.`);
        textCount += String(value ?? "").length;
        if (textCount > 5_000_000) throw new Error("Planilha excede 5 milhões de caracteres.");
        output[column - 1] = value;
        if (cell.getAttribute("s") && cell.getAttribute("s") !== "0")
          warnings.add(
            "Este perfil preserva os valores das células. Formatos de data, moeda, porcentagem e estilos podem aparecer como valores brutos.",
          );
      }
    }
    if (child(root, "sheet", "mergeCells"))
      warnings.add(
        "Células mescladas mantêm o valor na célula de origem, sem reproduzir a mesclagem.",
      );
    if (child(root, "sheet", "drawing") || child(root, "sheet", "legacyDrawing"))
      warnings.add("Gráficos, imagens e comentários da planilha não entram no perfil tabular.");
    result.push({
      name: excelSheetNameSchema.parse(sheet.getAttribute("name") ?? ""),
      rows,
      header: false,
    });
    if (result.length > 100) throw new Error("Pasta de trabalho excede cem planilhas.");
  }
  return { sheets: spreadsheetSchema.parse(result), warnings: [...warnings] };
}

export function spreadsheetDocument(input: ImportedSpreadsheet, title: string): OfficeDocument {
  const sheets = spreadsheetSchema.parse(input.sheets);
  return officeDocumentSchema.parse({
    title,
    warnings: [
      ...input.warnings,
      "Cada planilha é convertida em tabela. A paginação e as larguras são recalculadas localmente.",
    ],
    pages: sheets.flatMap((sheet) => {
      const columns = sheet.rows.reduce((maximum, row) => Math.max(maximum, row.length), 1);
      const pages: OfficeDocument["pages"] = [];
      for (let start = 0; start < columns; start += 10)
        pages.push({
          width: 841.89,
          height: 595.28,
          blocks: [
            {
              kind: "paragraph",
              align: "left",
              runs: [
                {
                  text: `${sheet.name}${columns > 10 ? ` — colunas ${start + 1} a ${Math.min(columns, start + 10)}` : ""}`,
                  bold: true,
                  size: 14,
                },
              ],
            },
            {
              kind: "table",
              header: sheet.header,
              rows: sheet.rows.map((row) => row.slice(start, start + 10)),
            },
          ],
        });
      return pages;
    }),
  });
}
