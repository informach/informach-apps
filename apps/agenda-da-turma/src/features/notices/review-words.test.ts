import { describe, expect, it } from "vitest";
import {
  countedNoun,
  firstDueSentence,
  pluralNoun,
  remindersSentence,
  singularNoun,
} from "./review-words";

describe("the words of the notice review", () => {
  it("names what was found by its type when all share one", () => {
    expect(countedNoun(["exam", "exam", "exam", "exam"])).toBe("4 provas");
    expect(countedNoun(["exam"])).toBe("1 prova");
    expect(countedNoun(["exam", "task", "material"])).toBe("3 atividades");
    expect(countedNoun(["material", "material"])).toBe("2 materiais");
    expect(singularNoun(["exam", "exam"])).toBe("prova");
    expect(pluralNoun(["exam", "task"])).toBe("atividades");
  });

  it("says when the first one is, near or far", () => {
    expect(firstDueSentence(4, "2026-10-22", "2026-10-19")).toBe("A primeira é quinta, 22.");
    expect(firstDueSentence(1, "2026-10-22", "2026-10-19")).toBe("É para quinta, 22.");
    expect(firstDueSentence(3, "2026-10-22", "2026-10-19", ["project", "project"])).toBe(
      "O primeiro é quinta, 22.",
    );
    expect(firstDueSentence(2, "2026-11-26", "2026-10-19")).toBe(
      "A primeira é quinta, 26 de novembro.",
    );
  });

  it("describes reminders that follow one rule, and falls back when they do not", () => {
    const now = new Date("2026-10-19T12:00:00-03:00");
    const exams = [
      { type: "exam", dueAt: "2026-10-22", reminderAt: "2026-10-20T19:00:00-03:00" },
      { type: "exam", dueAt: "2026-10-27", reminderAt: "2026-10-25T19:00:00-03:00" },
    ];
    expect(remindersSentence(exams, now)).toBe(
      "Os lembretes chegam dois dias antes de cada prova, às 19h.",
    );
    expect(remindersSentence([exams[0] as (typeof exams)[number]], now)).toBe(
      "O lembrete chega dois dias antes, às 19h.",
    );
    expect(
      remindersSentence(
        [...exams, { type: "task", dueAt: "2026-10-23", reminderAt: "2026-10-22T19:00:00-03:00" }],
        now,
      ),
    ).toBe("Os lembretes chegam no horário marcado.");
  });

  it("stays quiet about reminders that already passed or do not exist", () => {
    const now = new Date("2026-10-19T12:00:00-03:00");
    expect(
      remindersSentence(
        [{ type: "exam", dueAt: "2026-10-20", reminderAt: "2026-10-18T19:00:00-03:00" }],
        now,
      ),
    ).toBe("");
    expect(remindersSentence([{ type: "exam", dueAt: "2026-10-20", reminderAt: null }], now)).toBe(
      "",
    );
  });
});
