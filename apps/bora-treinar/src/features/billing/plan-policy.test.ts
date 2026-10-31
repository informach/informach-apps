import { describe, expect, it } from "vitest";
import { planChangeMode, planProfileLimit } from "./plan-policy";

const individualMonthly = { tier: "individual", interval: "month" } as const;
const individualAnnual = { tier: "individual", interval: "year" } as const;
const familyMonthly = { tier: "family", interval: "month" } as const;
const familyAnnual = { tier: "family", interval: "year" } as const;

describe("commercial plan policy", () => {
  it("applies capacity upgrades and monthly-to-annual changes immediately", () => {
    expect(planChangeMode(individualMonthly, familyMonthly)).toBe("immediate");
    expect(planChangeMode(individualMonthly, individualAnnual)).toBe("immediate");
    expect(planChangeMode(familyMonthly, familyAnnual)).toBe("immediate");
  });

  it("preserves the paid period for capacity reductions and annual-to-monthly changes", () => {
    expect(planChangeMode(familyMonthly, individualMonthly)).toBe("schedule_at_period_end");
    expect(planChangeMode(familyAnnual, individualAnnual)).toBe("schedule_at_period_end");
    expect(planChangeMode(individualAnnual, individualMonthly)).toBe("schedule_at_period_end");
    expect(planChangeMode(familyAnnual, familyMonthly)).toBe("schedule_at_period_end");
  });

  it("maps the commercial capacity consistently", () => {
    expect(planProfileLimit(individualMonthly)).toBe(1);
    expect(planProfileLimit(familyMonthly)).toBe(4);
  });
});
