import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { cropPdfImage, croppedImageMatrix } from "../src/shared/image-crop.ts";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";

const require = createRequire(import.meta.url),
  canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json")),
  { createCanvas } = canvasRequire("@napi-rs/canvas"),
  engine = await LocalPdfEngine.create(
    await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
  );

test("pixel cropping preserves affine position, peers, fields and source bytes without stretching", async () => {
  const canvas = createCanvas(8, 6),
    ctx = canvas.getContext("2d");
  const sourcePixels = new Uint8Array(8 * 6 * 4);
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 8; x++) sourcePixels.set([x * 30, y * 40, 100, 255], (y * 8 + x) * 4);
  const data = ctx.createImageData(8, 6);
  data.data.set(sourcePixels);
  ctx.putImageData(data, 0, 0);
  const pdf = await PDFDocument.create(),
    image = await pdf.embedPng(canvas.toBuffer("image/png"));
  for (let i = 0; i < 2; i++)
    pdf.addPage([300, 300]).drawImage(image, { x: 20, y: 30, width: 160, height: 120 });
  const field = pdf.getForm().createTextField("preserved");
  field.setText("ORIGINAL");
  field.addToPage(pdf.getPage(0), { x: 10, y: 270, width: 100, height: 20 });
  const original = await pdf.save(),
    snapshot = new Uint8Array(original),
    crop = { x: 0.25, y: 1 / 6, w: 0.5, h: 0.5 },
    expected = new Uint8Array(4 * 3 * 4);
  for (let y = 0; y < 3; y++)
    expected.set(sourcePixels.subarray(((y + 1) * 8 + 2) * 4, ((y + 1) * 8 + 6) * 4), y * 4 * 4);
  const matrices: [number, number, number, number, number, number][] = [
    [160, 0, 0, 120, 20, 30],
    [0, 160, -120, 0, 180, 30],
    [-160, 0, 0, 120, 180, 30],
    [160, 30, 20, 120, 20, 30],
  ];
  for (const matrix of matrices) {
    const input = engine.transform(original, [{ kind: "transform", page: 0, object: 0, matrix }]),
      output = await cropPdfImage(engine, input, 0, 0, crop),
      bitmap = engine.imagePixels(output, 0, 0);
    assert.deepEqual({ w: bitmap.width, h: bitmap.height }, { w: 4, h: 3 });
    assert.deepEqual(bitmap.pixels, expected);
    assert.deepEqual(engine.imagePixels(output, 1, 0).pixels, sourcePixels);
    const actual = engine.inspect(output).pages[0]?.objects[0]?.matrix;
    assert.ok(actual);
    for (const [at, value] of croppedImageMatrix(matrix, crop).entries())
      assert.ok(Math.abs(value - (actual[at] ?? NaN)) < 0.001);
    assert.equal(
      (await PDFDocument.load(output)).getForm().getTextField("preserved").getText(),
      "ORIGINAL",
    );
  }
  assert.deepEqual(original, snapshot);
  await assert.rejects(() => cropPdfImage(engine, original, 0, 0, { x: 0.9, y: 0, w: 0.5, h: 1 }));
  await assert.rejects(
    () => cropPdfImage(engine, original, 0, 0, { x: 0, y: 0, w: 0.01, h: 1 }),
    /pixel inteiro/,
  );
});

test("cropping a transparent image conserves its alpha samples", async () => {
  const canvas = createCanvas(4, 4),
    ctx = canvas.getContext("2d"),
    data = ctx.createImageData(4, 4);
  for (let i = 0; i < 16; i++) data.data.set([200, 100, 50, i % 2 === 0 ? 255 : 128], i * 4);
  ctx.putImageData(data, 0, 0);
  const pdf = await PDFDocument.create(),
    image = await pdf.embedPng(canvas.toBuffer("image/png"));
  pdf.addPage([200, 200]).drawImage(image, { x: 20, y: 20, width: 100, height: 100 });
  const original = await pdf.save(),
    before = engine.imagePixels(original, 0, 0),
    output = await cropPdfImage(engine, original, 0, 0, { x: 0.5, y: 0, w: 0.5, h: 1 }),
    after = engine.imagePixels(output, 0, 0);
  for (let y = 0; y < 4; y++)
    assert.deepEqual(
      after.pixels.subarray(y * 8, y * 8 + 8),
      before.pixels.subarray((y * 4 + 2) * 4, (y * 4 + 4) * 4),
    );
  assert.equal(before.pixels[3], 255);
  assert.equal(before.pixels[7], 128);
});

test("cropping preserves displayed alpha without applying the object's opacity twice", async () => {
  const canvas = createCanvas(4, 4),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(200, 100, 50, 0.5)";
  ctx.fillRect(0, 0, 4, 4);
  const pdf = await PDFDocument.create(),
    image = await pdf.embedPng(canvas.toBuffer("image/png"));
  pdf.addPage([200, 200]).drawImage(image, { x: 20, y: 20, width: 100, height: 100, opacity: 0.5 });
  const original = await pdf.save(),
    before = engine.visibleImage(original, 0, 0, 1),
    output = await cropPdfImage(engine, original, 0, 0, { x: 0.5, y: 0, w: 0.5, h: 1 }),
    after = engine.visibleImage(output, 0, 0, 1);
  assert.ok(before && after);
  assert.equal(after.width, before.width / 2);
  assert.equal(after.height, before.height);
  const expected = new Uint8Array(after.pixels.length);
  for (let y = 0; y < before.height; y++)
    expected.set(
      before.pixels.subarray((y * before.width + after.width) * 4, (y + 1) * before.width * 4),
      y * after.width * 4,
    );
  assert.equal(
    Buffer.compare(after.pixels, expected),
    0,
    "Displayed RGBA pixels changed inside the conserved region",
  );
});

test("unsupported graphic-state masks and transfer functions are refused before cropping", async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([200, 200]);
  page.drawRectangle({ x: 10, y: 10, width: 20, height: 20 });
  const original = await pdf.save();
  for (const key of ["SMask", "TR", "TR2"]) {
    const candidate = await PDFDocument.load(original),
      resources = candidate.getPage(0).node.Resources();
    assert.ok(resources);
    resources.set(
      PDFName.of("ExtGState"),
      candidate.context.obj({ GS: { [key]: candidate.context.obj({}) } }),
    );
    const bytes = await candidate.save();
    await assert.rejects(
      () => cropPdfImage(engine, bytes, 0, 0, { x: 0, y: 0, w: 1, h: 1 }),
      /máscara de estado gráfico/,
    );
  }
});
