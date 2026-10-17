import { describe, expect, it } from "vitest";
import {
  countWord,
  describeThing,
  eveningSentence,
  joinWords,
  routineSummary,
  tomorrowSentence,
} from "./routine-summary";

describe("routineSummary", () => {
  it("says the day in one line, with what tomorrow asks by name", () => {
    expect(
      routineSummary({
        forToday: 4,
        late: 1,
        tomorrow: ["material de Ciências", "natação"],
        doneToday: 0,
      }),
    ).toBe(
      "Três coisas para hoje e uma que passou do prazo. Amanhã tem material de Ciências e natação.",
    );
    expect(
      routineSummary({ forToday: 1, late: 0, tomorrow: ["prova de Inglês"], doneToday: 0 }),
    ).toBe("Uma coisa para hoje. Amanhã tem prova de Inglês.");
  });

  it("does not invent work when everything is late", () => {
    expect(routineSummary({ forToday: 2, late: 2, tomorrow: [], doneToday: 0 })).toBe(
      "Duas passaram do prazo. Amanhã está livre por enquanto.",
    );
  });

  it("tells a closed day from an empty one", () => {
    expect(routineSummary({ forToday: 0, late: 0, tomorrow: ["a", "b", "c"], doneToday: 2 })).toBe(
      "Tudo de hoje está feito. Amanhã tem três coisas.",
    );
    expect(routineSummary({ forToday: 0, late: 0, tomorrow: [], doneToday: 0 })).toBe(
      "Nada para hoje. Amanhã está livre por enquanto.",
    );
  });

  it("falls back to digits past ten", () => {
    expect(countWord(12)).toBe("12");
    expect(routineSummary({ forToday: 12, late: 0, tomorrow: [], doneToday: 0 })).toBe(
      "12 coisas para hoje. Amanhã está livre por enquanto.",
    );
  });
});

describe("the words of the page", () => {
  it("names a thing by type and subject, or by its title", () => {
    expect(describeThing({ type: "material", title: "Levar cola", subjectName: "Ciências" })).toBe(
      "material de Ciências",
    );
    expect(describeThing({ type: "event", title: "Passeio ao museu", subjectName: null })).toBe(
      "passeio ao museu",
    );
  });

  it("joins and counts tomorrow without repeating", () => {
    expect(joinWords(["a", "b", "c"])).toBe("a, b e c");
    expect(tomorrowSentence(["natação", "natação"])).toBe("Amanhã tem natação.");
  });

  it("says the evening line", () => {
    expect(eveningSentence({ tomorrowLabel: "Terça, 20", openToday: 1 })).toBe(
      "Terça, 20. Falta uma coisa de hoje.",
    );
    expect(eveningSentence({ tomorrowLabel: "Terça, 20", openToday: 0 })).toBe(
      "Terça, 20. Hoje está tudo em dia.",
    );
  });
});
