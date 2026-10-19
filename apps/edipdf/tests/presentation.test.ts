import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { officePart, readOfficePackage, writeOfficePackage } from "../src/shared/office-package.ts";
import { parseOfficeXml } from "../src/shared/office-xml.ts";
import { readOpenPackage } from "../src/shared/open-document/package.ts";
import { cropPresentationPicture } from "../src/shared/presentation/crop-picture.ts";
import { presentationSchema } from "../src/shared/presentation/format.ts";
import { exportOdp } from "../src/shared/presentation/odp-export.ts";
import { importOdp } from "../src/shared/presentation/odp-import.ts";
import { officeFlowPresentation } from "../src/shared/presentation/office-flow.ts";
import { exportPptx } from "../src/shared/presentation/pptx-export.ts";
import { importPptx } from "../src/shared/presentation/pptx-import.ts";
import { preparePresentation } from "../src/shared/presentation/render.ts";

const [regular, bold, italic, boldItalic] = await Promise.all(
  ["Regular", "Bold", "Italic", "BoldItalic"].map((name) =>
    readFile(new URL(`../resources/fonts/NotoSans-${name}.ttf`, import.meta.url)),
  ),
);
assert.ok(regular && bold && italic && boldItalic);
const fonts = { regular, bold, italic, boldItalic },
  require = createRequire(import.meta.url),
  engine = await LocalPdfEngine.create(
    await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
  );
