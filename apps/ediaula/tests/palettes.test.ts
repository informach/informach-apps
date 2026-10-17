import assert from "node:assert/strict";
import { test } from "node:test";
import { ANNOTATION_PRESETS, outlineStyle } from "../src/shared/annotation.ts";
import {
  colorMapper,
  EDIAULA_PALETTE,
  inPalette,
  paletteSwatches,
  recolorAnnotation,
  recolorTransform,
  refont,
  SISTEMA_ZERO_PALETTE,
  textOn,
  themeFontSet,
} from "../src/shared/palettes.ts";
import { templateById, templateLayers } from "../src/shared/templates.ts";

const preset = (kind: string) => ANNOTATION_PRESETS.find((p) => p.kind === kind)!.spec;

test("new annotations come in the colors of the project palette, role by role", () => {
  assert.equal(inPalette(preset("note"), SISTEMA_ZERO_PALETTE).color, "#FFC02E");
  assert.equal(inPalette(preset("arrow"), SISTEMA_ZERO_PALETTE).color, "#D92D34");
  assert.equal(inPalette(preset("balloon"), SISTEMA_ZERO_PALETTE).color, "#121A30");
  assert.equal(inPalette(preset("note"), SISTEMA_ZERO_PALETTE).ink, "#0F1A33");
  // EdiAula's own palette leaves presets untouched.
  assert.deepEqual(inPalette(preset("note"), EDIAULA_PALETTE), preset("note"));
});

test("switching palettes recolors by role and keeps colors picked by hand", () => {
  const map = colorMapper([EDIAULA_PALETTE], SISTEMA_ZERO_PALETTE);
  const a = recolorAnnotation(
    {
      kind: "highlight",
      color: "#FF4D4D",
      fill: "#123456",
      outline: { color: "#FF4D4D", width: 8, dash: true },
      shadow: { distance: 0, angle: 0, blur: 40, opacity: 0.9, color: "#C8F031" },
    },
    map,
    SISTEMA_ZERO_PALETTE,
  );
  assert.equal(a.color, "#D92D34");
  assert.equal(a.outline?.color, "#D92D34");
  assert.equal(a.outline?.dash, true);
  assert.equal(a.fill, "#123456", "a color outside the palette stays");
  assert.equal(a.shadow?.color, "#FFC02E");
  const back = colorMapper([SISTEMA_ZERO_PALETTE], EDIAULA_PALETTE);
  assert.equal(recolorAnnotation(a, back, EDIAULA_PALETTE).color, "#FF4D4D", "and back again");
  const t = recolorTransform({ x: 0.5, y: 0.5, scale: 1, opacity: 1, border: "#c8f031" }, map);
  assert.equal(t.border, "#FFC02E");
});

test("swatches list each color once; text on a color uses the palette ink or light", () => {
  const hexes = paletteSwatches(SISTEMA_ZERO_PALETTE).map((c) => c.hex);
  assert.equal(new Set(hexes).size, hexes.length);
  assert.ok(hexes.includes("#FFC02E") && hexes.includes("#121A30"));
  assert.equal(textOn("#FFC02E", SISTEMA_ZERO_PALETTE), "#0F1A33");
  assert.equal(textOn("#1B5CF3", SISTEMA_ZERO_PALETTE), "#FFFFFF");
});

test("theme fonts: titles and text get the theme typefaces; fonts picked by hand stay", () => {
  const themed = themeFontSet([EDIAULA_PALETTE, SISTEMA_ZERO_PALETTE]);
  assert.equal(
    refont({ kind: "title", color: "#FFFFFF", text: "Oi" }, SISTEMA_ZERO_PALETTE, themed)
      .fontFamily,
    "Baloo 2",
  );
  assert.equal(
    refont({ kind: "note", color: "#FFC02E", text: "Dica" }, SISTEMA_ZERO_PALETTE, themed)
      .fontFamily,
    "Nunito",
  );
  assert.equal(
    refont({ kind: "arrow", color: "#FF4D4D" }, SISTEMA_ZERO_PALETTE, themed).fontFamily,
    undefined,
    "no text, no font",
  );
  assert.equal(
    refont({ kind: "note", color: "#FFC02E", fontFamily: "Bangers" }, SISTEMA_ZERO_PALETTE, themed)
      .fontFamily,
    "Bangers",
    "hand-picked font stays",
  );
  // Turning the theme fonts off goes back to the default typeface.
  assert.equal(
    "fontFamily" in refont({ kind: "note", color: "#FFC02E", fontFamily: "Nunito" }, null, themed),
    false,
  );
});

test("templates use the theme fonts by role unless the template has its own font", () => {
  const fonts = SISTEMA_ZERO_PALETTE.fonts;
  const layers = templateLayers(
    templateById("question")!,
    { question: "Qual?", options: "A" },
    SISTEMA_ZERO_PALETTE.roles,
    fonts,
  );
  assert.equal(layers.find((l) => l.spec.kind === "title")!.spec.fontFamily, "Baloo 2");
  assert.equal(layers.find((l) => l.spec.kind === "note")!.spec.fontFamily, "Nunito");
  const own = templateLayers(
    templateById("question")!,
    { question: "Qual?", options: "A", font: "Fredoka" },
    SISTEMA_ZERO_PALETTE.roles,
    fonts,
  );
  assert.ok(
    own.filter((l) => l.spec.kind !== "panel").every((l) => l.spec.fontFamily === "Fredoka"),
  );
});

test("outline styles: none, solid, dashed (old `dash: true` too) and dotted", () => {
  assert.equal(outlineStyle({ color: "#FFFFFF", width: 0, dash: "dotted" }), "none");
  assert.equal(outlineStyle({ color: "#FFFFFF", width: 4 }), "solid");
  assert.equal(outlineStyle({ color: "#FFFFFF", width: 4, dash: true }), "dashed");
  assert.equal(outlineStyle({ color: "#FFFFFF", width: 4, dash: "dotted" }), "dotted");
  // Lines and shapes are presets like any annotation, so they follow the palette too.
  assert.equal(inPalette(preset("line"), SISTEMA_ZERO_PALETTE).color, "#FFFFFF");
  assert.equal(inPalette(preset("panel"), SISTEMA_ZERO_PALETTE).color, "#1B5CF3");
});
