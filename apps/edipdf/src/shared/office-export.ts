import { strToU8 } from "fflate";
import {
  excelSheetNameSchema,
  type OfficeBlock,
  type OfficeCell,
  type OfficeDocument,
  type OfficeSpreadsheet,
  officeDocumentSchema,
  spreadsheetSchema,
} from "./office-format.ts";
import { writeOfficePackage } from "./office-package.ts";
import { XML_HEADER, xml } from "./office-xml.ts";
import { validateRasterImage } from "./raster-image.ts";
import { assertGlyphs, type UnicodeFonts } from "./unicode-fonts.ts";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const relationships = (entries: { id: string; type: string; target: string }[]) =>
  `${XML_HEADER}<Relationships xmlns="${P}">${entries.map((entry) => `<Relationship Id="${xml(entry.id)}" Type="${xml(entry.type.includes(":") ? entry.type : `${R}/${entry.type}`)}" Target="${xml(entry.target)}"/>`).join("")}</Relationships>`;
const textRun = (
  text: string,
  options: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {},
) =>
  `<w:r><w:rPr><w:rFonts w:ascii="Noto Sans" w:hAnsi="Noto Sans" w:cs="Noto Sans"/>${options.bold ? "<w:b/>" : ""}${options.italic ? "<w:i/>" : ""}${options.color ? `<w:color w:val="${options.color.slice(1)}"/>` : ""}<w:sz w:val="${Math.round((options.size ?? 11) * 2)}"/></w:rPr>${text
    .split(/\r\n?|\n/)
    .map((line) =>
      line
        .split("\t")
        .map((part) => `<w:t xml:space="preserve">${xml(part)}</w:t>`)
        .join("<w:tab/>"),
    )
    .join("<w:br/>")}</w:r>`;
const cellText = (cell: OfficeCell) => (cell === null ? "" : String(cell));

/** ECMA-376 font embedding, not encryption. Only caller-provided licensed font bytes are embedded. */
export function obfuscateOfficeFont(font: Uint8Array, guid: string): Uint8Array {
  const hex = guid.replace(/[{}-]/g, "");
  if (!/^[a-f\d]{32}$/i.test(hex) || font.length < 32)
    throw new Error("Fonte ou chave de incorporação inválida.");
  const key = Uint8Array.from(
    Array.from({ length: 16 }, (_, index) =>
      Number.parseInt(hex.slice((15 - index) * 2, (16 - index) * 2), 16),
    ),
  );
  const bytes = new Uint8Array(font);
  for (let i = 0; i < 32; i++) {
    const value = bytes[i],
      code = key[i % 16];
    if (value === undefined || code === undefined)
      throw new Error("Dados de incorporação da fonte incompletos.");
    bytes[i] = value ^ code;
  }
  return bytes;
}

