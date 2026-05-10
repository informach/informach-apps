import { describe, expect, it } from "vitest";
import { formatGrade, formatTurmaLabel, formatTurmaShort } from "./utils";

describe("formatGrade", () => {
  it("renders 1ano as 1º ano", () => {
    expect(formatGrade("1ano")).toBe("1º ano");
  });
  it("renders 9ano as 9º ano", () => {
    expect(formatGrade("9ano")).toBe("9º ano");
  });
});

describe("formatTurmaShort", () => {
  it("combines grade and class letter", () => {
    expect(formatTurmaShort({ grade: "5ano", classLetter: "A" })).toBe("5º ano A");
  });
});

describe("formatTurmaLabel", () => {
  it("appends the school name with em-dash", () => {
    expect(formatTurmaLabel({ grade: "3ano", classLetter: "B", schoolName: "Escola Teste" })).toBe(
      "3º ano B — Escola Teste",
    );
  });
});
