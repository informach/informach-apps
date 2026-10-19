import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { degrees, PDFDocument, PDFName, PDFNumber, rgb } from "pdf-lib";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { tiffToPdf } from "../src/shared/tiff.ts";
import { pdfToTiff } from "../src/shared/tiff-export.ts";
import { inspectTiff } from "../src/shared/tiff-format.ts";

const root = new URL("./fixtures/tiff/", import.meta.url),
  require = createRequire(import.meta.url);
const { createCanvas, loadImage } = createRequire(require.resolve("pdfjs-dist/package.json"))(
  "@napi-rs/canvas",
);
const manifest: {
  generator: string;
  fixtures: { name: string; pages: string[]; sha256: string; compression: string }[];
} = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
for (const fixture of manifest.fixtures)
  test(`TIFF ${fixture.name} matches independent ${manifest.generator} pixels and page order`, async () => {
    const bytes = new Uint8Array(await readFile(new URL(fixture.name, root)));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), fixture.sha256);
    const progress: number[] = [],
      converted = await tiffToPdf(bytes, (page) => progress.push(page));
    assert.equal(converted.pages, fixture.pages.length);
    assert.deepEqual(
      progress,
      fixture.pages.map((_, index) => index + 1),
    );
    const loaded = await PDFDocument.load(converted.bytes);
    assert.equal(loaded.getPageCount(), fixture.pages.length);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"),
      loading = getDocument({
        data: new Uint8Array(converted.bytes),
        wasmUrl: `${join(dirname(require.resolve("pdfjs-dist/package.json")), "wasm")}/`,
      });
    try {
      const pdf = await loading.promise;
      for (let index = 0; index < fixture.pages.length; index++) {
        const expectedImage = await loadImage(await readFile(new URL(fixture.pages[index], root))),
          page = await pdf.getPage(index + 1),
          viewport = page.getViewport({ scale: 1 });
        assert.equal(Math.round(viewport.width), expectedImage.width);
        assert.equal(Math.round(viewport.height), expectedImage.height);
        const actual = createCanvas(expectedImage.width, expectedImage.height),
          expected = createCanvas(expectedImage.width, expectedImage.height);
        await page.render({ canvas: actual, canvasContext: actual.getContext("2d"), viewport })
          .promise;
        const context = expected.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, expected.width, expected.height);
        context.drawImage(expectedImage, 0, 0);
        const a = actual.getContext("2d").getImageData(0, 0, actual.width, actual.height).data,
          b = context.getImageData(0, 0, expected.width, expected.height).data;
        let differences = 0,
          worst = 0;
        const tolerance = fixture.compression === "jpeg" ? 12 : 1;
        for (let at = 0; at < a.length; at++) {
          const delta = Math.abs(a[at] - b[at]);
          worst = Math.max(worst, delta);
          if (delta > tolerance) differences++;
        }
        assert.equal(
          differences,
          0,
          `${fixture.name} page ${index + 1}: ${differences} channels differ, maximum ${worst}`,
        );
      }
    } finally {
      await loading.destroy();
    }
  });

function tag(
  bytes: Uint8Array,
  id: number,
): { view: DataView; entry: number; little: boolean; ifd: number } {
  const little = bytes[0] === 73,
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    ifd = view.getUint32(4, little),
    count = view.getUint16(ifd, little);
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (view.getUint16(entry, little) === id) return { view, entry, little, ifd };
  }
  throw new Error(`Missing fixture tag ${id}`);
}
test("TIFF validates all directories, offsets, dimensions and profiles before decoding", async () => {
  const original = new Uint8Array(await readFile(new URL("rgb-raw.tif", root)));
  const changed = (id: number, value: number) => {
    const bytes = new Uint8Array(original),
      found = tag(bytes, id);
    found.view.setUint32(found.entry + 8, value, found.little);
    return bytes;
  };
  assert.throws(() => inspectTiff(changed(256, 8193)), /8192/);
  assert.throws(() => inspectTiff(changed(273, original.length - 1)), /limites/);
  assert.throws(() => inspectTiff(changed(279, 0)), /Strip/);
  const cycle = new Uint8Array(original),
    found = tag(cycle, 256),
    count = found.view.getUint16(found.ifd, found.little);
  found.view.setUint32(found.ifd + 2 + count * 12, found.ifd, found.little);
  assert.throws(() => inspectTiff(cycle), /ciclo/);
  const fraction = new Uint8Array(original),
    field = tag(fraction, 256);
  field.view.setUint16(field.entry + 2, 5, field.little);
  field.view.setUint32(field.entry + 8, 8, field.little);
  assert.throws(() => inspectTiff(fraction), /fração/);
  const big = new Uint8Array(original);
  new DataView(big.buffer).setUint16(2, 43, true);
  assert.throws(() => inspectTiff(big), /BigTIFF/);
  const incomplete = changed(279, 3);
  await assert.rejects(tiffToPdf(incomplete), /expansão/);
});

