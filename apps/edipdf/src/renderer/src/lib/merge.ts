import { type MergeRequest, mergeReplySchema } from "@shared/merge-format";
export function mergeLocal(
  request: MergeRequest,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<{ bytes: Uint8Array; pages: number }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Junção cancelada", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./merge-worker.ts", import.meta.url), { type: "module" });
    const finish = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Junção cancelada", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Falha no worker de junção."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      try {
        const reply = mergeReplySchema.parse(event.data);
        if (reply.kind === "progress") {
          progress(`Juntando arquivo ${reply.index + 1} de ${reply.total}…`);
          return;
        }
        finish();
        if (reply.kind === "complete") resolve({ bytes: reply.bytes, pages: reply.pages });
        else reject(new Error(reply.error));
      } catch (failure) {
        finish();
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
