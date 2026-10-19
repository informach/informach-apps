import type { EditableFontInfo } from "@shared/font-file";
import { fontInspectionReplySchema } from "@shared/font-worker-format";
export function inspectFontInWorker(
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<{ family: string; subfamily: string; info: EditableFontInfo }> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./font-worker.ts", import.meta.url), { type: "module" });
    const finish = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Importação de fonte cancelada", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Falha na leitura da fonte."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      finish();
      try {
        const reply = fontInspectionReplySchema.parse(event.data);
        if (reply.ok)
          resolve({ family: reply.family, subfamily: reply.subfamily, info: reply.info });
        else reject(new Error(reply.error));
      } catch (failure) {
        reject(failure);
      }
    };
    try {
      worker.postMessage({ bytes });
    } catch (failure) {
      finish();
      reject(failure);
    }
  });
}
