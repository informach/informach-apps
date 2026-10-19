import { describe, expect, it } from "vitest";
import { DEFAULT_SEARCH_OPTIONS, findTextMatches, ocrTextUnits, plainText } from "../src/search.ts";

const word = (text: string, x0: number, line: number) => ({
  text,
  confidence: 90,
  x0,
  y0: line * 40,
  x1: x0 + text.length * 10,
  y1: line * 40 + 20,
  line,
});

describe("findTextMatches over OCR words", () => {
  const words = [
    word("Relatório", 0, 0),
    word("de", 100, 0),
    word("Ação", 130, 0),
    word("local", 0, 1),
  ];
  const units = ocrTextUnits(words);

  it("returns the boxes of the words touched by an accent-insensitive match", () => {
    const [match] = findTextMatches(units, "de acao");
    expect(match?.rects).toEqual([
      { x0: 100, y0: 0, x1: 120, y1: 20 },
      { x0: 130, y0: 0, x1: 170, y1: 20 },
    ]);
  });

  it("crosses lines only when allowed and respects whole words", () => {
    expect(findTextMatches(units, "ação local")).toHaveLength(1);
    expect(
      findTextMatches(units, "ação local", { ...DEFAULT_SEARCH_OPTIONS, acrossLines: false }),
    ).toHaveLength(0);
    expect(
      findTextMatches(units, "rio", { ...DEFAULT_SEARCH_OPTIONS, wholeWord: true }),
    ).toHaveLength(0);
    expect(findTextMatches(units, "rio")).toHaveLength(1);
  });

  it("keeps separators without geometry out of the result boxes", () => {
    expect(plainText(units)).toBe("Relatório de Ação\nlocal");
    const [match] = findTextMatches(units, "Ação local");
    expect(match?.rects).toHaveLength(2);
  });
});
