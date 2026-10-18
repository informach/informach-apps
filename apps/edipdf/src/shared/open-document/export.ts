import { strToU8 } from "fflate";
import { type OfficeCell, type OfficeDocument, officeDocumentSchema } from "../office-format.ts";
import { XML_HEADER, xml } from "../office-xml.ts";
import { validateRasterImage } from "../raster-image.ts";
import { assertGlyphs, type UnicodeFonts } from "../unicode-fonts.ts";
import { openDocumentFonts } from "./fonts.ts";
import { namespaces, writeOpenPackage } from "./package.ts";

const pt = (value: number) => `${Number(value.toFixed(4))}pt`;
export function openText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/( +|\t|\n)/)
    .map((piece) =>
      piece.startsWith(" ")
        ? `<text:s text:c="${piece.length}"/>`
        : piece === "\t"
          ? "<text:tab/>"
          : piece === "\n"
            ? "<text:line-break/>"
            : xml(piece),
    )
    .join("");
}
export function openCell(cell: OfficeCell): string {
  const value = cell === null ? "" : `<text:p>${openText(String(cell))}</text:p>`;
  if (cell === null) return "<table:table-cell/>";
  if (typeof cell === "number")
    return `<table:table-cell office:value-type="float" office:value="${cell}">${value}</table:table-cell>`;
  if (typeof cell === "boolean")
    return `<table:table-cell office:value-type="boolean" office:boolean-value="${cell}">${value}</table:table-cell>`;
  return `<table:table-cell office:value-type="string">${value}</table:table-cell>`;
}
export function exportOdt(input: OfficeDocument, fonts: UnicodeFonts, license: string): Uint8Array {
  const document = officeDocumentSchema.parse(input),
    { parts, media, faces } = openDocumentFonts(fonts, license),
    automatic: string[] = [],
    layouts: string[] = [],
    masters: string[] = [],
    blocks: string[] = [];
  let runId = 0,
    blockId = 0,
    imageId = 0;
  const fontKeys: (keyof UnicodeFonts)[] = ["regular", "bold", "italic", "boldItalic"];
  const glyphText: Record<keyof UnicodeFonts, string[]> = {
    regular: [],
    bold: [],
    italic: [],
    boldItalic: [],
  };
  const fontKey = (run: { bold?: boolean; italic?: boolean }): keyof UnicodeFonts =>
    run.bold && run.italic ? "boldItalic" : run.bold ? "bold" : run.italic ? "italic" : "regular";
  for (const page of document.pages)
    for (const block of page.blocks) {
      if (block.kind === "paragraph") {
        for (const run of block.runs) glyphText[fontKey(run)].push(run.text);
        if (block.bullet) glyphText.regular.push("•");
      } else if (block.kind === "table")
        for (const row of block.rows)
          for (const cell of row) glyphText.regular.push(String(cell ?? ""));
    }
  for (const key of fontKeys) assertGlyphs(fonts[key], glyphText[key].join(""));
  const textRuns = (
    runs: OfficeDocument["pages"][number]["blocks"][number] & { kind: "paragraph" },
  ) =>
    runs.runs
      .map((run) => {
        const name = `R${++runId}`,
          key = fontKey(run);
        automatic.push(
          `<style:style style:name="${name}" style:family="text"><style:text-properties style:font-name="Noto-${key}" fo:font-size="${pt(run.size ?? 11)}" fo:font-weight="${run.bold ? "bold" : "normal"}" fo:font-style="${run.italic ? "italic" : "normal"}"${run.color ? ` fo:color="${run.color}"` : ""}/></style:style>`,
        );
        return `<text:span text:style-name="${name}">${openText(run.text)}</text:span>`;
      })
      .join("");
  document.pages.forEach((page, pageIndex) => {
    const margins = page.margins ?? { left: 36, right: 36, top: 36, bottom: 36 },
      master = `M${pageIndex}`,
      layout = `L${pageIndex}`;
    layouts.push(
      `<style:page-layout style:name="${layout}"><style:page-layout-properties fo:page-width="${pt(page.width)}" fo:page-height="${pt(page.height)}" fo:margin-left="${pt(margins.left)}" fo:margin-right="${pt(margins.right)}" fo:margin-top="${pt(margins.top)}" fo:margin-bottom="${pt(margins.bottom)}" style:print-orientation="${page.width > page.height ? "landscape" : "portrait"}"/></style:page-layout>`,
    );
    masters.push(`<style:master-page style:name="${master}" style:page-layout-name="${layout}"/>`);
    const content = page.blocks.length
      ? page.blocks
      : [{ kind: "paragraph" as const, runs: [], align: "left" as const }];
    content.forEach((block, index) => {
      const name = `B${++blockId}`,
        family = block.kind === "table" ? "table" : "paragraph",
        first = index === 0;
      automatic.push(
        `<style:style style:name="${name}" style:family="${family}"${first ? ` style:master-page-name="${master}"` : ""}><style:${family}-properties${first && pageIndex ? ' fo:break-before="page"' : ""}${block.kind === "paragraph" ? ` fo:text-align="${block.align}"` : ""}/></style:style>`,
      );
      if (block.kind === "paragraph") {
        const tag = block.heading ? "text:h" : "text:p";
        blocks.push(
          `<${tag} text:style-name="${name}"${block.heading ? ` text:outline-level="${block.heading}"` : ""}>${block.bullet ? "•<text:s/>" : ""}${textRuns(block)}</${tag}>`,
        );
      } else if (block.kind === "table") {
        blocks.push(
          `<table:table table:name="Tabela${blockId}" table:style-name="${name}"><table:table-column table:number-columns-repeated="${block.rows.reduce((max, row) => Math.max(max, row.length), 1)}"/>${(block.rows.length ? block.rows : [[]]).map((row, rowIndex) => `${block.header && rowIndex === 0 ? "<table:table-header-rows>" : ""}<table:table-row>${row.length ? row.map(openCell).join("") : "<table:table-cell/>"}</table:table-row>${block.header && rowIndex === 0 ? "</table:table-header-rows>" : ""}`).join("")}</table:table>`,
        );
      } else {
        validateRasterImage(block.bytes, block.format);
        const path = `Pictures/image${++imageId}.${block.format}`;
        parts[path] = block.bytes;
        media.set(path, block.format === "png" ? "image/png" : "image/jpeg");
        blocks.push(
          `<text:p text:style-name="${name}"><draw:frame draw:name="Imagem${imageId}" text:anchor-type="as-char" svg:width="${pt(block.width)}" svg:height="${pt(block.height)}"><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${block.alt ? `<svg:desc>${xml(block.alt)}</svg:desc>` : ""}</draw:frame></text:p>`,
        );
      }
    });
  });
  parts["content.xml"] = strToU8(
    `${XML_HEADER}<office:document-content ${namespaces} office:version="1.3"><office:font-face-decls>${faces}</office:font-face-decls><office:automatic-styles>${automatic.join("")}</office:automatic-styles><office:body><office:text>${blocks.join("")}</office:text></office:body></office:document-content>`,
  );
  parts["styles.xml"] = strToU8(
    `${XML_HEADER}<office:document-styles ${namespaces} office:version="1.3"><office:font-face-decls>${faces}</office:font-face-decls><office:styles><style:default-style style:family="paragraph"><style:text-properties style:font-name="Noto-regular" fo:font-size="11pt"/></style:default-style></office:styles><office:automatic-styles>${layouts.join("")}</office:automatic-styles><office:master-styles>${masters.join("")}</office:master-styles></office:document-styles>`,
  );
  parts["meta.xml"] = strToU8(
    `${XML_HEADER}<office:document-meta ${namespaces} office:version="1.3"><office:meta><dc:title>${xml(document.title)}</dc:title><meta:generator>EdiPDF</meta:generator></office:meta></office:document-meta>`,
  );
  return writeOpenPackage("text", parts, media);
}
