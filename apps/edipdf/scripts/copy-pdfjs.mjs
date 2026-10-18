// Copies the pdf.js runtime assets (character maps, standard fonts, wasm decoders) next to the
// renderer so they ship with the app. Runs after npm install.

import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "./copy-presentation-licenses.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist");
const to = join(root, "src", "renderer", "public", "pdfjs");
mkdirSync(to, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm"])
  cpSync(join(from, dir), join(to, dir), { recursive: true });
cpSync(join(root, "resources", "licenses"), join(root, "src", "renderer", "public", "licenses"), {
  recursive: true,
});
console.log("pdf.js assets copied to", to);

const ocr = join(root, "src", "renderer", "public", "ocr");
mkdirSync(join(ocr, "core"), { recursive: true });
cpSync(
  join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
  join(ocr, "worker.min.js"),
);
const core = join(root, "node_modules", "tesseract.js-core");
for (const name of readdirSync(core))
  if (name.startsWith("tesseract-core") && /\.wasm(?:\.js)?$/.test(name))
    cpSync(join(core, name), join(ocr, "core", name));
const models = JSON.parse(readFileSync(join(root, "resources", "ocr", "sources.json"), "utf8"));
for (const model of models.models) {
  if (!["por", "eng", "spa"].includes(model.language))
    throw new Error("Idioma OCR não permitido no manifesto.");
  const file = join(root, "resources", "ocr", "models", `${model.language}.traineddata`);
  if (createHash("sha256").update(readFileSync(file)).digest("hex") !== model.sha256)
    throw new Error(`Modelo OCR alterado: ${model.language}`);
}
cpSync(join(root, "resources", "ocr", "models"), join(ocr, "models"), { recursive: true });
console.log("Local OCR worker, cores and verified models copied.");
