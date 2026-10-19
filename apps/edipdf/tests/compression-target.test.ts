import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { plainText } from "@informach/edi-ocr/search";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { decodeBoundedPdfStream } from "../src/shared/bounded-pdf-stream.ts";
import { compressPdf, compressToTarget, type Reencode } from "../src/shared/compress.ts";
import { imagePixelBudgets } from "../src/shared/image-usage.ts";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";

const require = createRequire(import.meta.url);
const canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json"));
const { createCanvas, loadImage, ImageData } = canvasRequire("@napi-rs/canvas");
const engine = await LocalPdfEngine.create(
  await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
);
const realEncode: Reencode = async (input, maxSide, quality) => {
  const source = createCanvas(input.width, input.height),
    context = source.getContext("2d");
  if (input.kind === "jpeg") context.drawImage(await loadImage(input.bytes), 0, 0);
  else {
    const rgba = new Uint8ClampedArray(input.width * input.height * 4);
    for (let i = 0; i < input.width * input.height; i++) {
      for (let channel = 0; channel < 3; channel++)
        rgba[i * 4 + channel] =
          input.data[i * input.channels + (input.channels === 1 ? 0 : channel)];
      rgba[i * 4 + 3] = 255;
    }
    context.putImageData(new ImageData(rgba, input.width, input.height), 0, 0);
  }
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const output = createCanvas(
    Math.max(1, Math.round(source.width * scale)),
    Math.max(1, Math.round(source.height * scale)),
  );
  output.getContext("2d").drawImage(source, 0, 0, output.width, output.height);
  return {
    bytes: new Uint8Array(output.toBuffer("image/jpeg", quality * 100)),
    width: output.width,
    height: output.height,
  };
};

async function fixture() {
  const canvas = createCanvas(2000, 1200),
    context = canvas.getContext("2d");
  const data = new Uint8ClampedArray(2000 * 1200 * 4);
  let state = 12345;
  for (let i = 0; i < data.length; i += 4) {
    state = (1664525 * state + 1013904223) >>> 0;
    data[i] = state & 255;
    data[i + 1] = (state >>> 8) & 255;
    data[i + 2] = (state >>> 16) & 255;
    data[i + 3] = 255;
  }
  context.putImageData(new ImageData(data, 2000, 1200), 0, 0);
  const doc = await PDFDocument.create(),
    page = doc.addPage([600, 800]);
  const image = await doc.embedJpg(canvas.toBuffer("image/jpeg", 95));
  page.drawImage(image, { x: 20, y: 200, width: 144, height: 86.4 });
  page.drawText("TEXTO_PRESERVADO", { x: 50, y: 700 });
  return { bytes: await doc.save(), image };
}

test("compression reports actual page count and rejects an empty PDF without inventing a page", async () => {
  const empty = await PDFDocument.create();
  await assert.rejects(
    compressPdf(await empty.save({ addDefaultPage: false }), "balanced", realEncode),
    /página/i,
  );
  const { bytes } = await fixture();
  assert.equal((await compressToTarget(bytes, 500_000, "strong", realEncode)).pages, 1);
});

test("target compression uses actual image placement, keeps vector text and produces decodable JPEG", async () => {
  const { bytes } = await fixture();
  const result = await compressToTarget(bytes, 500_000, "strong", realEncode);
  assert.equal(result.targetMet, true);
  assert.ok(result.bytes.length <= 500_000);
  assert.deepEqual(result.profile, { dpi: 200, quality: 0.85 });
  assert.match(
    plainText(engine.textDocument(result.bytes, { includeAnnotations: false }).pages[0].glyphs),
    /TEXTO_PRESERVADO/,
  );
  const object = engine.inspect(result.bytes).pages[0].objects.find((item) => item.type === 3);
  assert.ok(object);
  const pixels = engine.imagePixels(result.bytes, 0, object.index);
  assert.ok(pixels.width <= 400);
  assert.ok(pixels.height <= 240);
  assert.equal(pixels.pixels.length, pixels.width * pixels.height * 4);
});

test("an impossible target returns the smallest result honestly and retries from original JPEG bytes", async () => {
  const { bytes } = await fixture();
  let originalImage: Uint8Array | undefined,
    attempts = 0;
  const encode: Reencode = async (image, maxSide, quality) => {
    assert.equal(image.kind, "jpeg");
    if (image.kind === "jpeg") {
      if (originalImage) assert.deepEqual(image.bytes, originalImage);
      else originalImage = image.bytes.slice();
    }
    attempts++;
    return realEncode(image, maxSide, quality);
  };
  const result = await compressToTarget(bytes, 1024, "strong", encode);
  assert.equal(result.targetMet, false);
  assert.equal(result.attempts, 5);
  assert.equal(attempts, 5);
  assert.ok(result.bytes.length < bytes.length);
  assert.ok(result.bytes.length > 1024);
  await assert.rejects(compressToTarget(bytes, NaN, "strong", encode), /meta/);
});

