import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  clip,
  degrees,
  endPath,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from "pdf-lib";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { pdfToOffice, pdfToPlainText } from "../src/shared/pdf-to-office.ts";

const require = createRequire(import.meta.url),
  engine = await LocalPdfEngine.create(
    await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
  );

test("PDF reconstruction preserves first-level images and native text without silently claiming vector fidelity", async () => {
  const canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json")),
    { createCanvas } = canvasRequire("@napi-rs/canvas");
  const canvas = createCanvas(20, 20),
    context = canvas.getContext("2d");
  context.fillStyle = "red";
  context.fillRect(0, 0, 20, 20);
  const source = await PDFDocument.create(),
    page = source.addPage([400, 500]);
  page.drawText("TEXTO_EDITÁVEL", { x: 30, y: 400, size: 18 });
  page.drawRectangle({ x: 20, y: 300, width: 100, height: 30 });
  page.drawImage(await source.embedPng(canvas.toBuffer("image/png")), {
    x: 20,
    y: 200,
    width: 100,
    height: 100,
  });
  const bytes = await source.save();
  const model = await pdfToOffice(bytes, "Documento", engine, async (image, rotation) => {
    assert.equal(rotation, 0);
    assert.equal(image.width, 200);
    const output = createCanvas(image.width, image.height),
      outputContext = output.getContext("2d"),
      data = outputContext.createImageData(image.width, image.height);
    data.data.set(image.pixels);
    outputContext.putImageData(data, 0, 0);
    return new Uint8Array(output.toBuffer("image/png"));
  });
  assert.ok(
    model.pages[0].blocks.some(
      (block) =>
        block.kind === "paragraph" &&
        block.runs
          .map((run) => run.text)
          .join("")
          .includes("TEXTO_EDITÁVEL"),
    ),
  );
  assert.ok(
    model.pages[0].blocks.some(
      (block) => block.kind === "image" && block.width === 100 && block.height === 100,
    ),
  );
  assert.ok(model.warnings.some((warning) => /Desenhos vetoriais/.test(warning)));
  const text = pdfToPlainText(bytes, engine);
  assert.match(new TextDecoder().decode(text.bytes), /TEXTO_EDITÁVEL/);
  assert.doesNotMatch(new TextDecoder().decode(text.bytes), /\[Imagem\]/);
});

test("plain text export refuses image-only empty results and warns when another page still needs OCR", async () => {
  const source = await PDFDocument.create();
  source.addPage([400, 500]);
  const empty = await source.save();
  assert.throws(() => pdfToPlainText(empty, engine), /não tem texto pesquisável/);
  source.addPage([400, 500]).drawText("PÁGINA_COM_TEXTO", { x: 20, y: 400 });
  const result = pdfToPlainText(await source.save(), engine);
  assert.equal(result.pages, 2);
  assert.ok(result.warnings.some((warning) => /OCR/.test(warning)));
  assert.match(new TextDecoder().decode(result.bytes), /PÁGINA_COM_TEXTO/);
});

