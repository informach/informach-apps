import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SEARCH_OPTIONS, findTextMatches } from "../src/shared/text-search.ts";

const glyphs = (text: string) =>
  [...text].map((text, index) => ({
    text,
    box: { x: index * 10, y: 20, w: text === "i" ? 2 : 12, h: 15 },
  }));
test("search maps composed accents and unequal glyph widths to their original boxes", () => {
  const input = glyphs("Ação iii WWW");
  const result = findTextMatches(input, "acao");
  assert.equal(result.length, 1);
  assert.deepEqual(
    result[0].rects,
    input.slice(0, 4).map((glyph) => glyph.box),
  );
  assert.equal(
    findTextMatches(input, "acao", { ...DEFAULT_SEARCH_OPTIONS, accents: true }).length,
    0,
  );
  assert.equal(
    findTextMatches(input, "Ação", { ...DEFAULT_SEARCH_OPTIONS, accents: true }).length,
    1,
  );
  const narrow = findTextMatches(input, "iii")[0],
    wide = findTextMatches(input, "WWW")[0];
  assert.ok(narrow.rects.every((box) => box.w === 2));
  assert.ok(wide.rects.every((box) => box.w === 12));
});
test("search handles phrases across line breaks, case, whole words and surrogate pairs", () => {
  const input = glyphs("GUIA\r\nrápido, guias 😀fim");
  assert.equal(findTextMatches(input, "guia rapido").length, 1);
  assert.equal(
    findTextMatches(input, "guia rapido", { ...DEFAULT_SEARCH_OPTIONS, acrossLines: false }).length,
    0,
  );
  assert.equal(
    findTextMatches(input, "guia", { ...DEFAULT_SEARCH_OPTIONS, wholeWord: true }).length,
    1,
  );
  assert.equal(
    findTextMatches(input, "guia", {
      ...DEFAULT_SEARCH_OPTIONS,
      caseSensitive: true,
      wholeWord: true,
    }).length,
    0,
  );
  const emoji = findTextMatches(input, "😀fim")[0];
  assert.equal(emoji.rects.length, 4);
  assert.equal(emoji.end - emoji.start, 4);
});
