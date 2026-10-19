import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { degrees, PDFDocument } from "pdf-lib";
import { buildPdf } from "../src/shared/build.ts";
import { contentSchema } from "../src/shared/document-format.ts";
import type { DocContent, PageNumbers, Watermark } from "../src/shared/model.ts";
import {
  compilePageNumbers,
  formatDecorationNumber,
  pageNumbersSchema,
  watermarkPosition,
  watermarkSchema,
} from "../src/shared/page-decorations.ts";

const font = new Uint8Array(
  await readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url)),
);
const bold = new Uint8Array(
  await readFile(new URL("../resources/fonts/NotoSans-Bold.ttf", import.meta.url)),
);
const numbers: PageNumbers = {
  format: "DOC-{n}",
  position: "bottom-right",
  size: 10,
  color: "#333333",
  start: 1,
  padding: 3,
  countMode: "applied",
  scope: { except: ["cover"] },
  marginX: 12,
  marginY: 15,
  additional: [{ format: "REVISÃO α · folha {page}/{pages}", position: "top-left" }],
  writePageLabels: true,
};
const watermark: Watermark = {
  text: "MARCA α",
  size: 80,
  color: "#cc0000",
  opacity: 0.3,
  angle: 45,
  position: "bottom-left",
  marginX: 12,
  marginY: 15,
  fit: true,
  scope: { pages: ["second", "third"] },
};
const content = (): DocContent => ({
  pages: ["cover", "second", "third", "fourth"].map((id, index) => ({
    id,
    src: "source",
    index,
    rotation: 0,
  })),
  annots: [],
  forms: {},
  watermark,
  pageNumbers: numbers,
  meta: {},
});

test("decoration budgets reject excessive repetition, expanded counters and control characters before changing the source", async () => {
  const pages = Array.from({ length: 600 }, (_, index) => ({ id: `p-${index}` }));
  assert.throws(
    () =>
      compilePageNumbers(pages, {
        ...numbers,
        scope: undefined,
        additional: [],
        format: "x".repeat(9000),
      }),
    /Reduza os intervalos/,
  );
  assert.throws(
    () =>
      compilePageNumbers(pages.slice(0, 1), {
        ...numbers,
        scope: undefined,
        additional: [],
        padding: 12,
        format: "{n}".repeat(3000),
      }),
    /10.000/,
  );
  assert.equal(
    watermarkSchema.safeParse({ ...watermark, text: "Different\tgeometry" }).success,
    false,
  );
  const source = await PDFDocument.create();
  source.addPage();
  const bytes = await source.save(),
    original = bytes.slice(),
    state = content();
  await assert.rejects(
    () =>
      buildPdf({
        primary: "source",
        sources: { source: bytes },
        content: {
          ...state,
          pages: [state.pages[0]],
          pageNumbers: null,
          watermark: { ...watermark, scope: undefined, text: "x".repeat(10001) },
        },
      }),
    /10.000/,
  );
  assert.deepEqual(bytes, original);
});

test("decoration schemas retain optional advanced settings and legacy documents still use their original sequence", () => {
  const original = content();
  assert.deepEqual(contentSchema.parse(JSON.parse(JSON.stringify(original))), original);
  const legacy: PageNumbers = {
    format: "Página {n} de {total}",
    position: "bottom-center",
    start: 5,
    size: 10,
    color: "#333",
  };
  assert.deepEqual(
    [...compilePageNumbers(original.pages, legacy).values()].map((page) => page.label),
    ["Página 5 de 8", "Página 6 de 8", "Página 7 de 8", "Página 8 de 8"],
  );
  assert.equal(
    pageNumbersSchema.safeParse({
      ...numbers,
      additional: [{ format: "Other", position: "bottom-right" }],
    }).success,
    false,
  );
});

