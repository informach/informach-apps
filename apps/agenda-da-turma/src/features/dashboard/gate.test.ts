import { describe, expect, it } from "vitest";
import { pickDashboardGate } from "./gate";

describe("progressive school setup", () => {
  it("identifies an account without children", () => {
    expect(
      pickDashboardGate({
        profilesCount: 0,
        profilesWithoutTurmaCount: 0,
        turmasNeedingSubjectsCount: 0,
      }),
    ).toEqual({ kind: "no-students" });
  });
  it.each([
    [2, 1, 1],
    [1, 1, 0],
    [3, 0, 2],
    [1, 0, 0],
  ])("keeps existing routines accessible with %i children, %i missing classes and %i missing subjects", (profilesCount, profilesWithoutTurmaCount, turmasNeedingSubjectsCount) => {
    expect(
      pickDashboardGate({ profilesCount, profilesWithoutTurmaCount, turmasNeedingSubjectsCount }),
    ).toEqual({ kind: "ready" });
  });
});
