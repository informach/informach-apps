import {
  type ConversionRequest,
  type ConversionResult,
  conversionResultSchema,
} from "@shared/conversion-format";
import { z } from "zod";

const responseSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), value: conversionResultSchema }),
  z.strictObject({ ok: z.literal(false), error: z.string().max(2000) }),
]);
const progressSchema = z.strictObject({ progress: z.string().max(2000) });
export function convertLocal(
  request: ConversionRequest,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<ConversionResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Conversão cancelada", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./conversion-worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Conversão cancelada", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Falha no conversor local."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      try {
        const update = progressSchema.safeParse(event.data);
        if (update.success) {
          progress(update.data.progress);
          return;
        }
        const result = responseSchema.parse(event.data);
        finish();
        if (result.ok) resolve(result.value);
        else reject(new Error(result.error));
      } catch (error) {
        finish();
        reject(error);
      }
    };
    try {
      worker.postMessage(request);
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