const picture = new Uint8Array(
  await readFile(new URL("fixtures/tiff/rgb-raw-1.png", import.meta.url)),
);
const source = presentationSchema.parse({
  title: "Apresentação αβγ",
  width: 720,
  height: 405,
  warnings: [],
  slides: [
    {
      name: "Primeiro",
      background: "#ffffff",
      elements: [
        {
          kind: "shape",
          id: "box",
          box: { x: 30, y: 30, w: 660, h: 80 },
          shape: "rect",
          fill: "#eeeeff",
          stroke: "#123456",
        },
        {
          kind: "text",
          id: "title",
          box: { x: 40, y: 40, w: 630, h: 60 },
          paragraphs: [
            {
              kind: "paragraph",
              align: "center",
              runs: [{ text: "AÇÃO_LOCAL_αβγ", bold: true, color: "#264a73", size: 24 }],
            },
          ],
        },
        {
          kind: "image",
          id: "picture",
          box: { x: 40, y: 150, w: 200, h: 150 },
          bytes: picture,
          format: "png",
          alt: "Imagem local",
        },
        {
          kind: "text",
          id: "body",
          box: { x: 300, y: 150, w: 350, h: 150 },
          paragraphs: [
            {
              kind: "paragraph",
              runs: [
                {
                  text: "Texto editável; café e informação.\nSegunda linha.",
                  italic: true,
                  size: 16,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "Segundo",
      elements: [
        {
          kind: "text",
          id: "last",
          box: { x: 40, y: 40, w: 630, h: 80 },
          paragraphs: [{ kind: "paragraph", runs: [{ text: "ULTIMO_SLIDE", size: 20 }] }],
        },
      ],
    },
  ],
});
test("presentation preview keeps all slides, fixed editable text positions, Unicode, images and native basic shapes", async () => {
  const prepared = await preparePresentation(source, fonts),
    inspection = engine.inspect(prepared.pdf),
    indexed = engine.textDocument(prepared.pdf, { includeAnnotations: true });
  assert.equal((await PDFDocument.load(prepared.pdf)).getPageCount(), 2);
  assert.equal(inspection.pages[0]?.crop.right, 720);
  assert.equal(inspection.pages[0]?.crop.top, 405);
  assert.ok(
    indexed.pages[0]?.glyphs
      .map((glyph) => glyph.text)
      .join("")
      .includes("AÇÃO_LOCAL_αβγ"),
  );
  assert.ok(
    indexed.pages[1]?.glyphs
      .map((glyph) => glyph.text)
      .join("")
      .includes("ULTIMO_SLIDE"),
  );
  assert.ok(inspection.pages[0]?.objects.some((object) => object.type === 3));
  const title = prepared.slides[0]?.elements.find((entry) => entry.element.id === "title");
  assert.equal(title?.lines?.[0]?.fragments[0]?.bold, true);
  assert.ok((title?.lines?.[0]?.left ?? 0) > 100);
});
test("PPTX export contains real editable Unicode text, separate image/shape objects and correct slide geometry", async () => {
  const output = await exportPptx(await preparePresentation(source, fonts)),
    parts = readOfficePackage(output.bytes);
  const slide = parseOfficeXml(officePart(parts, "ppt/slides/slide1.xml")),
    text = Array.from(
      slide.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "t"),
    )
      .map((node) => node.textContent)
      .join(" ");
  assert.match(text, /AÇÃO_LOCAL_αβγ/);
  assert.match(text, /café e informação/);
  assert.ok(
    slide.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/presentationml/2006/main",
      "pic",
    ).length === 1,
  );
  assert.ok(
    slide.getElementsByTagNameNS("http://schemas.openxmlformats.org/presentationml/2006/main", "sp")
      .length >= 3,
  );
  const document = parseOfficeXml(officePart(parts, "ppt/presentation.xml")),
    size = document
      .getElementsByTagNameNS("http://schemas.openxmlformats.org/presentationml/2006/main", "sldSz")
      .item(0);
  assert.equal(size?.getAttribute("cx"), String(720 * 12700));
  assert.equal(size?.getAttribute("cy"), String(405 * 12700));
  assert.match(
    new TextDecoder().decode(officePart(parts, "ppt/slides/slide2.xml")),
    /ULTIMO_SLIDE/,
  );
  assert.ok(output.warnings.some((warning) => warning.includes("sem incorporar fontes")));
});
test("presentation layout shrinks within a 4 pt floor, preserves all characters and refuses impossible boxes", async () => {
  const text = "Uma frase local com várias palavras. ".repeat(20),
    document = presentationSchema.parse({
      title: "x",
      width: 720,
      height: 405,
      warnings: [],
      slides: [
        {
          name: "x",
          elements: [
            {
              kind: "text",
              id: "x",
              box: { x: 20, y: 20, w: 200, h: 60 },
              paragraphs: [{ kind: "paragraph", runs: [{ text, size: 18 }] }],
            },
          ],
        },
      ],
    });
  const result = await preparePresentation(document, fonts),
    lines = result.slides[0]?.elements[0]?.lines;
  assert.equal(lines?.flatMap((line) => line.fragments.map((run) => run.text)).join(""), text);
  assert.ok(result.warnings.some((warning) => warning.includes("reduzida")));
  assert.ok(
    lines?.every((line) =>
      line.fragments.every((fragment) => fragment.size >= 4 && fragment.size < 18),
    ),
  );
  const element = document.slides[0]?.elements[0];
  assert.ok(element);
  element.box.h = 1;
  await assert.rejects(() => preparePresentation(document, fonts), /mesmo a 4 pt/);
});

test("PPTX reader preserves editable source text, slide order, RGB shapes and images without requesting external resources", async () => {
  const output = await exportPptx(await preparePresentation(source, fonts)),
    restored = await importPptx(output.bytes, "Restored", async () => {
      throw new Error("This source has no cropped images");
    });
  assert.equal(restored.slides.length, 2);
  assert.equal(restored.width, 720);
  assert.equal(restored.height, 405);
  const text = restored.slides[0]?.elements
    .flatMap((element) =>
      element.kind === "text"
        ? element.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.text))
        : [],
    )
    .join(" ");
  assert.match(text ?? "", /AÇÃO_LOCAL_αβγ/);
  assert.match(text ?? "", /café e informação/);
  assert.equal(
    restored.slides[0]?.elements.filter((element) => element.kind === "image").length,
    1,
  );
  assert.ok(
    restored.slides[0]?.elements.some(
      (element) => element.kind === "shape" && element.fill === "#eeeeff",
    ),
  );
  const preview = await preparePresentation(restored, fonts);
  assert.equal(engine.inspect(preview.pdf).pages.length, 2);
});

test("ODP writer keeps native text/image/shape elements and embeds licensed fonts in a valid local package", async () => {
  const license = await readFile(
      new URL("../resources/licenses/Noto-OFL.txt", import.meta.url),
      "utf8",
    ),
    bytes = exportOdp(await preparePresentation(source, fonts), fonts, license),
    document = readOpenPackage(bytes, "presentation");
  assert.equal(
    document.content.getElementsByTagNameNS(
      "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
      "page",
    ).length,
    2,
  );
  assert.ok(
    document.content.getElementsByTagNameNS(
      "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
      "text-box",
    ).length >= 3,
  );
  assert.equal(
    document.content.getElementsByTagNameNS(
      "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
      "image",
    ).length,
    1,
  );
  assert.deepEqual(document.parts.get("Fonts/bold.ttf"), new Uint8Array(fonts.bold));
  const restored = importOdp(bytes, "Restored");
  assert.equal(restored.slides.length, 2);
  assert.equal(restored.width, 720);
  assert.equal(restored.height, 405);
  const preview = await preparePresentation(restored, fonts);
  const text = engine
    .textDocument(preview.pdf, { includeAnnotations: false })
    .pages.flatMap((page) => page.glyphs.map((glyph) => glyph.text))
    .join("");
  assert.match(text, /AÇÃO_LOCAL_αβγ/);
  assert.match(text, /ULTIMO_SLIDE/);
});

test("independently authored PPTX keeps theme shapes and four margins while excluding hidden objects and cropped pixels", async () => {
  const bytes = new Uint8Array(
      await readFile(new URL("fixtures/presentation/independent.pptx", import.meta.url)),
    ),
    canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json")),
    { createCanvas } = canvasRequire("@napi-rs/canvas");
  let cropCount = 0;
  const result = await importPptx(bytes, "Independente", (data, format, crop) =>
    cropPresentationPicture(data, format, crop, engine, async (pixels) => {
      cropCount++;
      assert.equal(pixels.width, 10);
      assert.equal(pixels.height, 10);
      for (let at = 0; at < pixels.pixels.length; at += 4) {
        assert.equal(pixels.pixels[at], 255);
        assert.equal(pixels.pixels[at + 1], 0);
        assert.equal(pixels.pixels[at + 3], 255);
      }
      const canvas = createCanvas(pixels.width, pixels.height),
        context = canvas.getContext("2d"),
        image = context.createImageData(pixels.width, pixels.height);
      image.data.set(pixels.pixels);
      context.putImageData(image, 0, 0);
      return new Uint8Array(canvas.toBuffer("image/png"));
    }),
  );
  assert.equal(cropCount, 1);
  assert.equal(result.slides.length, 2);
  const title = result.slides[0]?.elements.find(
    (element) =>
      element.kind === "text" &&
      element.paragraphs.some((paragraph) =>
        paragraph.runs.some((run) => run.text.includes("PPTX_LOCAL")),
      ),
  );
  assert.ok(title?.kind === "text");
  assert.ok(
    result.slides
      .flatMap((slide) => slide.elements)
      .every(
        (element) =>
          element.kind !== "text" ||
          element.paragraphs.every(
            (paragraph) =>
              !paragraph.bullet && paragraph.runs.every((run) => !run.text.includes("•")),
          ),
      ),
  );
  assert.deepEqual(title.margins, { left: 7.2, right: 7.2, top: 3.6, bottom: 3.6 });
  assert.ok(
    result.slides[0]?.elements.some(
      (element) => element.kind === "shape" && element.fill?.toLowerCase() === "#4f81bd",
    ),
  );
  const prepared = await preparePresentation(result, fonts),
    text = engine
      .textDocument(prepared.pdf, { includeAnnotations: false })
      .pages.flatMap((page) => page.glyphs.map((glyph) => glyph.text))
      .join("");
  assert.match(text, /PPTX_LOCAL_αβγ/);
  assert.match(text, /ULTIMO_SLIDE_INDEPENDENTE/);
  assert.doesNotMatch(text, /HIDDEN_SOURCE/);
  assert.ok(result.warnings.some((warning) => warning.includes("ocultos")));
});

test("PPTX import rejects an unsupported inherited gradient before publishing a partial presentation", async () => {
  const bytes = new Uint8Array(
    await readFile(new URL("fixtures/presentation/unsupported-gradient.pptx", import.meta.url)),
  );
  await assert.rejects(
    () =>
      importPptx(bytes, "Complex", async () => {
        throw new Error("The unsupported shape must fail before picture decoding");
      }),
    /Preenchimento de tema.*sólido/,
  );
});

test("independently authored ODP imports editable Unicode text, native shapes, image and identity image settings", async () => {
  const bytes = new Uint8Array(
      await readFile(new URL("fixtures/presentation/independent.odp", import.meta.url)),
    ),
    document = importOdp(bytes, "Independente"),
    prepared = await preparePresentation(document, fonts);
  assert.equal(document.slides.length, 2);
  assert.equal(document.width, 720);
  assert.equal(document.height, 405);
  assert.ok(
    document.slides[0]?.elements.some(
      (element) => element.kind === "shape" && element.fill === "#4f81bd",
    ),
  );
  assert.equal(
    document.slides[0]?.elements.filter((element) => element.kind === "image").length,
    1,
  );
  const text = engine
    .textDocument(prepared.pdf, { includeAnnotations: false })
    .pages.flatMap((page) => page.glyphs.map((glyph) => glyph.text))
    .join("");
  assert.match(text, /ODP_LOCAL_αβγ/);
  assert.match(text, /ULTIMO_SLIDE_ODP_INDEPENDENTE/);
});

test("ODP refuses cropped images, skew transforms and external images before exposing a partial result", async () => {
  const source = readOpenPackage(
    new Uint8Array(
      await readFile(new URL("fixtures/presentation/independent.odp", import.meta.url)),
    ),
    "presentation",
  );
  const changed = (part: string, from: string, to: string) => {
    const parts = Object.fromEntries(source.parts),
      text = new TextDecoder().decode(parts[part]);
    assert.ok(text.includes(from));
    parts[part] = new TextEncoder().encode(text.replace(from, to));
    return writeOfficePackage(parts, { uncompressed: ["mimetype"] });
  };
  assert.throws(
    () =>
      importOdp(
        changed(
          "styles.xml",
          'draw:image-opacity="100%"',
          'draw:image-opacity="100%" fo:clip="rect(0pt 10pt 10pt 0pt)"',
        ),
        "Crop",
      ),
    /Recorte de imagem/,
  );
  assert.throws(
    () =>
      importOdp(
        changed(
          "content.xml",
          'svg:x="36pt"',
          'svg:x="36pt" draw:transform="matrix(1 0 0.5 1 0pt 0pt)"',
        ),
        "Skew",
      ),
    /skew/,
  );
  assert.throws(
    () =>
      importOdp(
        changed(
          "content.xml",
          'xlink:href="Pictures/red.png"',
          'xlink:href="https://example.invalid/image.png"',
        ),
        "External",
      ),
    /extern|recurso|caminho/i,
  );
});

test("editable presentation flow carries overflowing text and images onto more slides without dropping the last line", async () => {
  const text = `${"Conteúdo completo αβγ. ".repeat(100)}FIM_DO_FLUXO`;
  const flow = await officeFlowPresentation(
    {
      title: "Fluxo",
      warnings: [],
      pages: [
        {
          width: 360,
          height: 240,
          margins: { top: 20, bottom: 20, left: 20, right: 20 },
          blocks: [
            { kind: "paragraph", align: "left", runs: [{ text, size: 18 }] },
            {
              kind: "image",
              bytes: picture,
              format: "png",
              width: 200,
              height: 400,
              alt: "imagem",
            },
          ],
        },
      ],
    },
    fonts,
  );
  assert.ok(flow.slides.length > 2);
  assert.equal(
    flow.slides.flatMap((slide) => slide.elements).filter((element) => element.kind === "image")
      .length,
    1,
  );
  assert.equal(
    flow.slides
      .flatMap((slide) => slide.elements)
      .flatMap((element) =>
        element.kind === "text"
          ? element.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.text))
          : [],
      )
      .join(""),
    text,
  );
  const prepared = await preparePresentation(flow, fonts),
    output = await exportPptx(prepared),
    restored = await importPptx(output.bytes, "Fluxo", async () => {
      throw new Error("No crop");
    });
  assert.equal(restored.slides.length, flow.slides.length);
  assert.match(
    new TextDecoder().decode(
      officePart(readOfficePackage(output.bytes), `ppt/slides/slide${flow.slides.length - 1}.xml`),
    ),
    /FIM_DO_FLUXO/,
  );
  assert.ok(output.warnings.some((warning) => warning.includes("por fluxo")));
});

