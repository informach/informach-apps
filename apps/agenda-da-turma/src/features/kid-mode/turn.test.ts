import { describe, expect, it } from "vitest";
import { addDaysIso } from "@/features/dashboard/date";
import { nextSchoolDayIso } from "@/features/dashboard/day-labels";
import { kidDueLabel, splitKidTurn } from "./turn";

type Entry = { key: string; item: { dueAt: string | null } };

function entry(key: string, dueAt: string | null): Entry {
  return { key, item: { dueAt } };
}

const ids = (list: Entry[]) => list.map((e) => e.key);

describe("splitKidTurn", () => {
  it("on a Thursday, goes until Friday and leaves the weekend and beyond to adiantar", () => {
    // 2026-10-22 é quinta.
    const today = "2026-10-22";
    const result = splitKidTurn(
      {
        attention: [entry("late", "2026-10-20"), entry("today", today), entry("undated", null)],
        tomorrow: [entry("fri", "2026-10-23")],
        week: [entry("sat", "2026-10-24"), entry("mon", "2026-10-26")],
      },
      { nextSchoolDayIso: nextSchoolDayIso(today), weekEndIso: addDaysIso(today, 6) },
    );
    expect(ids(result.todo)).toEqual(["late", "today", "undated", "fri"]);
    expect(ids(result.ahead)).toEqual(["sat", "mon"]);
  });

  it("on a Friday, what is for Monday is still for now (a decisão de 17/10/2026)", () => {
    const today = "2026-10-23";
    const result = splitKidTurn(
      {
        attention: [],
        tomorrow: [entry("sat", "2026-10-24")],
        week: [entry("sun", "2026-10-25"), entry("mon", "2026-10-26"), entry("tue", "2026-10-27")],
      },
      { nextSchoolDayIso: nextSchoolDayIso(today), weekEndIso: addDaysIso(today, 6) },
    );
    expect(ids(result.todo)).toEqual(["sat", "sun", "mon"]);
    expect(ids(result.ahead)).toEqual(["tue"]);
  });

  it("keeps the routine's order: the kid sees a piece of the adult's list, never another one", () => {
    const today = "2026-10-21";
    const buckets = {
      attention: [entry("a", "2026-10-21"), entry("b", null)],
      tomorrow: [entry("c", "2026-10-22")],
      week: [entry("d", "2026-10-23")],
    };
    const { todo, ahead } = splitKidTurn(buckets, {
      nextSchoolDayIso: nextSchoolDayIso(today),
      weekEndIso: addDaysIso(today, 6),
    });
    expect([...ids(todo), ...ids(ahead)]).toEqual(
      ids([...buckets.attention, ...buckets.tomorrow, ...buckets.week]),
    );
  });
});

describe("kidDueLabel", () => {
  const today = "2026-10-23"; // sexta
  it("never says late: what passed is for today", () => {
    expect(kidDueLabel("2026-10-20", today)).toBe("É para hoje");
    expect(kidDueLabel(today, today)).toBe("É para hoje");
  });
  it("says tomorrow, then the weekday", () => {
    expect(kidDueLabel("2026-10-24", today)).toBe("É para amanhã");
    expect(kidDueLabel("2026-10-26", today)).toBe("É para segunda");
    expect(kidDueLabel("2026-10-29", today)).toBe("É para quinta");
  });
  it("uses the date, in full words, when the weekday would repeat today's", () => {
    expect(kidDueLabel("2026-10-30", today)).toBe("É para sexta, 30 de outubro");
  });

  it("leaves to adiantar only what Hoje shows in the week, never the eighth day", () => {
    const today = "2026-10-21"; // quarta
    const { ahead } = splitKidTurn(
      {
        attention: [],
        tomorrow: [],
        week: [entry("fri", "2026-10-23"), entry("tue", "2026-10-27"), entry("wed", "2026-10-28")],
      },
      { nextSchoolDayIso: nextSchoolDayIso(today), weekEndIso: addDaysIso(today, 6) },
    );
    expect(ids(ahead)).toEqual(["fri", "tue"]);
  });
  it("does not invent a date that nobody set", () => {
    expect(kidDueLabel(null, today)).toBe("Ainda sem data marcada");
  });
});