export function exportDocx(
  input: OfficeDocument,
  fonts: UnicodeFonts,
  fontLicense: string,
): Uint8Array {
  const document = officeDocumentSchema.parse(input);
  if (fontLicense.trim().length < 100)
    throw new Error("Inclua o aviso de licença das fontes incorporadas.");
  const content = document.pages
    .flatMap((page) =>
      page.blocks.flatMap((block) =>
        block.kind === "paragraph"
          ? block.runs.map((run) => run.text)
          : block.kind === "table"
            ? block.rows.flat().map(cellText)
            : [],
      ),
    )
    .join("\n");
  for (const bytes of Object.values(fonts)) assertGlyphs(bytes, `${content}•`);
  const parts: Record<string, Uint8Array> = {};
  const put = (name: string, value: string) => {
    parts[name] = strToU8(value);
  };
  parts["word/fonts/LICENSE.txt"] = strToU8(fontLicense);
  const fontStyles = ["regular", "bold", "italic", "boldItalic"] as const;
  const fontTags = {
    regular: "embedRegular",
    bold: "embedBold",
    italic: "embedItalic",
    boldItalic: "embedBoldItalic",
  };
  const fontEntries = fontStyles.map((style) => {
    const key = `{${crypto.randomUUID().toUpperCase()}}`;
    parts[`word/fonts/${style}.odttf`] = obfuscateOfficeFont(fonts[style], key);
    return `<w:${fontTags[style]} r:id="font-${style}" w:fontKey="${key}"/>`;
  });
  put(
    "word/fontTable.xml",
    `${XML_HEADER}<w:fonts xmlns:w="${W}" xmlns:r="${R}"><w:font w:name="Noto Sans">${fontEntries.join("")}</w:font></w:fonts>`,
  );
  put(
    "word/_rels/fontTable.xml.rels",
    relationships(
      fontStyles.map((style) => ({
        id: `font-${style}`,
        type: "font",
        target: `fonts/${style}.odttf`,
      })),
    ),
  );
  const rels = [
    { id: "styles", type: "styles", target: "styles.xml" },
    { id: "fonts", type: "fontTable", target: "fontTable.xml" },
    { id: "numbering", type: "numbering", target: "numbering.xml" },
  ];
  let imageNumber = 0;
  const blockXml = (block: OfficeBlock, width: number): string => {
    if (block.kind === "paragraph")
      return `<w:p><w:pPr>${block.heading ? `<w:pStyle w:val="Heading${block.heading}"/>` : ""}${block.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ""}<w:spacing w:after="80"/><w:jc w:val="${block.align === "justify" ? "both" : block.align}"/></w:pPr>${block.runs.map((run) => textRun(run.text, run)).join("")}</w:p>`;
    if (block.kind === "table") {
      const columns = block.rows.reduce((maximum, row) => Math.max(maximum, row.length), 1),
        columnWidth = Math.floor((width * 20) / columns);
      return `<w:tbl><w:tblPr><w:tblW w:w="${Math.round(width * 20)}" w:type="dxa"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((edge) => `<w:${edge} w:val="single" w:sz="4" w:color="B8B8B8"/>`).join("")}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${Array.from({ length: columns }, () => `<w:gridCol w:w="${columnWidth}"/>`).join("")}</w:tblGrid>${block.rows.map((row, index) => `<w:tr>${block.header && index === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${Array.from({ length: columns }, (_, column) => `<w:tc><w:tcPr><w:tcW w:w="${columnWidth}" w:type="dxa"/></w:tcPr><w:p>${textRun(cellText(row[column] ?? null), { bold: block.header && index === 0 })}</w:p></w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
    }
    validateRasterImage(block.bytes, block.format);
    const id = ++imageNumber,
      name = `image${id}.${block.format}`;
    parts[`word/media/${name}`] = block.bytes;
    rels.push({ id: `image-${id}`, type: "image", target: `media/${name}` });
    const scale = Math.min(1, width / block.width),
      cx = Math.round(block.width * scale * 12700),
      cy = Math.round(block.height * scale * 12700);
    return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Imagem ${id}" descr="${xml(block.alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image-${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  };
  const section = (page: OfficeDocument["pages"][number]) => {
    const margin = page.margins ?? { left: 36, right: 36, top: 36, bottom: 36 };
    return `<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${Math.round(page.width * 20)}" w:h="${Math.round(page.height * 20)}"/><w:pgMar w:top="${Math.round(margin.top * 20)}" w:right="${Math.round(margin.right * 20)}" w:bottom="${Math.round(margin.bottom * 20)}" w:left="${Math.round(margin.left * 20)}" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>`;
  };
  const pages = document.pages
    .map((page, index) => {
      if (page.width > 1584 || page.height > 1584)
        throw new Error(
          "O Word aceita páginas de até 22 polegadas. Redimensione a cópia antes de converter.",
        );
      return (
        page.blocks
          .map((block) =>
            blockXml(block, page.width - (page.margins?.left ?? 36) - (page.margins?.right ?? 36)),
          )
          .join("") +
        (index + 1 < document.pages.length
          ? `<w:p><w:pPr>${section(page)}</w:pPr></w:p>`
          : section(page))
      );
    })
    .join("");
  put(
    "docProps/core.xml",
    `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(document.title)}</dc:title><dc:creator>EdiPDF</dc:creator></cp:coreProperties>`,
  );
  put(
    "word/document.xml",
    `${XML_HEADER}<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${pages}</w:body></w:document>`,
  );
  put("word/_rels/document.xml.rels", relationships(rels));
  put(
    "word/styles.xml",
    `${XML_HEADER}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Noto Sans" w:hAnsi="Noto Sans"/><w:sz w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${Array.from({ length: 6 }, (_, i) => `<w:style w:type="paragraph" w:styleId="Heading${i + 1}"><w:name w:val="heading ${i + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="${i}"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>`).join("")}</w:styles>`,
  );
  put(
    "word/numbering.xml",
    `${XML_HEADER}<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="180"/></w:pPr><w:rPr><w:rFonts w:ascii="Noto Sans" w:hAnsi="Noto Sans"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
  );
  put(
    "[Content_Types].xml",
    `${XML_HEADER}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="txt" ContentType="text/plain"/><Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${["document", "styles", "numbering", "fontTable"].map((part) => `<Override PartName="/word/${part}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${part === "document" ? "document.main" : part}+xml"/>`).join("")}</Types>`,
  );
  put(
    "_rels/.rels",
    relationships([
      { id: "document", type: "officeDocument", target: "word/document.xml" },
      { id: "core", type: `${P}/metadata/core-properties`, target: "docProps/core.xml" },
    ]),
  );
  return writeOfficePackage(parts);
}

function columnName(index: number): string {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
}
export function exportXlsx(input: OfficeSpreadsheet): Uint8Array {
  const sheets = spreadsheetSchema.parse(input),
    parts: Record<string, Uint8Array> = {};
  const put = (name: string, value: string) => {
    parts[name] = strToU8(value);
  };
  const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  sheets.forEach((sheet, index) => {
    excelSheetNameSchema.parse(sheet.name);
    const columns = sheet.rows.reduce((maximum, row) => Math.max(maximum, row.length), 1),
      last = `${columnName(columns - 1)}${Math.max(1, sheet.rows.length)}`;
    const rows = sheet.rows
      .map(
        (row, r) =>
          `<row r="${r + 1}">${row
            .map((cell, c) => {
              const ref = `${columnName(c)}${r + 1}`,
                style = sheet.header && r === 0 ? ' s="1"' : "";
              if (cell === null) return `<c r="${ref}"${style}/>`;
              if (typeof cell === "number") return `<c r="${ref}"${style}><v>${cell}</v></c>`;
              if (typeof cell === "boolean")
                return `<c r="${ref}"${style} t="b"><v>${cell ? 1 : 0}</v></c>`;
              return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`;
            })
            .join("")}</row>`,
      )
      .join("");
    put(
      `xl/worksheets/sheet${index + 1}.xml`,
      `${XML_HEADER}<worksheet xmlns="${S}"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0">${sheet.header ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ""}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rows}</sheetData>${sheet.header && sheet.rows.length ? `<autoFilter ref="A1:${last}"/>` : ""}</worksheet>`,
    );
  });
  put(
    "xl/workbook.xml",
    `${XML_HEADER}<workbook xmlns="${S}" xmlns:r="${R}"><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="sheet-${index + 1}"/>`).join("")}</sheets></workbook>`,
  );
  put(
    "xl/_rels/workbook.xml.rels",
    relationships([
      ...sheets.map((_, index) => ({
        id: `sheet-${index + 1}`,
        type: "worksheet",
        target: `worksheets/sheet${index + 1}.xml`,
      })),
      { id: "styles", type: "styles", target: "styles.xml" },
    ]),
  );
  put(
    "xl/styles.xml",
    `${XML_HEADER}<styleSheet xmlns="${S}"><fonts count="2"><font><sz val="11"/><name val="Noto Sans"/></font><font><b/><sz val="11"/><name val="Noto Sans"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  );
  put(
    "[Content_Types].xml",
    `${XML_HEADER}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
  );
  put(
    "_rels/.rels",
    relationships([{ id: "workbook", type: "officeDocument", target: "xl/workbook.xml" }]),
  );
  return writeOfficePackage(parts);
}

export function exportTableCsv(
  rows: OfficeCell[][],
  separator: "," | ";" | "\t" = ";",
  protectFormulas = true,
): Uint8Array {
  const data = spreadsheetSchema.parse([{ name: "Dados", rows, header: false }])[0];
  if (!data) throw new Error("Tabela ausente.");
  const text = data.rows
    .map((row) =>
      row
        .map((cell) => {
          let value = cellText(cell);
          if (
            protectFormulas &&
            typeof cell === "string" &&
            /^[=+\-@]/.test(value.normalize("NFKC").trimStart())
          )
            value = `'${value}`;
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(separator),
    )
    .join("\r\n");
  return strToU8(`\uFEFF${text}`);
}