test("ODP page inherits its master's background and a local solid fill overrides that background", async () => {
  const source = readOpenPackage(
      new Uint8Array(
        await readFile(new URL("fixtures/presentation/independent.odp", import.meta.url)),
      ),
      "presentation",
    ),
    parts = Object.fromEntries(source.parts),
    encoder = new TextEncoder();
  let styles = new TextDecoder().decode(parts["styles.xml"]);
  assert.ok(styles.includes('<style:master-page style:name="LocalMaster"'));
  styles = styles
    .replace(
      '<style:master-page style:name="LocalMaster"',
      '<style:master-page draw:style-name="MasterBackground" style:name="LocalMaster"',
    )
    .replace(
      "</office:styles>",
      '<style:style style:name="MasterBackground" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#182a45"/></style:style><style:style style:name="LocalBackground" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#eeeeff"/></style:style></office:styles>',
    );
  parts["styles.xml"] = encoder.encode(styles);
  let document = importOdp(writeOfficePackage(parts, { uncompressed: ["mimetype"] }), "Background");
  assert.equal(document.slides[0]?.background, "#182a45");
  parts["content.xml"] = encoder.encode(
    new TextDecoder()
      .decode(parts["content.xml"])
      .replace(
        '<draw:page draw:name="Primeiro"',
        '<draw:page draw:style-name="LocalBackground" draw:name="Primeiro"',
      ),
  );
  document = importOdp(writeOfficePackage(parts, { uncompressed: ["mimetype"] }), "Override");
  assert.equal(document.slides[0]?.background, "#eeeeff");
  assert.equal(document.slides[1]?.background, "#182a45");
});
