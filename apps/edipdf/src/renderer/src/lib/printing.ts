import type { PrintSettings } from "@shared/print-format";
import { z } from "zod";

const replySchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    result: z.strictObject({
      bytes: z
        .instanceof(Uint8Array)
        .refine((bytes) => bytes.length > 0 && bytes.length <= 64 * 1024 * 1024),
      pages: z.number().int().positive().max(2000),
      warnings: z.array(z.string().max(2000)).max(1000),
    }),
  }),
  z.strictObject({ ok: z.literal(false), error: z.string() }),
]);
export function preparePrintLayout(
  bytes: Uint8Array,
  settings: PrintSettings,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; pages: number; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./print-worker.ts", import.meta.url), { type: "module" });
    const finish = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException("Impressão cancelada", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Falha na composição de impressão."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      finish();
      try {
        const reply = replySchema.parse(event.data);
        if (reply.ok) resolve(reply.result);
        else reject(new Error(reply.error));
      } catch (failure) {
        reject(failure);
      }
    };
    try {
      worker.postMessage({ bytes, settings });
    } catch (failure) {
      finish();
      reject(failure);
    }
  });
}
