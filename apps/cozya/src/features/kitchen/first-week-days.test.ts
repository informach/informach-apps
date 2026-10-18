import { describe, expect, it } from "vitest";
import { weekStart } from "./dates";
import { firstWeekDays } from "./first-week-days";

// Semana de 19 a 25 de outubro de 2026: segunda a domingo.
describe("os dias da primeira semana", () => {
  it("começa hoje quando os três jantares cabem na semana", () => {
    expect(firstWeekDays("2026-10-20", 3)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
    // Sexta, sábado e domingo ainda são a mesma lista.
    expect(firstWeekDays("2026-10-23", 3)).toEqual(["2026-10-23", "2026-10-24", "2026-10-25"]);
  });

  it.each([
    ["sábado", "2026-10-24", 3],
    ["domingo", "2026-10-25", 3],
    ["sexta, com quatro", "2026-10-23", 4],
  ])("começada no %s, vai para a semana seguinte e cabe numa lista só", (_, today, count) => {
    const days = firstWeekDays(today, count);
    expect(days[0]).toBe("2026-10-26");
    expect(days).toHaveLength(count);
    expect(new Set(days.map((day) => weekStart(day)))).toEqual(new Set(["2026-10-26"]));
  });

  it("cruza a virada do ano sem pular dia", () => {
    expect(firstWeekDays("2027-01-02", 3)).toEqual(["2027-01-04", "2027-01-05", "2027-01-06"]);
  });
});
