import { type RasterPrintRequest, rasterPrintReplySchema } from "@shared/raster-print";
export function composeRasterPrint(
  request: RasterPrintRequest,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; pages: number }> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./raster-print-worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Impressão interrompida", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Falha no worker de impressão."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      finish();
      try {
        const reply = rasterPrintReplySchema.parse(event.data);
        if (reply.ok) resolve({ bytes: reply.bytes, pages: reply.pages });
        else reject(new Error(reply.error));
      } catch (failure) {
        reject(failure);
      }
    };
    try {
      worker.postMessage(request);
    } catch (failure) {
      finish();
      reject(failure);
    }
  });
}