test("converted images retain only the visible CropBox in every page rotation and do not include hidden pixels", async () => {
  const canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json")),
    { createCanvas } = canvasRequire("@napi-rs/canvas");
  const canvas = createCanvas(20, 10),
    context = canvas.getContext("2d");
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, 10, 10);
  context.fillStyle = "#00ff00";
  context.fillRect(10, 0, 10, 10);
  for (const rotation of [0, 90, 180, 270]) {
    const document = await PDFDocument.create(),
      page = document.addPage([200, 100]);
    page.drawImage(await document.embedPng(canvas.toBuffer("image/png")), {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
    page.setCropBox(0, 0, 100, 100);
    page.setRotation(degrees(rotation));
    const bytes = new Uint8Array(await document.save()),
      image = engine.visibleImage(bytes, 0, 0);
    assert.ok(image);
    assert.equal(image.width, 200);
    assert.equal(image.height, 200);
    assert.equal(image.box.w, 100);
    assert.equal(image.box.h, 100);
    for (let at = 0; at < image.pixels.length; at += 4) {
      assert.equal(image.pixels[at + 1], 0);
      assert.equal(image.pixels[at], 255);
      assert.equal(image.pixels[at + 3], 255);
    }
    const converted = await pdfToOffice(bytes, "Crop", engine, async (pixels, angle) => {
      assert.equal(angle, 0);
      assert.equal(pixels.width, 200);
      assert.equal(pixels.height, 200);
      const result = createCanvas(pixels.width, pixels.height),
        target = result.getContext("2d"),
        data = target.createImageData(pixels.width, pixels.height);
      data.data.set(pixels.pixels);
      target.putImageData(data, 0, 0);
      return new Uint8Array(result.toBuffer("image/png"));
    });
    assert.ok(
      converted.pages[0]?.blocks.some(
        (block) => block.kind === "image" && block.width === 100 && block.height === 100,
      ),
    );
  }
});

test("visible image extraction preserves object clip paths and excludes neighboring objects and widget appearances", async () => {
  const canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json")),
    { createCanvas } = canvasRequire("@napi-rs/canvas");
  const canvas = createCanvas(20, 10),
    context = canvas.getContext("2d");
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, 10, 10);
  context.fillStyle = "#00ff00";
  context.fillRect(10, 0, 10, 10);
  const document = await PDFDocument.create(),
    page = document.addPage([200, 100]);
  page.pushOperators(pushGraphicsState(), rectangle(0, 0, 100, 100), clip(), endPath());
  page.drawImage(await document.embedPng(canvas.toBuffer("image/png")), {
    x: 0,
    y: 0,
    width: 200,
    height: 100,
  });
  page.pushOperators(popGraphicsState());
  page.drawText("NEIGHBOR", { x: 10, y: 40, size: 20 });
  const field = document.getForm().createTextField("neighbor");
  field.setText("WIDGET");
  field.addToPage(page, { x: 10, y: 10, width: 70, height: 20 });
  const image = engine.visibleImage(new Uint8Array(await document.save()), 0, 0);
  assert.ok(image);
  let opaque = 0,
    transparent = 0;
  for (let at = 0; at < image.pixels.length; at += 4) {
    assert.equal(image.pixels[at + 1], 0);
    if (image.pixels[at + 3] === 255) {
      assert.equal(image.pixels[at], 255);
      opaque++;
    } else {
      assert.equal(image.pixels[at + 3], 0);
      assert.equal(image.pixels[at], 0);
      transparent++;
    }
  }
  assert.equal(opaque, 40000);
  assert.equal(transparent, 40000);
});

test("TXT and editable Office reconstruction do not export text outside a nonzero visible CropBox in any rotation", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const document = await PDFDocument.create(),
      page = document.addPage([400, 300]);
    page.drawText("VISIBLE", { x: 30, y: 150, size: 10 });
    page.drawText("RIGHT_SECRET", { x: 230, y: 150, size: 10 });
    page.drawText("BOTTOM_SECRET", { x: 30, y: 0, size: 10 });
    page.setCropBox(20, 20, 200, 200);
    page.setRotation(degrees(rotation));
    const bytes = new Uint8Array(await document.save());
    assert.match(
      engine
        .textDocument(bytes, { includeAnnotations: false })
        .pages[0]?.glyphs.map((glyph) => glyph.text)
        .join("") ?? "",
      /RIGHT_SECRET/,
    );
    const plain = new TextDecoder().decode(pdfToPlainText(bytes, engine).bytes);
    assert.match(plain, /VISIBLE/);
    assert.doesNotMatch(plain, /SECRET/);
    const output = await pdfToOffice(bytes, "Visível", engine, async () => {
      throw new Error("This source has no images");
    });
    const text = output.pages
      .flatMap((page) =>
        page.blocks.flatMap((block) =>
          block.kind === "paragraph" ? block.runs.map((run) => run.text) : [],
        ),
      )
      .join(" ");
    assert.equal([...text.replace(/\s/g, "")].sort().join(""), [..."VISIBLE"].sort().join(""));
    assert.ok(output.warnings.some((warning) => warning.includes("recorte visível")));
  }
});
