import {
  clip,
  degrees,
  endPath,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from "pdf-lib";
import { parsePageRange } from "./page-ranges.ts";
import { type PrintSettings, printSettingsSchema } from "./print-format.ts";

export interface PrintLayout {
  sheets: (number | null)[][];
  columns: number;
  rows: number;
  selected: number[];
}
/** PDF sides in feed order. Null slots are intentional blank pages. */
export function printLayout(total: number, raw: PrintSettings): PrintLayout {
  const options = printSettingsSchema.parse(raw),
    selected = parsePageRange(options.range, total);
  if (!selected.length) throw new Error("A seleção de impressão não contém páginas.");
  if (selected.length > 2000) throw new Error("Selecione até 2000 páginas por impressão.");
  if (options.reverse) selected.reverse();
  if (options.layout === "booklet") {
    const padded: (number | null)[] = [...selected];
    while (padded.length % 4) padded.push(null);
    const sheets: (number | null)[][] = [];
    for (let first = 0, last = padded.length - 1; first < last; first += 2, last -= 2)
      sheets.push([padded[last], padded[first]], [padded[first + 1], padded[last - 1]]);
    return { sheets, columns: 2, rows: 1, selected };
  }
  const count = options.layout === "single" ? 1 : options.perSheet;
  const columns =
    count === 2 || count === 4 || count === 6 ? 2 : count === 9 ? 3 : count === 16 ? 4 : 1;
  const rows = count / columns,
    sheets: (number | null)[][] = [];
  for (let offset = 0; offset < selected.length; offset += count)
    sheets.push(selected.slice(offset, offset + count));
  return { sheets, columns, rows, selected };
}

/** Input is Chromium's flattened print copy, so annotation appearances already belong to page content. */
export async function imposePrintPdf(
  bytes: Uint8Array,
  raw: PrintSettings,
): Promise<{ bytes: Uint8Array; pages: number; warnings: string[] }> {
  const settings = printSettingsSchema.parse(raw);
  if (!bytes.length || bytes.length > 64 * 1024 * 1024)
    throw new Error("A cópia de impressão excede 64 MB.");
  const source = await PDFDocument.load(bytes, { updateMetadata: false }),
    layout = printLayout(source.getPageCount(), settings);
  if (source.isEncrypted)
    throw new Error("A composição exige uma cópia de impressão já autorizada.");
  if (source.getPages().some((page) => (page.node.Annots()?.size() ?? 0) > 0))
    throw new Error("Prepare as aparências de anotações antes de compor a impressão.");
  const output = await PDFDocument.create(),
    warnings = new Set<string>();
  if (settings.layout === "single" && settings.paper === "original" && settings.scale === 100) {
    for (const page of await output.copyPages(source, layout.selected)) output.addPage(page);
  } else {
    const paper =
      settings.paper === "letter"
        ? [612, 792]
        : settings.paper === "a3"
          ? [841.8898, 1190.551]
          : [595.2756, 841.8898];
    if (settings.landscape || settings.layout === "booklet") paper.reverse();
    const embedded = new Map<number, Awaited<ReturnType<typeof output.embedPage>>>();
    for (const side of layout.sheets) {
      let [width, height] = paper;
      const margin = settings.paper === "original" ? 0 : settings.margin;
      if (settings.paper === "original") {
        const index = side[0];
        if (index === null || index === undefined)
          throw new Error("A folha original não tem uma página de origem.");
        const page = source.getPage(index),
          crop = page.getCropBox(),
          rotation = ((page.getRotation().angle % 360) + 360) % 360;
        [width, height] =
          rotation === 90 || rotation === 270
            ? [crop.height, crop.width]
            : [crop.width, crop.height];
      }
      const cellW = (width - margin * 2) / layout.columns,
        cellH = (height - margin * 2) / layout.rows;
      if (cellW < 10 || cellH < 10)
        throw new Error("As margens não deixam espaço para as páginas.");
      const sheet = output.addPage([width, height]);
      for (let slot = 0; slot < side.length; slot++) {
        const index = side[slot];
        if (index === null) continue;
        const page = source.getPage(index),
          crop = page.getCropBox(),
          rotation = ((page.getRotation().angle % 360) + 360) % 360;
        if (
          ![0, 90, 180, 270].includes(rotation) ||
          crop.width <= 0 ||
          crop.height <= 0 ||
          ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
        )
          throw new Error("A geometria da página não permite composição de impressão.");
        let image = embedded.get(index);
        if (!image) {
          image = await output.embedPage(page, {
            left: crop.x,
            bottom: crop.y,
            right: crop.x + crop.width,
            top: crop.y + crop.height,
          });
          embedded.set(index, image);
        }
        const rotated = rotation === 90 || rotation === 270,
          sourceW = rotated ? crop.height : crop.width,
          sourceH = rotated ? crop.width : crop.height;
        const scale =
          ((settings.fit ? Math.min(cellW / sourceW, cellH / sourceH) : 1) * settings.scale) / 100;
        const displayW = sourceW * scale,
          displayH = sourceH * scale;
        const left = margin + (slot % layout.columns) * cellW,
          bottom = height - margin - (Math.floor(slot / layout.columns) + 1) * cellH;
        const x = left + (cellW - displayW) / 2,
          y = bottom + (cellH - displayH) / 2;
        if (displayW > cellW + 0.01 || displayH > cellH + 0.01)
          warnings.add(
            "A escala escolhida corta conteúdo nas bordas da célula. Confira a prévia ou use Ajustar.",
          );
        sheet.pushOperators(
          pushGraphicsState(),
          rectangle(left, bottom, cellW, cellH),
          clip(),
          endPath(),
        );
        sheet.drawPage(image, {
          x: x + (rotation === 180 || rotation === 270 ? displayW : 0),
          y: y + (rotation === 90 || rotation === 180 ? displayH : 0),
          width: crop.width * scale,
          height: crop.height * scale,
          rotate: degrees(-rotation),
        });
        sheet.pushOperators(popGraphicsState());
      }
    }
  }
  if (settings.layout === "booklet" && layout.selected.length % 4) warnings.add(`O livreto inclui ${4 - layout.selected.length % 4} espaços vazios para completar a sequência.`);
  if (settings.layout === "booklet")
    warnings.add(
      "Livreto: imprima frente e verso pela borda curta e dobre ao meio. Confira a ordem e o sentido da sua impressora.",
    );
  output.setTitle("Cópia preparada para impressão");
  output.setProducer("EdiPDF — composição local de impressão");
  return { bytes: await output.save(), pages: output.getPageCount(), warnings: [...warnings] };
}
