import { serveOcrWorker } from "@informach/edi-ocr/worker";

// Module worker emitted by this app's bundler; engine assets come from ./ocr/ (copy-pdfjs.mjs).
serveOcrWorker();
