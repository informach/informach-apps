import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import type { ScannerPage, ScannerSettings } from "../shared/scanner-format.ts";
import type { TaskResult } from "../shared/task-format.ts";
import { createScannerSession } from "./scanner.ts";

const replySchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    bytes: z
      .custom<Uint8Array>((value) => value instanceof Uint8Array)
      .refine((value) => value.length > 0 && value.length <= 64 * 1024 * 1024),
    pages: z.number().int().min(1).max(100),
  }),
  z.strictObject({ ok: z.literal(false), error: z.string().max(2000) }),
]);
async function appendPage(
  page: ScannerPage,
  previous: TaskResult | undefined,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const worker = new Worker(join(__dirname, "scanner-pdf-worker.js"));
  let abort = () => {};
  try {
    return await new Promise<{ bytes: Uint8Array; pages: number }>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        settled = true;
        reject(error);
      };
      abort = () =>
        fail(
          new DOMException("Preparação da página interrompida; confira o scanner.", "AbortError"),
        );
      signal.addEventListener("abort", abort, { once: true });
      worker.once("error", fail);
      worker.once("exit", () => {
        if (!settled) fail(new Error("O conversor da página encerrou antes de concluir."));
      });
      worker.once("message", (raw: unknown) => {
        try {
          const reply = replySchema.parse(raw);
          settled = true;
          if (!reply.ok) reject(new Error(reply.error));
          else resolve(reply);
        } catch (error) {
          fail(error);
        }
      });
      worker.postMessage({ ...page, ...(previous ? { previous: previous.pdf } : {}) });
    });
  } finally {
    signal.removeEventListener("abort", abort);
    await worker.terminate();
  }
}
/** Acquisition, bounded CPU conversion and protected commit form one authorized task. */
export function createScanTask(settings: ScannerSettings, signal: AbortSignal) {
  const scanner = createScannerSession(settings, signal);
  return {
    close: scanner.close,
    async next(previous: TaskResult | undefined): Promise<TaskResult | null> {
      const page = await scanner.next();
      if (!page) return null;
      const result = await appendPage(page, previous, signal);
      return {
        ...result,
        pdf: result.bytes,
        extension: "pdf",
        detail: { kind: "scanning", stage: "acquiring", pages: result.pages },
        warnings: [
          "Confira cada página digitalizada. Uma interrupção no meio da folha pode exigir nova aquisição; verifique o alimentador antes de continuar.",
          "Perfil WIA de uma face por folha. Duplex automático exige um perfil de transferência separado.",
        ],
      };
    },
  };
}
