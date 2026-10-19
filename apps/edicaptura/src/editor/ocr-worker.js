// The Captura's own OCR worker: Vite emits it beside the editor, and the copied
// worker/cores/models in ../ocr/ come from @informach/edi-ocr (scripts/copy-ocr.mjs).
import { serveOcrWorker } from "@informach/edi-ocr/worker";

serveOcrWorker();
