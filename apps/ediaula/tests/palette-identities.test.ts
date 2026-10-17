import assert from "node:assert/strict";
import { test } from "node:test";
import { EDIAULA_PALETTE, identifyPaletteColors } from "../src/shared/palettes.ts";

test("palette identity survives color edits, reorder and serialization", () => {
  const identified = identifyPaletteColors(structuredClone(EDIAULA_PALETTE));
  assert.ok(identified.colors.every((color) => color.id));
  const first = identified.colors[0];
  const edited = {
    ...identified,
    colors: [...identified.colors.slice(1), { ...first, name: "Edited", hex: "#112233" }],
  };
  const saved = identifyPaletteColors(JSON.parse(JSON.stringify(edited)));
  assert.equal(saved.colors.at(-1)?.id, first.id);
  assert.equal(new Set(saved.colors.map((color) => color.id)).size, saved.colors.length);
});
