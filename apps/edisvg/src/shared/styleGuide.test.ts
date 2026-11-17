import assert from "node:assert/strict";
import { test } from "node:test";
import { isKitBoardName } from "./designKit";
import {
  GUIDE_TEXT_MAX,
  STYLE_GUIDES,
  styleGuideById,
  styleGuideKit,
  styleGuideText,
  ZERO_KIDS,
} from "./styleGuide";

test("the Zero Kids guide is found by id, with its fonts and the text palette in the recipes' order", () => {
  assert.equal(styleGuideById("zero-kids"), ZERO_KIDS);
  assert.equal(styleGuideById("nope"), undefined);
  assert.equal(styleGuideById(null), undefined);
  assert.deepEqual(ZERO_KIDS.fonts, { title: "Baloo 2", body: "Nunito" });
  // The lightest first (the balloon's fill), the darkest next (the outline), the accent last.
  assert.equal(ZERO_KIDS.textPalette[0], "#FFFFFF");
  assert.equal(ZERO_KIDS.textPalette[1], "#0F1A33");
  assert.equal(ZERO_KIDS.textPalette.at(-1), "#FFC02E");
  for (const guide of STYLE_GUIDES)
    for (const color of guide.palette) assert.match(color.hex, /^#[0-9A-F]{6}$/);
});

test("the guide's text names the colours by role, the fonts and the rules, within the limit", () => {
  const text = styleGuideText(ZERO_KIDS);
  assert.ok(text.length <= GUIDE_TEXT_MAX, `${text.length} chars`);
  assert.ok(text.startsWith("# Guia de estilo: Zero Kids · Kit de slides"));
  assert.match(text, /#0B7A54 Verde reação/);
  assert.match(text, /Baloo 2 \(títulos/);
  assert.match(text, /## Caixas de significado/);
  assert.match(text, /Pegue! — amarela #FFC02E/);
  assert.match(text, /## Regras de ouro/);
  assert.match(text, /x ≥ 880/);
  assert.match(text, /prefira as peças dele/);
});

test("the guide is also a design kit: a palette sheet, the boxes, cards, labels and backgrounds", () => {
  const kit = styleGuideKit(ZERO_KIDS);
  assert.equal(kit.name, ZERO_KIDS.name);
  assert.deepEqual(kit.left, []);
  const paths = kit.files.map((f) => f.path);
  assert.ok(paths.includes("paleta.svg"));
  for (const path of [
    "caixas/Ação.svg",
    "caixas/Reação.svg",
    "caixas/Pegue.svg",
    "caixas/Próxima.svg",
  ])
    assert.ok(paths.includes(path), path);
  assert.ok(paths.includes("cards/Card de objetivo.svg"));
  assert.ok(paths.includes("fundos/Fundo claro.svg"));
  for (const file of kit.files) {
    assert.ok("svg" in file, file.path);
    assert.match(
      file.svg,
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+"/,
    );
    assert.ok(!file.svg.includes("<image"), "the kit draws everything as vectors");
  }
  // Every text of the kit is in one of the guide's fonts, so the import embeds them.
  const texts = kit.files.flatMap((f) =>
    "svg" in f ? (f.svg.match(/font-family="[^"]+"/g) ?? []) : [],
  );
  assert.ok(texts.length > 10);
  for (const t of texts)
    assert.ok(t === 'font-family="Baloo 2"' || t === 'font-family="Nunito"', t);
  // The sheet names every colour of the palette before its hex, as sheetColors reads it.
  const sheet = kit.files.find((f) => f.path === "paleta.svg");
  assert.ok(sheet && "svg" in sheet);
  for (const color of ZERO_KIDS.palette) assert.ok(sheet.svg.includes(`>${color.hex}<`), color.hex);
  // The artboards' names start with the kit prefix (designKitImport.kitBoardName).
  assert.ok(isKitBoardName("Kit · caixas · Ação"));
});
