import { describe, expect, it } from "vitest";
import { formatDayLoad, summarizeDayLoad } from "./load";

const from = "2026-09-28";
const item = (
  dueAt: string | null,
  estimatedMinutes: number | null = null,
  status = "pending",
) => ({
  dueAt,
  estimatedMinutes,
  status,
});

describe("summarizeDayLoad", () => {
  it("covers the whole window even where there is nothing", () => {
    const days = summarizeDayLoad([], { fromIso: from, days: 7 });
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ iso: from, count: 0, minutes: 0, level: "leve" });
    expect(days[6]?.iso).toBe("2026-10-04");
  });
  it("counts three deliveries as a full day", () => {
    const days = summarizeDayLoad([item(from), item(from), item(from)], {
      fromIso: from,
      days: 7,
    });
    expect(days[0]).toMatchObject({ count: 3, level: "cheio" });
  });
  it("counts an hour and a half as a full day even with a single activity", () => {
    const days = summarizeDayLoad([item(from, 90)], { fromIso: from, days: 7 });
    expect(days[0]).toMatchObject({ count: 1, minutes: 90, level: "cheio" });
    expect(summarizeDayLoad([item(from, 60)], { fromIso: from, days: 7 })[0]).toMatchObject({
      level: "leve",
    });
  });
  it("ignores what is done, canceled, undated or outside the window", () => {
    const days = summarizeDayLoad(
      [
        item(from, 60, "done"),
        item(from, 60, "canceled"),
        item(null, 60),
        item("2026-10-20", 60),
        item(from, 30),
      ],
      { fromIso: from, days: 7 },
    );
    expect(days[0]).toMatchObject({ count: 1, minutes: 30, level: "leve" });
  });
});

describe("formatDayLoad", () => {
  it("says the count, and the estimate only when someone estimated", () => {
    expect(formatDayLoad({ iso: from, count: 1, minutes: 0, level: "leve" })).toBe("1 entrega");
    expect(formatDayLoad({ iso: from, count: 3, minutes: 90, level: "cheio" })).toBe(
      "3 entregas · ~1h30",
    );
  });
});
