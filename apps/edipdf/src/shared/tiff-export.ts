import { zlibSync } from "fflate";
import { PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import type { LocalPdfEngine } from "./local-engine.ts";

/** A bounded sequential TIFF writer. Only compressed pages survive between render calls. */
export async function pdfToTiff(
  bytes: Uint8Array,
  engine: LocalPdfEngine,
  dpi = 200,
  progress?: (page: number, total: number) => void,
): Promise<{ bytes: Uint8Array; pages: number; warnings: string[] }> {
  if (![150, 200, 300].includes(dpi) || bytes.length > 64 * 1024 * 1024)
    throw new Error("Exportação TIFF exige 150, 200 ou 300 dpi e PDF até 64 MB.");
  const pdf = await PDFDocument.load(bytes);
  const units = pdf
    .getPages()
    .map((page) => page.node.lookupMaybe(PDFName.of("UserUnit"), PDFNumber)?.asNumber() ?? 1);
  if (units.some((unit) => !Number.isFinite(unit) || unit <= 0 || unit > 75000))
    throw new Error("Unidade física PDF inválida para exportação TIFF.");
  const sizes = engine.pageSizes(bytes).map((size, index) => {
    const unit = units[index];
    if (unit === undefined) throw new Error("Geometria PDF inconsistente entre os motores locais.");
    return { width: size.width * unit, height: size.height * unit, unit };
  });
  if (sizes.length > 100) throw new Error("Exportação TIFF limitada a cem páginas por arquivo.");
  let pixels = 0;
  for (const size of sizes) {
    const width = Math.ceil((size.width * dpi) / 72),
      height = Math.ceil((size.height * dpi) / 72);
    pixels += width * height;
    if (
      ![width, height].every(
        (value) => Number.isSafeInteger(value) && value >= 1 && value <= 8192,
      ) ||
      width * height > 24_000_000 ||
      pixels > 512_000_000
    )
      throw new Error(
        "O conjunto TIFF excede os limites de resolução ou pixels; reduza o intervalo ou dpi.",
      );
  }
  const count = 13,
    directorySize = 2 + count * 12 + 4,
    metadataSize = directorySize + 6 + 16;
  const chunks: Uint8Array[] = [],
    offsets: number[] = [];
  let total = 8;
  for (const [index, size] of sizes.entries()) {
    const image = engine.renderPage(bytes, index, dpi, "", size.unit),
      encoded = zlibSync(image.pixels),
      metadata = new Uint8Array(metadataSize),
      view = new DataView(metadata.buffer);
    if (total + metadata.length + encoded.length > 64 * 1024 * 1024)
      throw new Error(
        "TIFF acima de 64 MB; reduza o intervalo ou dpi. Nenhum arquivo parcial foi salvo.",
      );
    offsets.push(total);
    view.setUint16(0, count, true);
    const fields: [number, number, number, number][] = [
      [256, 4, 1, image.width],
      [257, 4, 1, image.height],
      [258, 3, 3, total + directorySize],
      [259, 3, 1, 8],
      [262, 3, 1, 2],
      [273, 4, 1, total + metadataSize],
      [277, 3, 1, 3],
      [278, 4, 1, image.height],
      [279, 4, 1, encoded.length],
      [282, 5, 1, total + directorySize + 6],
      [283, 5, 1, total + directorySize + 14],
      [284, 3, 1, 1],
      [296, 3, 1, 2],
    ];
    for (const [field, [id, type, items, value]] of fields.entries()) {
      const at = 2 + field * 12;
      view.setUint16(at, id, true);
      view.setUint16(at + 2, type, true);
      view.setUint32(at + 4, items, true);
      if (type === 3 && items === 1) view.setUint16(at + 8, value, true);
      else view.setUint32(at + 8, value, true);
    }
    for (let sample = 0; sample < 3; sample++) view.setUint16(directorySize + sample * 2, 8, true);
    for (const offset of [directorySize + 6, directorySize + 14]) {
      view.setUint32(offset, dpi, true);
      view.setUint32(offset + 4, 1, true);
    }
    chunks.push(metadata, encoded);
    total += metadata.length + encoded.length;
    progress?.(index + 1, sizes.length);
  }
  const output = new Uint8Array(total),
    header = new DataView(output.buffer);
  header.setUint16(0, 0x4949);
  header.setUint16(2, 42, true);
  header.setUint32(4, 8, true);
  let at = 8;
  for (const [index, chunk] of chunks.entries()) {
    if (index % 2 === 0)
      new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength).setUint32(
        2 + count * 12,
        offsets[index / 2 + 1] ?? 0,
        true,
      );
    output.set(chunk, at);
    at += chunk.length;
  }
  return {
    bytes: output,
    pages: sizes.length,
    warnings: [
      `TIFF RGB a ${dpi} dpi, com fundo branco e compressão sem perdas. Texto, formulários, links e anotações tornam-se pixels; mantenha o PDF original.`,
    ],
  };
}
