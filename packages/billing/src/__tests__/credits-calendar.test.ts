import { describe, expect, it } from "vitest";
import { monthlyCreditWindow } from "../credits/calendar";

describe("paid calendar credit windows", () => {
  it("keeps a January 31 anchor across February and March without overlapping windows", () => {
    const start = new Date("2025-01-31T15:00:00Z");
    const end = new Date("2026-01-31T15:00:00Z");
    const feb = monthlyCreditWindow(start, end, new Date("2025-02-28T15:00:00Z"));
    expect(feb).toEqual({
      beginsAt: new Date("2025-02-28T15:00:00Z"),
      endsAt: new Date("2025-03-31T15:00:00Z"),
      nextGrantAt: new Date("2025-03-31T15:00:00Z"),
    });
    expect(
      monthlyCreditWindow(start, end, new Date("2025-03-31T15:00:00Z"))?.endsAt.toISOString(),
    ).toBe("2025-04-30T15:00:00.000Z");
    expect(monthlyCreditWindow(start, end, end)).toBeNull();
  });
  it("produces exactly twelve windows in a paid annual leap-year period", () => {
    const start = new Date("2024-02-29T00:00:00Z");
    const end = new Date("2025-02-28T00:00:00Z");
    let cursor = start;
    let count = 0;
    while (cursor < end) {
      const window = monthlyCreditWindow(start, end, cursor);
      if (!window) throw new Error("Missing calendar window");
      expect(window.beginsAt).toEqual(cursor);
      cursor = window.endsAt;
      count++;
      if (count > 12) throw new Error("Unexpected extra credit window");
    }
    expect(count).toBe(12);
  });
});
