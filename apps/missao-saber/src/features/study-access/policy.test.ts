import { describe, expect, it } from "vitest";
import { safeDestination, selectedStudyProfile, studyCodeSchema, studyLifetimeMs } from "./policy";

describe("study access boundaries", () => {
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/api/familia/exportar",
    "/familia",
    "/familia/conta",
  ])("does not redirect a learner to %s", (path) => {
    expect(safeDestination(path, "study")).toBe("/hoje");
  });
  it("preserves the authorized task and its context", () => {
    expect(safeDestination("/laboratorio?execucao=abc", "study")).toBe("/laboratorio?execucao=abc");
    expect(safeDestination("/familia/conta", "parent")).toBe("/familia/conta");
  });
  it("cannot authorize a sibling by changing the selected profile", () => {
    expect(selectedStudyProfile(["authorized"], "sibling")).toBe("authorized");
    expect(selectedStudyProfile([], "sibling")).toBeUndefined();
  });
  it("accepts readable codes without ambiguous characters", () => {
    expect(studyCodeSchema.parse("ab234-cd567")).toBe("AB234CD567");
    expect(studyCodeSchema.safeParse("OOOOO-11111").success).toBe(false);
  });
  it("bounds temporary and remembered access", () => {
    expect(studyLifetimeMs(false)).toBe(12 * 60 * 60_000);
    expect(studyLifetimeMs(true)).toBe(30 * 24 * 60 * 60_000);
  });
});
