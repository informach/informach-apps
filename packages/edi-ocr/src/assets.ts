/**
 * Build-time helper (Node only). Copies the Tesseract worker, its WebAssembly cores, the
 * SHA-verified models and their licenses into an app's renderer `public/ocr` directory, so
 * each installer carries its own OCR files and nothing is downloaded at run time.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { type OcrLanguage, ocrLanguageSchema } from "./format.ts";

export const OCR_RESOURCES_DIRECTORY = fileURLToPath(new URL("../resources/", import.meta.url));
export const OCR_LICENSES_DIRECTORY = join(OCR_RESOURCES_DIRECTORY, "licenses");
export const OCR_MODELS_DIRECTORY = join(OCR_RESOURCES_DIRECTORY, "models");
export const OCR_SOURCES_FILE = join(OCR_RESOURCES_DIRECTORY, "sources.json");

const sourcesSchema = z.object({
  version: z.literal(1),
  engine: z.object({ package: z.literal("tesseract.js"), version: z.string(), core: z.string() }),
  models: z
    .array(
      z.object({
        language: ocrLanguageSchema,
        label: z.string(),
        source: z.string().url(),
        sha256: z.string().regex(/^[a-f\d]{64}$/),
      }),
    )
    .min(1),
  modelLicense: z.string(),
});

const require = createRequire(import.meta.url);
const packageDirectory = (name: string) => dirname(require.resolve(`${name}/package.json`));
const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const isCore = (name: string) => name.startsWith("tesseract-core") && /\.wasm(?:\.js)?$/.test(name);

/** Engine files the renderer loads: `worker.min.js` and `core/*`. */
function engineFiles(): { from: string; to: string }[] {
  const worker = join(packageDirectory("tesseract.js"), "dist", "worker.min.js");
  const core = packageDirectory("tesseract.js-core");
  return [
    { from: worker, to: "worker.min.js" },
    ...readdirSync(core)
      .filter(isCore)
      .sort()
      .map((name) => ({ from: join(core, name), to: `core/${name}` })),
  ];
}

/** Models listed in `resources/sources.json`, each checked against its pinned SHA-256. */
export function verifiedOcrModels(
  languages?: readonly OcrLanguage[],
): { language: OcrLanguage; file: string; sha256: string }[] {
  const manifest = sourcesSchema.parse(JSON.parse(readFileSync(OCR_SOURCES_FILE, "utf8")));
  const wanted = new Set(languages ?? manifest.models.map((model) => model.language));
  const models = manifest.models.filter((model) => wanted.has(model.language));
  for (const language of wanted)
    if (!models.some((model) => model.language === language))
      throw new Error(`Modelo OCR ausente do manifesto: ${language}`);
  return models.map((model) => {
    const file = join(OCR_MODELS_DIRECTORY, `${model.language}.traineddata`);
    if (sha256(file) !== model.sha256) throw new Error(`Modelo OCR alterado: ${model.language}`);
    return { language: model.language, file, sha256: model.sha256 };
  });
}

/** License texts of the engine, its compiled libraries, the models and tr46. */
export function ocrLicenseFiles(): { name: string; path: string }[] {
  return readdirSync(OCR_LICENSES_DIRECTORY)
    .filter((name) => name.endsWith(".txt"))
    .sort()
    .map((name) => ({ name, path: join(OCR_LICENSES_DIRECTORY, name) }));
}

export interface OcrAssetsOptions {
  /** Models to ship. Default: every model in the manifest. */
  languages?: readonly OcrLanguage[];
}

/**
 * Copy the worker, cores, verified models (`models/`), licenses (`licenses/`) and the model
 * manifest (`sources.json`) into `destination`. Returns the copied relative paths.
 */
export function copyOcrAssets(destination: string, options: OcrAssetsOptions = {}): string[] {
  const models = verifiedOcrModels(options.languages);
  const files = [
    ...engineFiles(),
    ...models.map((model) => ({
      from: model.file,
      to: `models/${model.language}.traineddata`,
    })),
    ...ocrLicenseFiles().map((license) => ({
      from: license.path,
      to: `licenses/${license.name}`,
    })),
    { from: OCR_SOURCES_FILE, to: "sources.json" },
  ];
  for (const file of files) {
    const target = join(destination, file.to);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(file.from, target);
  }
  return files.map((file) => file.to);
}

/**
 * Check a copied (or built) OCR directory: worker and cores byte-identical to the pinned
 * packages, models matching their SHA-256. Use before packaging an installer.
 */
export function verifyOcrAssets(directory: string, options: OcrAssetsOptions = {}): void {
  const expected = [
    ...engineFiles().map((file) => ({ path: file.to, sha256: sha256(file.from) })),
    ...verifiedOcrModels(options.languages).map((model) => ({
      path: `models/${model.language}.traineddata`,
      sha256: model.sha256,
    })),
    ...ocrLicenseFiles().map((license) => ({
      path: `licenses/${license.name}`,
      sha256: sha256(license.path),
    })),
  ];
  for (const file of expected) {
    const target = join(directory, file.path);
    if (!existsSync(target)) throw new Error(`Arquivo OCR ausente: ${file.path}`);
    if (sha256(target) !== file.sha256) throw new Error(`Arquivo OCR alterado: ${file.path}`);
  }
}
