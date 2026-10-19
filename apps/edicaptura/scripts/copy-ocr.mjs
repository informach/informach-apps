// Copies the local OCR worker, cores, SHA-verified models and their licenses from
// @informach/edi-ocr into the renderer's public folder, so the Captura installer carries its
// own OCR without depending on another Edi tool. Runs after pnpm install.

import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyOcrAssets } from "@informach/edi-ocr/assets";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ocr = join(root, "src", "assets", "ocr");
// Generated: rebuilt from scratch so moved or removed files do not linger.
rmSync(ocr, { recursive: true, force: true });
copyOcrAssets(ocr);
console.log("Local OCR worker, cores and verified models copied.");
