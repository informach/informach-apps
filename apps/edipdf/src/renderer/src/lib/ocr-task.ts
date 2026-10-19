import type { DocContent } from "@shared/model";
import type { ocrTaskDetailSchema, PendingLocalTask, TaskResult } from "@shared/task-format";
import type { z } from "zod";
import { recognizeOcrCanvas } from "./ocr";
import { loadSource, releaseSource, renderPage } from "./pdf";
import type { LocalTask } from "./tasks";

export type OcrTaskDetail = z.infer<typeof ocrTaskDetailSchema>;
export interface OcrTaskReview extends OcrTaskDetail {
  bytes: Uint8Array;
  output?: Uint8Array;
  content?: DocContent;
  total: number;
  name: string;
  originPaths: string[];
}
export function ocrTaskDetail(review: OcrTaskReview): OcrTaskDetail {
  return {
    kind: "ocr",
    stage: review.stage,
    remaining: review.remaining,
    options: review.options,
    pages: review.pages,
    skipped: review.skipped,
  };
}
export function ocrTaskResult(review: OcrTaskReview): TaskResult {
  return {
    bytes: review.output ?? review.bytes,
    pdf: review.bytes,
    pages: review.total,
    warnings: [],
    extension: "pdf",
    detail: ocrTaskDetail(review),
  };
}
export function resumedOcrReview(pending: PendingLocalTask): OcrTaskReview {
  if (pending.request.kind !== "ocr" || pending.result.detail?.kind !== "ocr")
    throw new Error("A tarefa escolhida não contém uma revisão OCR válida.");
  return {
    ...pending.result.detail,
    bytes: pending.result.pdf,
    ...(pending.result.detail.stage === "output" ? { output: pending.result.bytes } : {}),
    total: pending.result.pages,
    name: pending.request.defaultName,
    originPaths: pending.request.originPaths,
  };
}
/** A completed page is protected before starting the next one; only detail crosses later checkpoints. */
export async function recognizeOcrPages(
  initial: OcrTaskReview,
  task: LocalTask,
  progress: (message: string) => void,
  checkpoint: (review: OcrTaskReview) => void,
): Promise<OcrTaskReview> {
  const signal = task.signal,
    source = await loadSource(initial.bytes, initial.name, () => Promise.resolve(null), {
      output: true,
    });
  let review = { ...initial, stage: "recognizing" as const, output: undefined };
  let words = review.pages.reduce((sum, page) => sum + page.result.words.length, 0);
  const selected = [...review.remaining],
    options = review.options;
  try {
    for (const index of selected) {
      signal.throwIfAborted();
      const proxy = await source.pdf.getPage(index + 1),
        text = await proxy.getTextContent();
      if (!options.force && text.items.some((item) => "str" in item && item.str.trim()))
        review = {
          ...review,
          skipped: review.skipped + 1,
          remaining: review.remaining.filter((page) => page !== index),
        };
      else {
        const viewport = proxy.getViewport({ scale: 1 }),
          scale = options.dpi / 72;
        if (
          viewport.width * viewport.height * scale * scale > 24_000_000 ||
          Math.max(viewport.width, viewport.height) * scale > 8192
        )
          throw new Error(
            `Página ${index + 1} excede o limite de imagem. Reduza a resolução em um novo lote.`,
          );
        const canvas = document.createElement("canvas");
        let processed: HTMLCanvasElement | undefined;
        try {
          const render = renderPage(
              { id: "ocr", src: source.id, index, rotation: 0 },
              canvas,
              scale,
              { dpr: 1, quality: "export" },
            ),
            cancel = () => render.cancel();
          signal.addEventListener("abort", cancel, { once: true });
          try {
            await render.done;
          } finally {
            signal.removeEventListener("abort", cancel);
          }
          signal.throwIfAborted();
          const recognized = await recognizeOcrCanvas(canvas, options, signal, (value, stage) => {
            const message = `Página ${index + 1} · ${review.pages.length + review.skipped + 1}/${initial.pages.length + initial.skipped + selected.length} · ${stage} · ${Math.round(value * 100)}%`;
            task.describe(message);
            progress(message);
          });
          processed = recognized.canvas;
          words += recognized.result.words.length;
          if (words > 200000)
            throw new Error("O lote excedeu 200 mil palavras. Divida as páginas em lotes menores.");
          const thumbnail = document.createElement("canvas");
          thumbnail.width = Math.min(800, processed.width);
          thumbnail.height = Math.round((processed.height * thumbnail.width) / processed.width);
          const context = thumbnail.getContext("2d");
          if (!context) throw new Error("Não foi possível preparar a revisão do OCR.");
          context.drawImage(processed, 0, 0, thumbnail.width, thumbnail.height);
          const page = {
            page: index,
            turn: recognized.turn,
            skew: recognized.skew,
            result: recognized.result,
            preview: thumbnail.toDataURL("image/jpeg", 0.8),
          };
          thumbnail.width = 0;
          review = {
            ...review,
            pages: [...review.pages, page],
            remaining: review.remaining.filter((page) => page !== index),
          };
        } finally {
          canvas.width = 0;
          if (processed) processed.width = 0;
        }
      }
      signal.throwIfAborted();
      await task.progress(ocrTaskDetail(review));
      checkpoint(review);
    }
  } finally {
    releaseSource(source.id);
  }
  const complete: OcrTaskReview = { ...review, stage: "review" };
  await task.ready(ocrTaskResult(complete));
  checkpoint(complete);
  return complete;
}
