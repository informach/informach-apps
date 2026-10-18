import { describe, expect, it } from "vitest";
import { describeDue } from "./due";

// Segunda-feira, 19 de outubro de 2026.
const today = "2026-10-19";
const pending = (dueAt: string | null, time: string | null = null) => ({
  dueAt,
  time,
  status: "pending" as const,
});

describe("describeDue", () => {
  it("says the day the way the family says it", () => {
    expect(describeDue(pending("2026-10-16"), today)).toEqual({
      label: "Passou · sex, 16",
      tone: "late",
    });
    expect(describeDue(pending(today), today)).toEqual({ label: "Hoje", tone: "today" });
    expect(describeDue(pending("2026-10-20", "08:00"), today)).toEqual({
      label: "Amanhã · 8h",
      tone: "tomorrow",
    });
    expect(describeDue(pending("2026-10-21", "08:30"), today)).toEqual({
      label: "qua, 21 · 8h30",
      tone: "later",
    });
  });

  it("answers even without a date", () => {
    expect(describeDue(pending(null), today)).toEqual({ label: "Sem data", tone: "none" });
  });

  it("lets the state win over the date", () => {
    expect(describeDue({ dueAt: "2026-10-16", time: null, status: "done" }, today)).toEqual({
      label: "Feito",
      tone: "done",
    });
    expect(describeDue({ dueAt: today, time: null, status: "canceled" }, today)).toEqual({
      label: "Cancelada",
      tone: "canceled",
    });
  });

  it("never prints a numeric date", () => {
    for (const dueAt of ["2026-10-01", "2026-11-05", "2027-01-04"])
      expect(describeDue(pending(dueAt), today).label).not.toMatch(/\d{2}\/\d{2}/);
  });
});
