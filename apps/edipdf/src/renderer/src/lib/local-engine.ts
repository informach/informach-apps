import {
  type ImagePixels,
  imagePixelsSchema,
  inspectionSchema,
  PdfEngineError,
  type PdfInspection,
  type TextDocument,
  textDocumentSchema,
} from "@shared/engine-contracts";
import type { EngineRequest } from "@shared/engine-protocol";
import {
  type FormContentInspection,
  formContentInspectionSchema,
} from "@shared/form-content-format";
import { z } from "zod";

const responseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    code: z.enum(["password", "permission", "operation"]),
  }),
]);
const progressSchema = z.strictObject({
  progress: z.object({
    page: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});
type Progress = (page: number, total: number) => void;
/** A dedicated worker keeps the interface responsive; terminating it cancels native work. */
export function runEngine(
  request: Extract<EngineRequest, { kind: "inspectForm" }>,
  signal?: AbortSignal,
  progress?: Progress,
): Promise<FormContentInspection>;
export function runEngine(
  request: Extract<EngineRequest, { kind: "inspect" }>,
  signal?: AbortSignal,
  progress?: Progress,
): Promise<PdfInspection>;
export function runEngine(
  request: Extract<EngineRequest, { kind: "extractImage" }>,
  signal?: AbortSignal,
  progress?: Progress,
): Promise<ImagePixels>;
export function runEngine(
  request: Extract<EngineRequest, { kind: "text" }>,
  signal?: AbortSignal,
  progress?: Progress,
): Promise<TextDocument>;
export function runEngine(
  request: Exclude<EngineRequest, { kind: "inspect" | "inspectForm" | "extractImage" | "text" }>,
  signal?: AbortSignal,
  progress?: Progress,
): Promise<Uint8Array>;
export function runEngine(
  request: EngineRequest,
  signal?: AbortSignal,
  progress?: Progress,
): Promise<PdfInspection | ImagePixels | TextDocument | Uint8Array | FormContentInspection> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Operação cancelada", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./engine-worker.ts", import.meta.url), { type: "module" });
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Operação cancelada", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Falha no motor PDF local."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      try {
        const update = progressSchema.safeParse(event.data);
        if (update.success) {
          progress?.(update.data.progress.page, update.data.progress.total);
          return;
        }
        finish();
        const response = responseSchema.parse(event.data);
        if (!response.ok) throw new PdfEngineError(response.code, response.error);
        resolve(
          request.kind === "inspectForm"
            ? formContentInspectionSchema.parse(response.value)
            : request.kind === "inspect"
              ? inspectionSchema.parse(response.value)
              : request.kind === "text"
                ? textDocumentSchema.parse(response.value)
                : request.kind === "extractImage"
                  ? imagePixelsSchema.parse(response.value)
                  : z.instanceof(Uint8Array).parse(response.value),
        );
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
