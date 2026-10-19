import { PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { batchDigest, readBatchArchive, writeBatchArchive } from "./batch-archive.ts";
import {
  type BatchDetail,
  type BatchSettings,
  batchDetailSchema,
  batchSettingsSchema,
} from "./batch-format.ts";
import type { LocalPdfEngine } from "./local-engine.ts";
import { livePdfPages } from "./pdf-pages.ts";
import { extractSplitPart, planSplit, type SplitPlanningProgress } from "./split-plan.ts";

export interface BatchSnapshot {
  bytes: Uint8Array;
  pdf: Uint8Array;
  pages: number;
  extension: "zip";
  warnings: string[];
  detail: BatchDetail;
}
export type BatchImageEncoder = (
  image: { width: number; height: number; pixels: Uint8Array },
  format: "png" | "jpg",
  dpi: number,
) => Promise<Uint8Array>;

/** Complete files are checkpointed before the next file. The source and already completed files are immutable. */
export async function generateBatch(
  pdf: Uint8Array,
  rawSettings: BatchSettings,
  options: {
    engine?: LocalPdfEngine;
    encode?: BatchImageEncoder;
    previous?: { bytes: Uint8Array; detail: BatchDetail };
    checkpoint(snapshot: BatchSnapshot): Promise<void>;
    progress(done: number, total: number): void;
    planning?(value: SplitPlanningProgress): void;
  },
): Promise<BatchSnapshot> {
  if (!pdf.length || pdf.length > 64 * 1024 * 1024)
    throw new Error("Lotes aceitam PDF de até 64 MB.");
  let settings = batchSettingsSchema.parse(rawSettings);
  const source = await PDFDocument.load(pdf, { updateMetadata: false }),
    sourcePages = livePdfPages(source).length,
    sourceSha256 = await batchDigest(pdf);
  if (!sourcePages || sourcePages > 1000) throw new Error("Lotes aceitam entre uma e mil páginas.");
  if (settings.operation === "split" && settings.strategy && !options.previous) {
    if (settings.groups)
      throw new Error("Um lote novo deve planejar seus próprios grupos de divisão.");
    settings = { ...settings, groups: await planSplit(pdf, settings.strategy, options.planning) };
  }
  const total =
    settings.operation === "split"
      ? (settings.groups?.length ?? Math.ceil(sourcePages / settings.pagesPerFile))
      : settings.pages.length;
  let detail = batchDetailSchema.parse({
    kind: "batch",
    version: 1,
    stage: "processing",
    settings,
    sourcePages,
    sourceSha256,
    total,
    files: [],
  });
  const files = new Map<string, Uint8Array>(),
    warnings =
      settings.operation === "images"
        ? [
            "Imagens rasterizam a aparência visível: campos, links e texto pesquisável deixam de ser editáveis. A prévia mostra o arquivo de imagem gerado.",
          ]
        : [
            "As partes conservam os metadados e anexos globais do documento. Revise cada PDF antes de compartilhar.",
          ];
  if (settings.operation === "split" && source.catalog.has(PDFName.of("PageLabels")))
    warnings.push(
      "Rótulos personalizados de página são reiniciados em cada parte; números impressos no conteúdo são conservados.",
    );
  if (options.previous) {
    const previous = batchDetailSchema.parse(options.previous.detail);
    if (
      previous.sourceSha256 !== sourceSha256 ||
      previous.sourcePages !== sourcePages ||
      JSON.stringify(previous.settings) !== JSON.stringify(settings)
    )
      throw new Error("A origem/ajustes não correspondem ao lote retomado.");
    const stored = await readBatchArchive(options.previous.bytes, previous);
    for (const file of previous.files) {
      const data = stored.get(file.name);
      if (!data) throw new Error("Arquivo completo ausente no lote retomado.");
      files.set(file.name, data);
    }
    detail = previous;
  }
  const snapshot = async (): Promise<BatchSnapshot> => ({
    bytes: await writeBatchArchive(detail, files),
    pdf,
    pages: sourcePages,
    extension: "zip",
    warnings,
    detail,
  });
  if (detail.stage === "review") return snapshot();
  const sizes = settings.operation === "images" ? options.engine?.pageSizes(pdf) : undefined;
  let pixels = 0;
  const units = livePdfPages(source).map(
    (page) => page.node.lookupMaybe(PDFName.of("UserUnit"), PDFNumber)?.asNumber() ?? 1,
  );
  if (settings.operation === "images") {
    if (!options.engine || !options.encode || sizes?.length !== sourcePages)
      throw new Error("Motor/encoder de imagens indisponível ou geometria inconsistente.");
    for (const index of settings.pages) {
      const size = sizes[index],
        unit = units[index];
      if (!size || unit === undefined || !Number.isFinite(unit) || unit <= 0 || unit > 75000)
        throw new Error("Geometria/unidade física inválida para exportar imagens.");
      const width = Math.ceil((size.width * unit * settings.dpi) / 72),
        height = Math.ceil((size.height * unit * settings.dpi) / 72);
      pixels += width * height;
      if (
        ![width, height].every(
          (value) => Number.isSafeInteger(value) && value >= 1 && value <= 8192,
        ) ||
        width * height > 24_000_000 ||
        pixels > 512_000_000
      )
        throw new Error("O lote excede os limites de pixels. Reduza páginas ou resolução.");
    }
  }
  if (!detail.files.length) await options.checkpoint(await snapshot());
  for (let index = detail.files.length; index < total; index++) {
    options.progress(index, total);
    let bytes: Uint8Array, name: string, pages: number[];
    if (settings.operation === "split") {
      const first = index * settings.pagesPerFile,
        end = Math.min(sourcePages, first + settings.pagesPerFile);
      const selected =
        settings.groups?.[index] ??
        Array.from({ length: end - first }, (_, offset) => first + offset);
      pages = selected.map((page) => page + 1);
      bytes = await extractSplitPart(pdf, selected);
      name = `parte-${String(index + 1).padStart(3, "0")}.pdf`;
    } else {
      const page = settings.pages[index],
        unit = page === undefined ? undefined : units[page];
      if (page === undefined || unit === undefined || !options.engine || !options.encode)
        throw new Error("Página/motor ausente na exportação de imagens.");
      bytes = await options.encode(
        options.engine.renderPage(pdf, page, settings.dpi, "", unit),
        settings.format,
        settings.dpi,
      );
      pages = [page + 1];
      name = `pagina-${String(page + 1).padStart(4, "0")}.${settings.format}`;
    }
    detail = batchDetailSchema.parse({
      ...detail,
      stage: index + 1 === total ? "review" : "processing",
      files: [
        ...detail.files,
        { name, pages, bytes: bytes.length, sha256: await batchDigest(bytes) },
      ],
    });
    files.set(name, bytes);
    if (detail.stage === "processing") await options.checkpoint(await snapshot());
  }
  options.progress(total, total);
  return snapshot();
}
