import { describe, expect, it } from "vitest";
import { latestFamilyActivity } from "./activity";

const skills = { fractions: "Frações" };
const attempt = { skillId: "fractions", createdAt: new Date("2026-10-01T12:00:00Z") };
const lab = {
  title: "Faixas de frações",
  date: "2026-10-02T12:00:00Z",
  status: "Começou a explorar",
};

describe("latest family activity", () => {
  it("keeps first-use guidance when no activity has been recorded", () => {
    expect(
      latestFamilyActivity({ evidence: [], reflections: [], laboratory: [] }, skills),
    ).toBeUndefined();
  });

  it("recognizes laboratory-only activity without inventing mastery", () => {
    expect(
      latestFamilyActivity({ evidence: [], reflections: [], laboratory: [lab] }, skills),
    ).toEqual({
      kind: "laboratory",
      label: "Laboratório: Faixas de frações",
      createdAt: new Date(lab.date),
      detail: "Começou a explorar.",
    });
  });

  it("recognizes a reflection even without a scored attempt", () => {
    const activity = latestFamilyActivity(
      { evidence: [], reflections: [attempt], laboratory: [] },
      skills,
    );
    expect(activity?.kind).toBe("reflection");
    expect(activity?.label).toBe("Reflexão: Frações");
  });

  it("uses the newest timestamp across sources, not the first row or latest attempt", () => {
    const newest = { ...attempt, createdAt: new Date("2026-10-03T12:00:00Z") };
    expect(
      latestFamilyActivity({ evidence: [attempt], reflections: [], laboratory: [lab] }, skills)
        ?.kind,
    ).toBe("laboratory");
    expect(
      latestFamilyActivity(
        { evidence: [attempt], reflections: [newest], laboratory: [lab] },
        skills,
      )?.kind,
    ).toBe("reflection");
    expect(
      latestFamilyActivity(
        { evidence: [attempt, newest], reflections: [], laboratory: [lab] },
        skills,
      ),
    ).toEqual({
      kind: "attempt",
      label: "Frações",
      createdAt: newest.createdAt,
    });
  });
});