test("numbering excludes covers by page identity and recomputes applied sequence after reordering", () => {
  const pages = content().pages;
  const plan = compilePageNumbers([pages[0], pages[2], pages[1], pages[3]], numbers);
  assert.equal(plan.has("cover"), false);
  assert.equal(plan.get("third")?.label, "DOC-001");
  assert.equal(plan.get("second")?.label, "DOC-002");
  assert.equal(plan.get("third")?.entries[1].text, "REVISÃO α · folha 2/4");
  assert.equal(formatDecorationNumber(49, "roman-upper"), "XLIX");
  assert.equal(formatDecorationNumber(3999, "roman-lower"), "mmmcmxcix");
  assert.equal(formatDecorationNumber(27, "letters-upper"), "AA");
  assert.equal(formatDecorationNumber(-12, "decimal", 4), "-0012");
  assert.throws(() => formatDecorationNumber(0, "roman-upper"), /1 a 3999/);
  assert.throws(() => formatDecorationNumber(0, "letters-lower"), /1 a um milhão/);
});

test("fitted angled watermarks stay inside requested margins at every orthogonal/diagonal angle", () => {
  for (const angle of [-90, -45, 0, 45, 90, 180]) {
    const settings = { ...watermark, angle, size: 100 },
      placed = watermarkPosition(280, 360, 900, settings, { ascent: 106.9, descent: 29.3 });
    const ratio = placed.size / settings.size,
      width = 900 * ratio,
      ascent = 106.9 * ratio,
      descent = 29.3 * ratio;
    const radians = (angle * Math.PI) / 180;
    const points = [
      [0, descent],
      [width, descent],
      [0, -ascent],
      [width, -ascent],
    ].map(([x, y]) => ({
      x: placed.x + Math.cos(radians) * x + Math.sin(radians) * y,
      y: placed.y - Math.sin(radians) * x + Math.cos(radians) * y,
    }));
    assert.ok(
      points.every(
        (point) =>
          point.x >= 12 - 1e-6 &&
          point.x <= 268 + 1e-6 &&
          point.y >= 15 - 1e-6 &&
          point.y <= 345 + 1e-6,
      ),
    );
    assert.ok(placed.size > 0 && placed.size <= 100);
  }
  assert.doesNotThrow(() =>
    watermarkPosition(20, 20, 100, {
      text: "Legacy",
      size: 64,
      color: "#000",
      opacity: 1,
      angle: 0,
    }),
  );
  assert.throws(() => watermarkPosition(20, 20, 100, watermark), /área útil/);
});

test("saved scoped watermarks, multiple headers/footers and navigation labels survive rotations and nonzero crop origins", async () => {
  const source = await PDFDocument.create();
  for (const [index, rotation] of [0, 90, 180, 270].entries()) {
    const page = source.addPage([400, 500]);
    page.setCropBox(20, 40, 360, 420);
    page.setRotation(degrees(rotation));
    page.drawText(`BODY_${index + 1}`, { x: 60, y: 200, size: 12 });
  }
  const original = await source.save();
  const bytes = await buildPdf({
    content: content(),
    primary: "source",
    sources: { source: original },
    fonts: { regular: font, bold, italic: font, boldItalic: bold },
  });
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const reader = await task.promise;
    assert.deepEqual(await reader.getPageLabels(), ["1", "DOC-001", "DOC-002", "DOC-003"]);
    for (let index = 0; index < 4; index++) {
      const page = await reader.getPage(index + 1),
        text = await page.getTextContent();
      const value = text.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      assert.match(value, new RegExp(`BODY_${index + 1}`));
      if (!index) assert.doesNotMatch(value, /DOC-|REVISÃO|MARCA/);
      else {
        assert.match(value, new RegExp(`DOC-00${index}`));
        assert.match(value, /REVISÃO α/);
        if (index < 3) assert.match(value, /MARCA α/);
        else assert.doesNotMatch(value, /MARCA/);
      }
    }
  } finally {
    await task.destroy();
  }
  const reopened = await PDFDocument.load(bytes);
  assert.deepEqual(
    reopened.getPages().map((page) => page.getCropBox()),
    source.getPages().map((page) => page.getCropBox()),
  );
  assert.deepEqual(
    reopened.getPages().map((page) => page.getRotation().angle),
    [0, 90, 180, 270],
  );
});