test("image geometry respects nested matrices, shared larger placements and strings containing fake operators", async () => {
  const original = await fixture(),
    doc = await PDFDocument.load(original.bytes);
  const image = doc.context
    .enumerateIndirectObjects()
    .find(
      ([, object]) =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
    );
  assert.ok(image);
  const page = doc.addPage([600, 800]);
  const form = doc.context.register(
    doc.context.flateStream("q 36 0 0 36 0 0 cm /Im Do Q", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 100, 100],
      Matrix: [2, 0, 0, 2, 0, 0],
      Resources: { XObject: { Im: image[0] } },
    }),
  );
  const name = page.node.newXObject("Fm", form);
  page.node.addContentStream(
    doc.context.register(
      doc.context.flateStream(
        `q 4 0 0 4 0 0 cm ${name.asString()} Do Q\nBT (q 999 0 0 999 0 0 cm /Im Do Q) Tj ET\n% /Im Do`,
      ),
    ),
  );
  const usage = imagePixelBudgets(doc, 100);
  assert.deepEqual(usage.warnings, []);
  assert.ok(Math.abs((usage.budgets.get(image[0]) ?? 0) - 2000 / 3) < 1e-6);
});

test("compression preserves ICC and transparencies and reports unanalysable inline-image scopes", async () => {
  const original = await fixture(),
    doc = await PDFDocument.load(original.bytes);
  const image = doc.context
    .enumerateIndirectObjects()
    .find(
      ([, object]) =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
    );
  assert.ok(image && image[1] instanceof PDFRawStream);
  const stream = image[1];
  const alpha = createCanvas(300, 300);
  alpha.getContext("2d").fillStyle = "rgba(255,0,0,0.5)";
  alpha.getContext("2d").fillRect(0, 0, 300, 300);
  const transparent = await doc.embedPng(alpha.toBuffer("image/png"));
  doc.getPage(0).drawImage(transparent, { x: 200, y: 200, width: 100, height: 100 });
  const profile = doc.context.register(doc.context.stream(new Uint8Array(128), { N: 3 }));
  stream.dict.set(PDFName.of("ColorSpace"), doc.context.obj([PDFName.of("ICCBased"), profile]));
  const result = await compressPdf(await doc.save(), "strong", realEncode);
  const saved = await PDFDocument.load(result.bytes),
    preserved = saved.context.lookup(image[0]);
  assert.ok(preserved instanceof PDFRawStream);
  assert.deepEqual(preserved.contents, stream.contents);
  assert.ok(result.warnings.some((warning) => warning.includes("perfil de cor")));
  assert.ok(result.warnings.some((warning) => warning.includes("transparência")));
  const inline = await PDFDocument.load(original.bytes);
  inline
    .getPage(0)
    .node.addContentStream(
      inline.context.register(
        inline.context.flateStream("BI /W 1 /H 1 /BPC 8 /CS /RGB ID \x00\x00\x00 EI"),
      ),
    );
  const usage = imagePixelBudgets(inline, 100);
  assert.equal(usage.budgets.size, 0);
  assert.ok(
    usage.warnings.some((warning) => warning.includes("inline")),
    JSON.stringify(usage.warnings),
  );
});

test("codec errors abort compression instead of being presented as success", async () => {
  const { bytes } = await fixture();
  await assert.rejects(
    compressPdf(bytes, "strong", async () => {
      throw new Error("codec indisponível");
    }),
    /codec indisponível/,
  );
});

test("bounded PDF decoding rejects expansion beyond the budget and decodes filter chains", async () => {
  const doc = await PDFDocument.create();
  const payload = new Uint8Array(1024 * 1024).fill(65);
  const compressed = new Uint8Array(deflateSync(payload));
  const stream = doc.context.stream(compressed, { Filter: "FlateDecode" });
  assert.throws(() => decodeBoundedPdfStream(stream, 4096), /limite de memória/);
  assert.deepEqual(decodeBoundedPdfStream(stream, payload.length), payload);
  const hex = new TextEncoder().encode(Buffer.from(compressed).toString("hex") + ">");
  const chain = doc.context.stream(hex, { Filter: ["ASCIIHexDecode", "FlateDecode"] });
  assert.deepEqual(decodeBoundedPdfStream(chain, payload.length), payload);
  assert.throws(
    () =>
      decodeBoundedPdfStream(doc.context.stream(new Uint8Array(), { Filter: "FlateDecode" }), 4096),
    /vazio/,
  );
});
