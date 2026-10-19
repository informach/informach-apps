import assert from "node:assert/strict";
import { test } from "node:test";
import { annotationSchema } from "./document.ts";
import { ocrLines, searchableText, visibleText } from "./ocr.ts";

const word = (text: string, line: number, x0: number, y0: number, width = 40) => ({
  text,
  confidence: 90,
  x0,
  y0,
  x1: x0 + width,
  y1: y0 + 20,
  line,
});
const result = {
  width: 400,
  height: 300,
  confidence: 90,
  words: [
    word("segunda", 1, 10, 100),
    word("linha", 1, 60, 100),
    word("Primeira", 0, 10, 10),
    word("CPF", 2, 10, 200),
    word("123.456.789-09", 2, 60, 200, 120),
    word("  ", 3, 10, 260),
  ],
};

test("linhas seguem a ordem de leitura e aplicam correções sem perder o lido", () => {
  const lines = ocrLines({ result, edits: { "1": "segunda linha corrigida" } });
  assert.deepEqual(
    lines.map((line) => [line.line, line.text, line.edited]),
    [
      [0, "Primeira", false],
      [1, "segunda linha corrigida", true],
      [2, "CPF 123.456.789-09", false],
    ],
  );
  assert.equal(lines[1]?.read, "segunda linha");
  assert.deepEqual(lines[2]?.box, { x0: 10, y0: 200, x1: 180, y1: 220 });
  assert.equal(searchableText({ result, edits: { "0": "" } }), "segunda linha\nCPF 123.456.789-09");
});

test("texto sob máscara, pixelização ou fora do recorte não sai com a imagem", () => {
  const lines = ocrLines({ result, edits: {} });
  const mask = annotationSchema.parse({ kind: "redact", x: 70, y: 195, x2: 170, y2: 222 });
  const covered = visibleText(lines, { annotations: [mask], crop: null });
  assert.equal(covered.text, "Primeira\nsegunda linha");
  assert.equal(covered.hidden, 1);
  const blur = annotationSchema.parse({ kind: "blur", x: 0, y: 0, x2: 30, y2: 30 });
  assert.equal(
    visibleText(lines, { annotations: [blur], crop: null }).text,
    "segunda linha\nCPF 123.456.789-09",
  );
  const cropped = visibleText(lines, {
    annotations: [],
    crop: { x: 0, y: 0, width: 400, height: 150 },
  });
  assert.equal(cropped.text, "Primeira\nsegunda linha");
  const arrow = annotationSchema.parse({ kind: "arrow", x: 0, y: 0, x2: 400, y2: 300 });
  assert.equal(visibleText(lines, { annotations: [arrow], crop: null }).hidden, 0);
});

test("máscara girada esconde tudo o que os cantos girados cobrem", () => {
  const lines = ocrLines({ result, edits: {} });
  // A thin mask beside the CPF line, turned 90°: upright it misses the line, turned it covers it.
  const turned = annotationSchema.parse({
    kind: "redact",
    x: 190,
    y: 160,
    x2: 200,
    y2: 260,
    rotation: 90,
  });
  const upright = annotationSchema.parse({ kind: "redact", x: 190, y: 160, x2: 200, y2: 260 });
  assert.equal(visibleText(lines, { annotations: [upright], crop: null }).hidden, 0);
  assert.equal(visibleText(lines, { annotations: [turned], crop: null }).hidden, 1);
});
