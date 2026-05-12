import { describe, expect, it } from "vitest";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import {
  buildMonthGrid,
  buildWeekDays,
  endOfMonthIso,
  endOfWeekIso,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRangeLabel,
  isValidDateIso,
  parseLocalIso,
  rangeForView,
  shiftAnchor,
  startOfMonthIso,
  startOfWeekIso,
} from "./date";

describe("todayLocalIso (São Paulo TZ-aware)", () => {
  it("returns São Paulo's wall-clock date for 21h BRT (00h UTC next day)", () => {
    // 21h BRT on 2026-05-12 == 00h UTC on 2026-05-13. The user is still
    // experiencing May 12 in São Paulo, so `todayLocalIso` must return
    // "2026-05-12", NOT "2026-05-13" (the UTC date).
    const instant = new Date("2026-05-13T00:00:00Z");
    expect(todayLocalIso(instant)).toBe("2026-05-12");
  });

  it("returns São Paulo's wall-clock date for 23h59 BRT (02h59 UTC next day)", () => {
    const instant = new Date("2026-05-13T02:59:00Z");
    expect(todayLocalIso(instant)).toBe("2026-05-12");
  });

  it("flips to next day at 03h UTC (midnight in BRT, BRT is UTC-3 in May)", () => {
    const instant = new Date("2026-05-13T03:00:00Z");
    expect(todayLocalIso(instant)).toBe("2026-05-13");
  });

  it("respects the day rollover regardless of where the server runs (UTC math)", () => {
    // Mid-afternoon BRT — no ambiguity.
    const instant = new Date("2026-05-12T18:00:00Z"); // 15h BRT
    expect(todayLocalIso(instant)).toBe("2026-05-12");
  });
});

describe("addDaysIso (pure string math)", () => {
  it("adds positive days", () => {
    expect(addDaysIso("2026-05-12", 1)).toBe("2026-05-13");
    expect(addDaysIso("2026-05-12", 7)).toBe("2026-05-19");
  });

  it("subtracts with negative days", () => {
    expect(addDaysIso("2026-05-12", -1)).toBe("2026-05-11");
    expect(addDaysIso("2026-05-12", -7)).toBe("2026-05-05");
  });

  it("crosses month boundary", () => {
    expect(addDaysIso("2026-05-31", 1)).toBe("2026-06-01");
    expect(addDaysIso("2026-06-01", -1)).toBe("2026-05-31");
  });

  it("crosses year boundary", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2027-01-01", -1)).toBe("2026-12-31");
  });
});

describe("parseLocalIso", () => {
  it("parses YYYY-MM-DD into local Date at noon", () => {
    const d = parseLocalIso("2026-05-12");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // May = index 4
    expect(d.getDate()).toBe(12);
    expect(d.getHours()).toBe(12);
  });

  it("throws on invalid ISO", () => {
    expect(() => parseLocalIso("not-a-date")).toThrow();
    expect(() => parseLocalIso("")).toThrow();
    expect(() => parseLocalIso("2026-02-30")).toThrow();
    expect(() => parseLocalIso("2026-04-31")).toThrow();
    expect(() => parseLocalIso("2025-02-29")).toThrow();
  });
});

describe("startOfMonthIso / endOfMonthIso", () => {
  it("returns first day of the anchor's month", () => {
    expect(startOfMonthIso("2026-05-12")).toBe("2026-05-01");
    expect(startOfMonthIso("2026-02-28")).toBe("2026-02-01");
  });

  it("returns last day of the anchor's month (handles 28/29/30/31)", () => {
    expect(endOfMonthIso("2026-05-12")).toBe("2026-05-31");
    expect(endOfMonthIso("2026-04-12")).toBe("2026-04-30");
    expect(endOfMonthIso("2025-02-15")).toBe("2025-02-28"); // 2025 not leap
    expect(endOfMonthIso("2024-02-15")).toBe("2024-02-29"); // 2024 leap
  });
});

describe("startOfWeekIso / endOfWeekIso (Sunday-first)", () => {
  it("returns Sunday of the anchor's week", () => {
    // 2026-05-12 is a Tuesday; Sunday before is 2026-05-10
    expect(startOfWeekIso("2026-05-12")).toBe("2026-05-10");
    // 2026-05-10 itself is a Sunday — start of week is itself
    expect(startOfWeekIso("2026-05-10")).toBe("2026-05-10");
  });

  it("returns Saturday of the anchor's week", () => {
    expect(endOfWeekIso("2026-05-12")).toBe("2026-05-16");
    expect(endOfWeekIso("2026-05-10")).toBe("2026-05-16");
  });

  it("handles month-crossing weeks", () => {
    // 2026-05-01 is a Friday; Sunday before is 2026-04-26
    expect(startOfWeekIso("2026-05-01")).toBe("2026-04-26");
    expect(endOfWeekIso("2026-05-01")).toBe("2026-05-02");
  });
});

