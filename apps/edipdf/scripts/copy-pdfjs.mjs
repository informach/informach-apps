// Copies the pdf.js runtime assets (character maps, standard fonts, wasm decoders) next to the
// renderer so they ship with the app. Runs after npm install.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist");
const to = join(root, "src", "renderer", "public", "pdfjs");
mkdirSync(to, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm"])
  cpSync(join(from, dir), join(to, dir), { recursive: true });
console.log("pdf.js assets copied to", to);
