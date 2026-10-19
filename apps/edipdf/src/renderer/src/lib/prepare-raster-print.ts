import { dataUrlToBytes } from "@shared/build";
import { viewSize } from "@shared/model";
import { parsePageRange } from "@shared/page-ranges";
import { DEFAULT_PRINT_SETTINGS, printSettingsSchema } from "@shared/print-format";
import type { RasterPrintRequest } from "@shared/raster-print";
import type { TaskResult } from "@shared/task-format";
import type { DocState } from "../state/store";
import { getSource, holdSourcesForTask, pageInfo, renderToDataUrl } from "./pdf";
import { composeRasterPrint } from "./raster-print";
import { documentOriginPaths } from "./recovery";
import { beginLocalTask, type LocalTask } from "./tasks";

export async function prepareRestrictedPrint(
  doc: DocState,
  range: string,
  signal: AbortSignal,
  acquired: (job: LocalTask) => void,
  progress: (message: string) => void,
  problem: (message: string) => void,
): Promise<TaskResult> {
  const refs = parsePageRange(
    printSettingsSchema.shape.range.parse(range),
    doc.content.pages.length,
  ).map((index) => {
    const ref = doc.content.pages[index];
    if (!ref) throw new Error("A seleção de páginas mudou.");
    return ref;
  });
  if (!doc.readOnly || !refs.length || refs.length > 100)
    throw new Error("A impressão restrita aceita entre uma e cem páginas.");
  const sources = new Set<string>();
  let pixels = 0,
    sourceBytes = 0,
    largest = 0;
  for (const ref of refs) {
    const source = getSource(ref.src);
    if (!source?.canPrint) throw new Error("O documento não permite impressão com esta senha.");
    if (!sources.has(ref.src)) {
      sources.add(ref.src);
      sourceBytes += source.bytes.length;
    }
    const size = viewSize(ref, pageInfo(ref)),
      width = Math.round((size.w / 72) * 200),
      height = Math.round((size.h / 72) * 200);
    const area = width * height;
    if (
      ![width, height].every(Number.isFinite) ||
      width < 1 ||
      height < 1 ||
      width > 8192 ||
      height > 8192 ||
      area > 24_000_000
    )
      throw new Error("Uma página excede 24 megapixels/8192 pixels por lado a 200 dpi.");
    pixels += area;
    largest = Math.max(largest, area);
  }
  if (pixels > 512_000_000) throw new Error("A impressão excede 512 megapixels no total.");
  const inputBytes = sourceBytes + largest * 4 + 64 * 1024 * 1024;
  if (inputBytes > 512 * 1024 * 1024)
    throw new Error("A impressão excede a reserva local de memória.");
  const releaseSources = holdSourcesForTask([...sources]);
  try {
    const job = await beginLocalTask(
      {
        id: crypto.randomUUID(),
        kind: "printing",
        label: `Imprimir ${doc.name} como imagens`,
        defaultName: `${doc.name.replace(/\.pdf$/i, "")} (impressão restrita).pdf`,
        extension: "pdf",
        inputBytes,
        originPaths: documentOriginPaths(doc),
        printOnly: true,
      },
      signal,
      problem,
    );
    acquired(job);
    const pages: RasterPrintRequest["pages"] = [];
    let bytesTotal = 0;
    for (const [index, ref] of refs.entries()) {
      job.signal.throwIfAborted();
      const text = `Preparando imagem ${index + 1} de ${refs.length}…`;
      job.describe(text);
      progress(text);
      const size = viewSize(ref, pageInfo(ref));
      const bytes = dataUrlToBytes(
        await renderToDataUrl(ref, Math.round((size.w / 72) * 200), "image/jpeg", 0.92, job.signal),
      );
      bytesTotal += bytes.length;
      if (bytesTotal > 64 * 1024 * 1024) throw new Error("As imagens de impressão excedem 64 MB.");
      pages.push({ bytes, width: size.w, height: size.h });
    }
    job.describe("Compondo cópia de aparência para imprimir…");
    const output = await composeRasterPrint({ pages }, job.signal);
    const result: TaskResult = {
      bytes: output.bytes,
      pdf: output.bytes,
      pages: output.pages,
      extension: "pdf",
      warnings: [
        `Páginas de origem: ${range}. A prévia segue a ordem selecionada.`,
        "Impressão como imagens a 200 dpi. Esta senha não autoriza salvar a cópia preparada. A preparação local fica protegida em Tarefas até imprimir ou descartar.",
      ],
      detail: {
        kind: "printing",
        stage: "output",
        settings: DEFAULT_PRINT_SETTINGS,
        printOnly: true,
      },
    };
    await job.ready(result);
    return result;
  } finally {
    releaseSources();
  }
}
