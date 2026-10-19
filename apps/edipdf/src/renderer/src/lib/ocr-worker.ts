import { ocrInclination, ocrLanguageSchema, ocrResultSchema } from "@shared/ocr-format";
import { createWorker, OEM } from "tesseract.js";
import { z } from "zod";

const requestSchema = z.strictObject({
  image: z.instanceof(Uint8Array),
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
  languages: z.array(ocrLanguageSchema).min(1).max(3),
  assets: z.string().url(),
});
self.onmessage = async (event: MessageEvent<unknown>) => {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    const request = requestSchema.parse(event.data);
    if (request.width * request.height > 24_000_000 || request.image.length > 96_000_000)
      throw new Error("Imagem excede os limites do OCR local.");
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
    worker = await Promise.race([initialization, fatal]);
    const recognition = await Promise.race([
      worker.recognize(request.image, { rotateAuto: false }, { text: true, blocks: true }),
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
    const result = ocrResultSchema.parse({
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
    });
  } finally {
    if (worker) await worker.terminate();
  }
};
