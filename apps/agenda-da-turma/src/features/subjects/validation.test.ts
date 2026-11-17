import { describe, expect, it } from "vitest";
import { validateSlotsAgainstClassDays } from "./validation";

describe("alternating school schedule validation", () => {
  const slot = {
    dayOfWeek: "mon" as const,
    pairedSubjectId: "00000000-0000-4000-8000-000000000001",
    anchorDate: "2026-11-09",
  };
  it("accepts an anchor on the actual class weekday", () => {
    expect(validateSlotsAgainstClassDays([slot], ["mon"])).toBeNull();
  });
  it("refuses a slot outside the weekly schedule", () => {
    expect(validateSlotsAgainstClassDays([slot], ["tue"])).toEqual({
      code: "SLOT_DAY_NOT_IN_CLASS_DAYS",
      day: "mon",
    });
  });
  it("refuses impossible dates and anchors on the wrong weekday", () => {
    for (const anchorDate of ["2026-02-30", "2026-11-10"])
      expect(validateSlotsAgainstClassDays([{ ...slot, anchorDate }], ["mon"])).toEqual({
        code: "INVALID_ANCHOR_DATE",
        day: "mon",
      });
  });
});
