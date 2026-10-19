import {
  OCR_TILED_LIMITS,
  type OcrLanguage,
  type OcrLimits,
  type OcrResult,
  type OcrTurn,
  OcrUnavailableError,
  ocrLimits,
  ocrScore,
} from "./format.ts";
import { ocrProgressSchema, ocrResponseSchema } from "./protocol.ts";
import { type OcrTileOptions, planOcrTiles, recognizeOcrTiles } from "./tiles.ts";

/**
 * How the renderer reaches the OCR worker. The app owns the worker file (so its bundler emits
 * it) and the copied assets (`copyOcrAssets`).
 */
export interface OcrHost {
  /** For example `() => new Worker(new URL("./ocr-worker.ts", import.meta.url), { type: "module" })`. */
  createWorker: () => Worker;
  /** Base URL of the copied assets, ending with `/`. Default: `./ocr/` next to the page. */
  assets?: string;
  /** Per-call limits; must match the worker's. Default `OCR_LIMITS`. */
  limits?: Partial<OcrLimits>;
}

export type OcrProgress = (value: number, status: string) => void;

/** The host owns Tesseract's child worker, including initialization. Cancellation terminates both. */
export function recognizeImage(
  host: OcrHost,
  image: Uint8Array,
  width: number,
  height: number,
  languages: readonly OcrLanguage[],
  signal: AbortSignal,
  progress: OcrProgress,
): Promise<OcrResult> {
  const responseSchema = ocrResponseSchema(ocrLimits(host.limits));
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = host.createWorker();
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
      reject(new OcrUnavailableError("engine", event.message || "Falha no OCR local."));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      try {
        const update = ocrProgressSchema.safeParse(event.data);
        if (update.success) {
          progress(update.data.progress, update.data.status);
          return;
        }
        const response = responseSchema.parse(event.data);
        finish();
        if (response.ok) resolve(response.result);
        else if (response.unavailable)
          reject(new OcrUnavailableError(response.unavailable, response.error));
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
        languages: [...languages],
        assets: host.assets ?? new URL("./ocr/", document.baseURI).href,
      });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}

/** Rotate clockwise by `turn`, then deskew by `skew` degrees around the centre, on white. */
export function prepareOcrImage(
  input: HTMLCanvasElement,
  turn: OcrTurn,
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

export interface OcrCanvasOptions {
  turn: OcrTurn;
  skew: number;
  /** Try the four quarter turns and keep the best `ocrScore`. */
  autoOrientation: boolean;
  /** Re-run once with the measured inclination when it improves the score. */
  autoSkew: boolean;
  languages: readonly OcrLanguage[];
}

export interface OcrCanvasResult {
  result: OcrResult;
  /** The prepared image the result refers to. The caller releases it (`width = 0`). */
  canvas: HTMLCanvasElement;
  turn: OcrTurn;
  skew: number;
}

/** Recognize one image within the per-call limits, choosing orientation and deskew. */
export async function recognizeOcrCanvas(
  host: OcrHost,
  input: HTMLCanvasElement,
  options: OcrCanvasOptions,
  signal: AbortSignal,
  progress: (value: number, stage: string) => void,
): Promise<OcrCanvasResult> {
  const turns = options.autoOrientation ? ([0, 90, 180, 270] as const) : [options.turn];
  let best: OcrCanvasResult | undefined;
  try {
    for (const turn of turns) {
      signal.throwIfAborted();
      const canvas = prepareOcrImage(input, turn, options.skew);
      let result: OcrResult;
      try {
        result = await recognizeImage(
          host,
          await canvasPng(canvas),
          canvas.width,
          canvas.height,
          options.languages,
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
          host,
          await canvasPng(canvas),
          canvas.width,
          canvas.height,
          options.languages,
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

export interface OcrTiledOptions extends OcrTileOptions {
  languages: readonly OcrLanguage[];
  /** Limits of the merged result. Default `OCR_TILED_LIMITS`. */
  resultLimits?: Partial<OcrLimits>;
}

/**
 * Recognize an upright image of any size up to the tiled source limits. Images above the
 * per-call limit are cut into overlapping tiles, recognized one after another and merged in
 * source pixel coordinates. No orientation search or deskew: use `recognizeOcrCanvas` for
 * scanned pages that fit one call.
 */
export async function recognizeTiledCanvas(
  host: OcrHost,
  input: HTMLCanvasElement,
  options: OcrTiledOptions,
  signal: AbortSignal,
  progress: (value: number, stage: string) => void,
): Promise<OcrResult> {
  const limits = ocrLimits(host.limits);
  const tiles = planOcrTiles(input.width, input.height, {
    ...options,
    tile: {
      maxSide: options.tile?.maxSide ?? limits.maxSide,
      maxPixels: options.tile?.maxPixels ?? limits.maxPixels,
    },
  });
  return recognizeOcrTiles(
    input.width,
    input.height,
    tiles,
    async (tile, tileSignal, tileProgress) => {
      const canvas = document.createElement("canvas");
      try {
        canvas.width = tile.width;
        canvas.height = tile.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível preparar a imagem para OCR.");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, tile.width, tile.height);
        context.drawImage(
          input,
          tile.x,
          tile.y,
          tile.width,
          tile.height,
          0,
          0,
          tile.width,
          tile.height,
        );
        return await recognizeImage(
          host,
          await canvasPng(canvas),
          tile.width,
          tile.height,
          options.languages,
          tileSignal,
          tileProgress,
        );
      } finally {
        canvas.width = 0;
      }
    },
    signal,
    (value, index, count) =>
      progress(value, count > 1 ? `Bloco ${index + 1} de ${count}` : "Reconhecendo"),
    options.resultLimits ?? OCR_TILED_LIMITS,
  );
}
