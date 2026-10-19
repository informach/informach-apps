import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorker, OEM } from "tesseract.js";
import { describe, expect, it } from "vitest";
import {
  copyOcrAssets,
  OCR_MODELS_DIRECTORY,
  ocrLicenseFiles,
  verifiedOcrModels,
  verifyOcrAssets,
} from "../src/assets.ts";

// Fixtures: 1500×220 white PNGs with one line of black Noto Sans at 56 px, rendered once with
// @napi-rs/canvas. They contain only the sentences below.
describe("bundled models", () => {
  it("recognize real Portuguese, English and Spanish raster text offline", async () => {
    for (const [language, expected] of [
      ["por", /Ação local.*Educação.*informação/s],
      ["eng", /English document.*Local information/s],
      ["spa", /Español local.*Educación.*información/s],
    ] as const) {
      const image = await readFile(new URL(`./fixtures/${language}.png`, import.meta.url));
      const worker = await createWorker(language, OEM.LSTM_ONLY, {
        langPath: OCR_MODELS_DIRECTORY,
        gzip: false,
        cacheMethod: "none",
      });
      try {
        const recognized = await worker.recognize(
          image,
          { rotateAuto: false },
          { text: true, blocks: true },
        );
        expect(recognized.data.text).toMatch(expected);
        expect(recognized.data.confidence, `${language}: insufficient confidence`).toBeGreaterThan(
          70,
        );
        expect(recognized.data.blocks?.length).toBeGreaterThan(0);
      } finally {
        await worker.terminate();
      }
    }
  }, 180_000);
});

describe("assets", () => {
  it("verify every model against its pinned SHA-256", () => {
    expect(verifiedOcrModels().map((model) => model.language)).toEqual(["por", "eng", "spa"]);
    expect(verifiedOcrModels(["eng"]).map((model) => model.language)).toEqual(["eng"]);
    expect(ocrLicenseFiles().map((file) => file.name)).toContain("TR46-MIT.txt");
  });

  it("copy worker, cores, models and licenses, and detect a changed file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "edi-ocr-assets-"));
    try {
      const files = copyOcrAssets(directory);
      expect(files).toContain("worker.min.js");
      expect(files).toContain("models/por.traineddata");
      expect(files).toContain("licenses/Tessdata-Fast-Apache-2.0.txt");
      expect(files.filter((file) => file.startsWith("core/")).length).toBeGreaterThanOrEqual(2);
      verifyOcrAssets(directory);
      await writeFile(join(directory, "models", "spa.traineddata"), "alterado");
      expect(() => verifyOcrAssets(directory)).toThrow(/models\/spa.traineddata/);
      await rm(join(directory, "worker.min.js"));
      expect(() => verifyOcrAssets(directory, { languages: ["por"] })).toThrow(
        /Arquivo OCR ausente: worker.min.js/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