describe("buildMonthGrid", () => {
  it("always returns 42 cells (6 rows × 7 cols)", () => {
    expect(buildMonthGrid("2026-05-12")).toHaveLength(42);
    expect(buildMonthGrid("2026-02-15")).toHaveLength(42);
    expect(buildMonthGrid("2026-12-01")).toHaveLength(42);
  });

  it("first cell is a Sunday and within or just before the anchor month", () => {
    const grid = buildMonthGrid("2026-05-12");
    expect(grid[0]?.iso).toBe("2026-04-26"); // Sunday before May 1
    expect(grid[0]?.inMonth).toBe(false);
  });

  it("includes the first day of the anchor month with inMonth=true", () => {
    const grid = buildMonthGrid("2026-05-12");
    const firstOfMonth = grid.find((c) => c.iso === "2026-05-01");
    expect(firstOfMonth?.inMonth).toBe(true);
  });

  it("marks spillover days as inMonth=false", () => {
    const grid = buildMonthGrid("2026-05-12");
    // Last cell is in June (spillover after May 31)
    const last = grid[41];
    expect(last?.iso.startsWith("2026-06")).toBe(true);
    expect(last?.inMonth).toBe(false);
  });
});

describe("buildWeekDays", () => {
  it("returns 7 days starting from Sunday", () => {
    const days = buildWeekDays("2026-05-12");
    expect(days).toEqual([
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
    ]);
  });
});

describe("rangeForView", () => {
  it("day view returns a single-day range", () => {
    expect(rangeForView("2026-05-12", "day")).toEqual({
      fromIso: "2026-05-12",
      toIso: "2026-05-12",
    });
  });

  it("week view returns Sunday→Saturday", () => {
    expect(rangeForView("2026-05-12", "week")).toEqual({
      fromIso: "2026-05-10",
      toIso: "2026-05-16",
    });
  });

  it("month view returns the full grid range (covers spillover)", () => {
    const r = rangeForView("2026-05-12", "month");
    expect(r.fromIso).toBe("2026-04-26");
    expect(r.toIso.startsWith("2026-06")).toBe(true);
  });
});

describe("shiftAnchor", () => {
  it("day ±1", () => {
    expect(shiftAnchor("2026-05-12", "day", 1)).toBe("2026-05-13");
    expect(shiftAnchor("2026-05-12", "day", -1)).toBe("2026-05-11");
  });

  it("week ±7 days", () => {
    expect(shiftAnchor("2026-05-12", "week", 1)).toBe("2026-05-19");
    expect(shiftAnchor("2026-05-12", "week", -1)).toBe("2026-05-05");
  });

  it("month ±1 lands on day 1 of the target month", () => {
    expect(shiftAnchor("2026-05-12", "month", 1)).toBe("2026-06-01");
    expect(shiftAnchor("2026-05-12", "month", -1)).toBe("2026-04-01");
    // Year boundary
    expect(shiftAnchor("2026-12-15", "month", 1)).toBe("2027-01-01");
    expect(shiftAnchor("2026-01-15", "month", -1)).toBe("2025-12-01");
  });
});

describe("isValidDateIso", () => {
  it("accepts well-formed YYYY-MM-DD", () => {
    expect(isValidDateIso("2026-05-12")).toBe(true);
    expect(isValidDateIso("2024-02-29")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isValidDateIso("")).toBe(false);
    expect(isValidDateIso("2026-5-12")).toBe(false);
    expect(isValidDateIso("not-a-date")).toBe(false);
    expect(isValidDateIso("2026/05/12")).toBe(false);
    expect(isValidDateIso("2026-02-30")).toBe(false);
    expect(isValidDateIso("2026-04-31")).toBe(false);
    expect(isValidDateIso("2025-02-29")).toBe(false);
  });
});

describe("formatters (pt-BR)", () => {
  it("formatMonthLabel returns capitalized 'Month de YYYY'", () => {
    expect(formatMonthLabel("2026-05-12")).toBe("Maio de 2026");
    expect(formatMonthLabel("2026-01-01")).toBe("Janeiro de 2026");
  });

  it("formatWeekRangeLabel collapses same-month into one mention", () => {
    const label = formatWeekRangeLabel("2026-05-10", "2026-05-16");
    expect(label).toContain("10");
    expect(label).toContain("16");
    expect(label).toContain("mai");
    expect(label).toContain("2026");
  });

  it("formatDayLabel returns 'Weekday, DD de Month de YYYY'", () => {
    const label = formatDayLabel("2026-05-12");
    // Day of week could be "terça-feira" or similar — just check for the
    // expected parts.
    expect(label).toContain("12");
    expect(label).toContain("maio");
    expect(label).toContain("2026");
    // First char uppercase
    expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
  });
});
