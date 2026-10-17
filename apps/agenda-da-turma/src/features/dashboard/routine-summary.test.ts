import { describe, expect, it } from "vitest";
import { countWord, routineSummary } from "./routine-summary";

describe("routineSummary", () => {
  it("says the day in one line", () => {
    expect(routineSummary({ forToday: 4, late: 1, tomorrow: 2, doneToday: 0 })).toBe(
      "Três coisas para hoje e uma passou do prazo. Amanhã, duas.",
    );
    expect(routineSummary({ forToday: 1, late: 0, tomorrow: 1, doneToday: 0 })).toBe(
      "Uma coisa para hoje. Amanhã, uma.",
    );
  });

  it("does not invent work when everything is late", () => {
    expect(routineSummary({ forToday: 2, late: 2, tomorrow: 0, doneToday: 0 })).toBe(
      "Duas passaram do prazo. Amanhã está livre por enquanto.",
    );
  });

  it("tells a closed day from an empty one", () => {
    expect(routineSummary({ forToday: 0, late: 0, tomorrow: 3, doneToday: 2 })).toBe(
      "Tudo de hoje está feito. Amanhã, três.",
    );
    expect(routineSummary({ forToday: 0, late: 0, tomorrow: 0, doneToday: 0 })).toBe(
      "Nada para hoje. Amanhã está livre por enquanto.",
    );
  });

  it("falls back to digits past ten", () => {
    expect(countWord(12)).toBe("12");
    expect(routineSummary({ forToday: 12, late: 0, tomorrow: 11, doneToday: 0 })).toBe(
      "12 coisas para hoje. Amanhã, 11.",
    );
  });
});
