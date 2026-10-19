import { type OcrLanguage, type OcrResult, ocrResultSchema, ocrScore } from "@shared/ocr-format";
import { z } from "zod";

const responseSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), result: ocrResultSchema }),
  z.strictObject({ ok: z.literal(false), error: z.string() }),
]);
const progressSchema = z.strictObject({
  progress: z.number().finite().min(0).max(1),
  status: z.string(),
});

/** The host owns Tesseract's child worker, including initialization. Cancellation terminates both. */
export function recognizeImage(
  image: Uint8Array,
  width: number,
  height: number,
  languages: OcrLanguage[],
  signal: AbortSignal,
  progress: (value: number, status: string) => void,
): Promise<OcrResult> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./ocr-worker.ts", import.meta.url), { type: "module" });
    const finish = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("OCR cancelado", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Falha no OCR local."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      try {
        const update = progressSchema.safeParse(event.data);
        if (update.success) {
          progress(update.data.progress, update.data.status);
          return;
        }
        const response = responseSchema.parse(event.data);
        finish();
        if (response.ok) resolve(response.result);
        else reject(new Error(response.error));
      } catch (error) {
        finish();
        reject(error);
      }
    };
    try {
      worker.postMessage({
        image,
        width,
        height,
        languages,
        assets: new URL("./ocr/", document.baseURI).href,
      });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}

export function prepareOcrImage(
  input: HTMLCanvasElement,
  turn: 0 | 90 | 180 | 270,
  skew: number,
): HTMLCanvasElement {
  if (!Number.isFinite(skew) || Math.abs(skew) > 10)
    throw new Error("Ajuste de inclinação deve ficar entre −10° e 10°.");
  const output = document.createElement("canvas");
  output.width = turn % 180 ? input.height : input.width;
  output.height = turn % 180 ? input.width : input.height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem para OCR.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, output.width, output.height);
  context.translate(output.width / 2, output.height / 2);
  context.rotate(((turn + skew) * Math.PI) / 180);
  context.drawImage(input, -input.width / 2, -input.height / 2);
  return output;
}

export async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Não foi possível preparar a imagem OCR.")),
      "image/png",
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function recognizeOcrCanvas(
  input: HTMLCanvasElement,
  options: {
    turn: 0 | 90 | 180 | 270;
    skew: number;
    autoOrientation: boolean;
    autoSkew: boolean;
    language: OcrLanguage;
  },
  signal: AbortSignal,
  progress: (value: number, stage: string) => void,
): Promise<{
  result: OcrResult;
  canvas: HTMLCanvasElement;
  turn: 0 | 90 | 180 | 270;
  skew: number;
}> {
  const turns = options.autoOrientation ? ([0, 90, 180, 270] as const) : [options.turn];
  let best:
    | { result: OcrResult; canvas: HTMLCanvasElement; turn: 0 | 90 | 180 | 270; skew: number }
    | undefined;
  try {
    for (const turn of turns) {
      signal.throwIfAborted();
      const canvas = prepareOcrImage(input, turn, options.skew);
      let result: OcrResult;
      try {
        result = await recognizeImage(
          await canvasPng(canvas),
          canvas.width,
          canvas.height,
          [options.language],
          signal,
          (value) => progress(value, `Orientação ${turn}°`),
        );
      } catch (error) {
        canvas.width = 0;
        throw error;
      }
      if (!best || ocrScore(result) > ocrScore(best.result)) {
        if (best) best.canvas.width = 0;
        best = { result, canvas, turn, skew: options.skew };
      } else canvas.width = 0;
    }
    if (!best) throw new Error("Nenhuma orientação foi reconhecida.");
    const correction = best.skew - (best.result.inclination ?? 0);
    if (
      options.autoSkew &&
      Math.abs(best.skew - correction) >= 0.3 &&
      Math.abs(correction) <= 10 &&
      best.result.words.length >= 3
    ) {
      const canvas = prepareOcrImage(input, best.turn, correction);
      let result: OcrResult;
      try {
        result = await recognizeImage(
          await canvasPng(canvas),
          canvas.width,
          canvas.height,
          [options.language],
          signal,
          (value) => progress(value, "Ajustando inclinação"),
        );
      } catch (error) {
        canvas.width = 0;
        throw error;
      }
      if (ocrScore(result) >= ocrScore(best.result)) {
        best.canvas.width = 0;
        best = { result, canvas, turn: best.turn, skew: correction };
      } else canvas.width = 0;
    }
    return best;
  } catch (error) {
    if (best) best.canvas.width = 0;
    throw error;
  }
}
