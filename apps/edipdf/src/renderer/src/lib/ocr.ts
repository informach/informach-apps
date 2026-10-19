import type { OcrLanguage, OcrTurn } from "@informach/edi-ocr";
import {
  type OcrCanvasResult,
  type OcrHost,
  recognizeOcrCanvas as recognize,
} from "@informach/edi-ocr/canvas";

/** EdiPDF's own worker file and the assets copied to `public/ocr` by copy-pdfjs.mjs. */
const host: OcrHost = {
  createWorker: () => new Worker(new URL("./ocr-worker.ts", import.meta.url), { type: "module" }),
};

/** One rendered page: four orientations when requested, then deskew. */
export function recognizeOcrCanvas(
  input: HTMLCanvasElement,
  options: {
    turn: OcrTurn;
    skew: number;
    autoOrientation: boolean;
    autoSkew: boolean;
    language: OcrLanguage;
  },
  signal: AbortSignal,
  progress: (value: number, stage: string) => void,
): Promise<OcrCanvasResult> {
  const { language, ...rest } = options;
  return recognize(host, input, { ...rest, languages: [language] }, signal, progress);
}