test("TIFF compressed strips cannot expand beyond the declared image", async () => {
  for (const name of ["rgb-packbits.tif", "rgb-tiff_lzw.tif", "rgb-tiff_adobe_deflate.tif"]) {
    const bytes = new Uint8Array(await readFile(new URL(name, root))),
      field = tag(bytes, 256);
    field.view.setUint32(field.entry + 8, 1, field.little);
    await assert.rejects(tiffToPdf(bytes), /limite|tamanho|dimensões/);
  }
});

test("native PDFium also renders TIFF fax polarity, multiple strips, mirrors and alpha", async () => {
  const engine = await LocalPdfEngine.create(
    await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
  );
  for (const name of [
    "fax-group3.tif",
    "fax-whitezero-group4.tif",
    "fax-tiff_ccitt.tif",
    "fax-lsb.tif",
    "multistrip.tif",
    "orientation-5.tif",
    "orientation-7.tif",
    "alpha.tif",
    "associated-alpha.tif",
  ]) {
    const fixture = manifest.fixtures.find((item) => item.name === name);
    assert.ok(fixture);
    const result = await tiffToPdf(new Uint8Array(await readFile(new URL(name, root)))),
      actual = engine.renderPage(result.bytes, 0, 72),
      expectedImage = await loadImage(await readFile(new URL(fixture.pages[0], root))),
      canvas = createCanvas(expectedImage.width, expectedImage.height),
      context = canvas.getContext("2d");
    assert.equal(actual.width, expectedImage.width);
    assert.equal(actual.height, expectedImage.height);
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(expectedImage, 0, 0);
    const expected = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let differences = 0;
    for (let pixel = 0; pixel < actual.width * actual.height; pixel++)
      for (let channel = 0; channel < 3; channel++)
        if (Math.abs(actual.pixels[pixel * 3 + channel] - expected[pixel * 4 + channel]) > 2)
          differences++;
    assert.equal(differences, 0, name);
  }
});

test("TIFF export preserves all cropped/rotated page sizes, RGB pixels and visible form appearances", async () => {
  const engine = await LocalPdfEngine.create(
      await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
    ),
    pdf = await PDFDocument.create();
  const first = pdf.addPage([200, 300]);
  first.setCropBox(20, 30, 120, 180);
  first.setRotation(degrees(90));
  first.drawRectangle({ x: 20, y: 30, width: 60, height: 180, color: rgb(1, 0, 0) });
  first.drawRectangle({ x: 80, y: 30, width: 60, height: 180, color: rgb(0, 0, 1) });
  const second = pdf.addPage([144, 216]),
    field = pdf.getForm().createTextField("visible");
  field.setText("VISIBLE");
  field.addToPage(second, { x: 10, y: 100, width: 120, height: 30 });
  const source = new Uint8Array(await pdf.save()),
    before = new Uint8Array(source),
    progress: number[] = [];
  const output = await pdfToTiff(source, engine, 150, (page) => progress.push(page));
  assert.deepEqual(source, before);
  assert.deepEqual(progress, [1, 2]);
  assert.equal(output.pages, 2);
  assert.match(output.warnings[0], /pixels/);
  const inspected = inspectTiff(output.bytes);
  assert.deepEqual(
    inspected.pages.map((page) => [page.width, page.height, page.dpiX, page.dpiY]),
    [
      [375, 250, 150, 150],
      [300, 450, 150, 150],
    ],
  );
  const converted = await tiffToPdf(output.bytes),
    firstPixels = engine.renderPage(converted.bytes, 0, 150),
    form = engine.renderPage(converted.bytes, 1, 150);
  assert.deepEqual(
    Array.from(firstPixels.pixels.subarray(3 * (50 * 375 + 100), 3 * (50 * 375 + 100) + 3)),
    [255, 0, 0],
  );
  assert.deepEqual(
    Array.from(firstPixels.pixels.subarray(3 * (200 * 375 + 100), 3 * (200 * 375 + 100) + 3)),
    [0, 0, 255],
  );
  let ink = 0;
  for (let y = 190; y < 240; y++)
    for (let x = 30; x < 200; x++) if (form.pixels[(y * form.width + x) * 3] < 100) ink++;
  assert.ok(ink > 100, `form text appearance must survive rasterization, ink=${ink}`);
  await assert.rejects(pdfToTiff(source, engine, 120), /150/);
  const huge = await PDFDocument.create();
  huge.addPage([14400, 14400]);
  const hugeBytes = new Uint8Array(await huge.save());
  await assert.rejects(pdfToTiff(hugeBytes, engine, 300), /limites/);
  const units = await PDFDocument.create();
  const unitPage = units.addPage([72, 144]);
  unitPage.node.set(PDFName.of("UserUnit"), PDFNumber.of(2));
  unitPage.drawRectangle({ x: 0, y: 0, width: 72, height: 144, color: rgb(1, 0, 0) });
  const physical = inspectTiff((await pdfToTiff(await units.save(), engine, 150)).bytes).pages[0];
  assert.ok(physical);
  assert.deepEqual(
    [physical.width, physical.height, physical.dpiX, physical.dpiY],
    [300, 600, 150, 150],
  );
});
