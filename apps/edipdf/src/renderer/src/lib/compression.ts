import type { CompressLevel } from "@shared/compress";
import { z } from "zod";

const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    bytes: z.instanceof(Uint8Array),
    targetMet: z.boolean(),
    warnings: z.array(z.string().max(2000)).max(100),
    pages: z.number().int().positive().max(100000),
  }),
  z.strictObject({ ok: z.literal(false), error: z.string() }),
]);
const progressSchema = z.strictObject({
  progress: z.strictObject({
    attempt: z.number().int().positive(),
    total: z.number().int().positive(),
    done: z.number().int().nonnegative(),
    images: z.number().int().nonnegative(),
  }),
});
export interface CompressionOptions {
  target?: number;
  signal?: AbortSignal;
  progress?: (value: z.infer<typeof progressSchema>["progress"]) => void;
}
export function runCompression(
  bytes: Uint8Array,
  level: CompressLevel,
  options: CompressionOptions = {},
): Promise<{ bytes: Uint8Array; targetMet: boolean; warnings: string[]; pages: number }> {
  return new Promise((resolve, reject) => {
    options.signal?.throwIfAborted();
    const worker = new Worker(new URL("./compression-worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      options.signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Compactação cancelada", "AbortError"));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Falha na compactação local."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      try {
        const progress = progressSchema.safeParse(event.data);
        if (progress.success) {
          options.progress?.(progress.data.progress);
          return;
        }
        const result = resultSchema.parse(event.data);
        finish();
        if (result.ok)
          resolve({
            bytes: result.bytes,
            targetMet: result.targetMet,
            warnings: result.warnings,
            pages: result.pages,
          });
        else reject(new Error(result.error));
      } catch (error) {
        finish();
        reject(error);
      }
    };
    try {
      worker.postMessage({ bytes, level, target: options.target });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
