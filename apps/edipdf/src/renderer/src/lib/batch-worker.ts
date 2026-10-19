import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import { generateBatch } from "@shared/batch";
import { batchWorkerRequestSchema } from "@shared/batch-worker-format";
import { setImageDensity } from "@shared/image-density";
import { LocalPdfEngine } from "@shared/local-engine";

let started = false,
  ended = false,
  sequence = 0;
const waiting = new Map<number, { resolve(): void; reject(error: unknown): void }>();
function fail(failure: unknown) {
  if (ended) return;
  ended = true;
  for (const value of waiting.values()) value.reject(failure);
  waiting.clear();
  self.postMessage({
    kind: "error",
    error: failure instanceof Error ? failure.message : "Falha ao preparar lote local.",
  });
}
self.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const request = batchWorkerRequestSchema.parse(event.data);
    if (request.kind === "ack") {
      const value = waiting.get(request.seq);
      if (!value) throw new Error("Confirmação de checkpoint do lote fora de ordem.");
      waiting.delete(request.seq);
      value.resolve();
      return;
    }
    if (started) throw new Error("Este worker já recebeu um lote.");
    started = true;
    void (async () => {
      let engine: LocalPdfEngine | undefined;
      if (request.settings.operation === "images") {
        const response = await fetch(wasmUrl);
        if (!response.ok) throw new Error("Motor local de imagens indisponível.");
        engine = await LocalPdfEngine.create(new Uint8Array(await response.arrayBuffer()));
      }
      const result = await generateBatch(request.pdf, request.settings, {
        engine,
        previous: request.previous,
        planning: (value) => self.postMessage({ kind: "planning", ...value }),
        encode: async (image, format, dpi) => {
          const canvas = new OffscreenCanvas(image.width, image.height),
            context = canvas.getContext("2d");
          if (!context) throw new Error("Não foi possível preparar a imagem da página.");
          if (image.pixels.length !== image.width * image.height * 3)
            throw new Error("Buffer RGB da página inconsistente.");
          try {
            const pixels = new Uint8ClampedArray(image.width * image.height * 4);
            for (let from = 0, to = 0; from < image.pixels.length; from += 3, to += 4) {
              const red = image.pixels[from],
                green = image.pixels[from + 1],
                blue = image.pixels[from + 2];
              if (red === undefined || green === undefined || blue === undefined)
                throw new Error("Pixel RGB incompleto.");
              pixels[to] = red;
              pixels[to + 1] = green;
              pixels[to + 2] = blue;
              pixels[to + 3] = 255;
            }
            context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
            return setImageDensity(
              new Uint8Array(
                await (
                  await canvas.convertToBlob({
                    type: format === "png" ? "image/png" : "image/jpeg",
                    quality: 0.92,
                  })
                ).arrayBuffer(),
              ),
              format,
              dpi,
            );
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        },
        progress: (done, total) => self.postMessage({ kind: "progress", done, total }),
        checkpoint: async (snapshot) => {
          const seq = ++sequence;
          await new Promise<void>((resolve, reject) => {
            waiting.set(seq, { resolve, reject });
            if (!(snapshot.bytes.buffer instanceof ArrayBuffer))
              throw new Error("Buffer do lote não transferível.");
            self.postMessage(
              {
                kind: "checkpoint",
                seq,
                payload: {
                  bytes: snapshot.bytes,
                  detail: snapshot.detail,
                  warnings: snapshot.warnings,
                },
              },
              { transfer: [snapshot.bytes.buffer] },
            );
          });
        },
      });
      if (!(result.bytes.buffer instanceof ArrayBuffer))
        throw new Error("Buffer final do lote não transferível.");
      self.postMessage(
        {
          kind: "complete",
          payload: { bytes: result.bytes, detail: result.detail, warnings: result.warnings },
        },
        { transfer: [result.bytes.buffer] },
      );
      ended = true;
    })().catch(fail);
  } catch (failure) {
    fail(failure);
  }
};
