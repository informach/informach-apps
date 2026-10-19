// Copies the pdf.js runtime assets (character maps, standard fonts, wasm decoders) next to the
// renderer so they ship with the app, plus the OCR worker, cores, verified models and licenses
// from @informach/edi-ocr. Runs after pnpm install.

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyOcrAssets } from "@informach/edi-ocr/assets";
import "./copy-presentation-licenses.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist");
const to = join(root, "src", "renderer", "public", "pdfjs");
mkdirSync(to, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm"])
  cpSync(join(from, dir), join(to, dir), { recursive: true });
// Generated directories are rebuilt from scratch so moved or removed files do not linger.
const licenses = join(root, "src", "renderer", "public", "licenses");
rmSync(licenses, { recursive: true, force: true });
cpSync(join(root, "resources", "licenses"), licenses, {
  recursive: true,
});
console.log("pdf.js assets copied to", to);

const ocr = join(root, "src", "renderer", "public", "ocr");
rmSync(ocr, { recursive: true, force: true });
copyOcrAssets(ocr);
console.log("Local OCR worker, cores and verified models copied.");
