import { describe, expect, it } from "vitest";
import type { DayLoad } from "@/features/unified-activities/load";
import { planStudySessions } from "./plan";

const today = "2026-09-28";
const heavy = (iso: string): DayLoad => ({
  iso,
  deliveries: 3,
  study: 0,
  minutes: 120,
  level: "cheio",
});

describe("planStudySessions", () => {
  it("spreads the sessions between today and the eve of the exam", () => {
    expect(planStudySessions({ examDueAt: "2026-10-05", todayIso: today, sessions: 3 })).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
    ]);
  });
  it("never schedules on the exam day itself, nor after it", () => {
    const plan = planStudySessions({ examDueAt: "2026-10-01", todayIso: today, sessions: 7 });
    expect(plan).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
    expect(plan).not.toContain("2026-10-01");
  });
  it("gives nothing when the exam is today or already past", () => {
    expect(planStudySessions({ examDueAt: today, todayIso: today, sessions: 3 })).toEqual([]);
    expect(planStudySessions({ examDueAt: "2026-09-20", todayIso: today, sessions: 3 })).toEqual(
      [],
    );
  });
  it("avoids the days that are already full", () => {
    const plan = planStudySessions({
      examDueAt: "2026-10-03",
      todayIso: today,
      sessions: 2,
      loadByDay: [heavy("2026-09-28"), heavy("2026-09-29")],
    });
    expect(plan).toEqual(["2026-09-30", "2026-10-01"]);
  });
  it("is deterministic and caps at the window and at the maximum", () => {
    const args = { examDueAt: "2026-10-30", todayIso: today, sessions: 99 } as const;
    expect(planStudySessions(args)).toEqual(planStudySessions(args));
    expect(planStudySessions(args)).toHaveLength(7);
    expect(
      planStudySessions({ examDueAt: "2026-09-30", todayIso: today, sessions: 5 }),
    ).toHaveLength(2);
  });
});
