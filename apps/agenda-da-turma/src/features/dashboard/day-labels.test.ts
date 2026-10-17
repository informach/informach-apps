import { describe, expect, it } from "vitest";
import {
  dayDistance,
  dayMonthLabel,
  daysBetweenIso,
  formatClockTime,
  longDayLabel,
  nextSchoolDayIso,
  relativeDayLabel,
  shortDayLabel,
  weekdayLong,
  weekdayShort,
  weekRangeLabel,
} from "./day-labels";

// Segunda-feira, 19 de outubro de 2026.
const monday = "2026-10-19";

describe("day labels", () => {
  it("names the weekday", () => {
    expect(weekdayShort("2026-10-22")).toBe("qui");
    expect(weekdayLong("2026-10-22")).toBe("Quinta");
    expect(weekdayShort("2026-10-25")).toBe("dom");
  });

  it("keeps list dates short near today and adds the month when it changes", () => {
    expect(shortDayLabel("2026-10-22", monday)).toBe("qui, 22");
    expect(shortDayLabel("2026-11-05", monday)).toBe("qui, 5 nov");
    expect(shortDayLabel("2027-01-04", monday)).toBe("seg, 4 jan 2027");
    // Mesmo mês, mas longe demais para o número sozinho bastar.
    expect(shortDayLabel("2026-10-30", "2026-10-01")).toBe("sex, 30 out");
  });

  it("writes the long form used by the detail", () => {
    expect(longDayLabel("2026-10-22", monday)).toBe("Quinta, 22 de outubro");
    expect(longDayLabel("2027-02-01", monday)).toBe("Segunda, 1 de fevereiro de 2027");
    expect(dayMonthLabel("2026-10-22", monday)).toBe("22 de outubro");
  });

  it("speaks relatively around today", () => {
    expect(relativeDayLabel(monday, monday)).toBe("Hoje");
    expect(relativeDayLabel("2026-10-20", monday)).toBe("Amanhã");
    expect(relativeDayLabel("2026-10-18", monday)).toBe("Ontem");
    expect(relativeDayLabel("2026-10-22", monday)).toBe("Quinta");
    expect(relativeDayLabel("2026-10-30", monday)).toBe("sex, 30");
  });

  it("measures distance in calendar days, not hours", () => {
    expect(daysBetweenIso(monday, "2026-10-22")).toBe(3);
    expect(daysBetweenIso(monday, "2026-10-16")).toBe(-3);
    // Atravessa o fim do horário de verão sem perder um dia.
    expect(daysBetweenIso("2026-02-20", "2026-02-23")).toBe(3);
    expect(dayDistance("2026-10-16", monday)).toBe("late");
    expect(dayDistance(monday, monday)).toBe("today");
    expect(dayDistance("2026-10-20", monday)).toBe("tomorrow");
    expect(dayDistance("2026-10-21", monday)).toBe("later");
  });

  it("finds the next school day over the weekend", () => {
    expect(nextSchoolDayIso(monday)).toBe("2026-10-20");
    // Sexta: a próxima aula é segunda.
    expect(nextSchoolDayIso("2026-10-23")).toBe("2026-10-26");
    // Sábado e domingo também apontam para segunda.
    expect(nextSchoolDayIso("2026-10-24")).toBe("2026-10-26");
    expect(nextSchoolDayIso("2026-10-25")).toBe("2026-10-26");
  });

  it("formats the time without zeros", () => {
    expect(formatClockTime("08:00")).toBe("8h");
    expect(formatClockTime("14:30")).toBe("14h30");
  });

  it("titles a week across months", () => {
    expect(weekRangeLabel("2026-10-19", "2026-10-25")).toBe("19 a 25 de outubro");
    expect(weekRangeLabel("2026-10-29", "2026-11-04")).toBe("29 de outubro a 4 de novembro");
  });
});
