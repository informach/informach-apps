import { batchPreviewReplySchema } from "@shared/batch-worker-format";
import type { TaskResult } from "@shared/task-format";

export function batchPreviewFile(
  result: TaskResult,
  name: string,
  signal: AbortSignal,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Prévia cancelada", "AbortError"));
      return;
    }
    if (result.detail?.kind !== "batch") {
      reject(new Error("Revisão de lote inválida."));
      return;
    }
    const worker = new Worker(new URL("./batch-preview-worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Prévia cancelada", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Falha no leitor do lote."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      finish();
      try {
        const reply = batchPreviewReplySchema.parse(event.data);
        if (reply.ok) resolve(reply.bytes);
        else reject(new Error(reply.error));
      } catch (failure) {
        reject(failure);
      }
    };
    try {
      worker.postMessage({ bytes: result.bytes, detail: result.detail, name });
    } catch (failure) {
      finish();
      reject(failure);
    }
  });
}
