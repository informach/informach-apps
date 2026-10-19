import type { ParagraphAnnot } from "@shared/model";
import type { ParagraphLayout } from "@shared/paragraph-layout";
import { paragraphWorkerReplySchema } from "@shared/paragraph-worker-format";
export function paragraphLayoutInWorker(
  annotation: ParagraphAnnot,
  font: Uint8Array,
  signal: AbortSignal,
): Promise<ParagraphLayout> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./paragraph-worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Composição cancelada", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Falha na composição de texto."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      finish();
      try {
        const reply = paragraphWorkerReplySchema.parse(event.data);
        if (reply.ok) resolve(reply.layout);
        else reject(new Error(reply.error));
      } catch (failure) {
        reject(failure);
      }
    };
    try {
      worker.postMessage({ annotation: { ...annotation, fontData: undefined }, font });
    } catch (failure) {
      finish();
      reject(failure);
    }
  });
}
