import { createWorker, OEM } from "tesseract.js";
import { createOcrResultSchema, type OcrLimits, ocrInclination, ocrLimits } from "./format.ts";
import { ocrRequestSchema } from "./protocol.ts";

export interface OcrWorkerOptions {
  /** Per-call limits. Defaults to `OCR_LIMITS`; the host must use the same values. */
  limits?: Partial<OcrLimits>;
}

class UnavailableFailure extends Error {
  readonly reason: "assets" | "limits";
  constructor(reason: "assets" | "limits", message: string) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Worker entry. Call it from a module worker file owned by the app, so the app's bundler emits
 * the worker: `serveOcrWorker()`. One request per worker; the host terminates it afterwards.
 * Tesseract runs in its own child worker, loaded from the request's asset base URL with
 * no cache and no network fallback.
 */
export function serveOcrWorker(options: OcrWorkerOptions = {}): void {
  const limits = ocrLimits(options.limits);
  const requestSchema = ocrRequestSchema(limits);
  const resultSchema = createOcrResultSchema(limits);
  self.onmessage = async (event: MessageEvent<unknown>) => {
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    try {
      const request = requestSchema.parse(event.data);
      if (
        request.width * request.height > limits.maxPixels ||
        request.image.length > limits.maxImageBytes
      )
        throw new UnavailableFailure("limits", "Imagem excede os limites do OCR local.");
      let fail: (error: Error) => void = () => {};
      const fatal = new Promise<never>((_, reject) => {
        fail = reject;
      });
      const initialization = createWorker(request.languages, OEM.LSTM_ONLY, {
        workerPath: `${request.assets}worker.min.js`,
        corePath: `${request.assets}core`,
        langPath: `${request.assets}models`,
        gzip: false,
        cacheMethod: "none",
        workerBlobURL: false,
        logger: (message) =>
          self.postMessage({
            progress: Math.max(0, Math.min(1, message.progress)),
            status: message.status,
          }),
        errorHandler: (error: unknown) =>
          fail(new Error(typeof error === "string" ? error : "Falha no motor OCR local.")),
      });
      try {
        worker = await Promise.race([initialization, fatal]);
      } catch (error) {
        throw new UnavailableFailure(
          "assets",
          error instanceof Error ? error.message : "Falha no OCR local.",
        );
      }
      // Tesseract reads a Blob into the same bytes; its typings do not accept a bare Uint8Array.
      const image = new Blob([request.image]);
      const recognition = await Promise.race([
        worker.recognize(image, { rotateAuto: false }, { text: true, blocks: true }),
        fatal,
      ]);
      let line = 0;
      const baselines: { x0: number; y0: number; x1: number; y1: number }[] = [];
      const words = (recognition.data.blocks ?? []).flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.flatMap((row) => {
            const id = line++;
            if (row.baseline) baselines.push(row.baseline);
            return row.words
              .filter(
                (word) =>
                  word.text.trim() && word.bbox.x1 > word.bbox.x0 && word.bbox.y1 > word.bbox.y0,
              )
              .map((word) => ({
                text: word.text,
                confidence: Math.max(0, Math.min(100, word.confidence)),
                ...word.bbox,
                line: id,
              }));
          }),
        ),
      );
      const result = resultSchema.parse({
        width: request.width,
        height: request.height,
        confidence: Math.max(0, Math.min(100, recognition.data.confidence)),
        inclination: ocrInclination(baselines),
        words,
      });
      self.postMessage({ ok: true, result });
    } catch (error) {
      self.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : "Falha no OCR local.",
        ...(error instanceof UnavailableFailure ? { unavailable: error.reason } : {}),
      });
    } finally {
      if (worker) await worker.terminate();
    }
  };
}
