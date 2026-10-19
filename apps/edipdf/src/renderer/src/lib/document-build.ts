import { type BuildInput, documentBuildResponseSchema } from "@shared/document-build-format";

/** Input buffers are cloned, never transferred from documents that are still open. */
export function buildDocumentInWorker(
  input: BuildInput,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Composição cancelada", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./document-build-worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Composição cancelada", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Falha no compositor local de PDF."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      finish();
      try {
        const result = documentBuildResponseSchema.parse(event.data);
        if (result.ok) resolve(result.bytes);
        else reject(new Error(result.error));
      } catch (failure) {
        reject(failure);
      }
    };
    try {
      worker.postMessage(input);
    } catch (failure) {
      finish();
      reject(failure);
    }
  });
}
