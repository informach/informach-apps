import { describe, expect, it } from "vitest";
import { buildWeeklyDigestLines, type WeeklyItem } from "./weekly";

const today = "2026-09-27";
const item = (patch: Partial<WeeklyItem> = {}): WeeklyItem => ({
  profileName: "Ana",
  title: "Prova de Ciências",
  type: "exam",
  dueAt: "2026-09-29",
  estimatedMinutes: null,
  ...patch,
});

describe("buildWeeklyDigestLines", () => {
  it("says nothing when the week is free", () => {
    expect(buildWeeklyDigestLines([], { todayIso: today })).toEqual([]);
    expect(buildWeeklyDigestLines([item({ dueAt: null })], { todayIso: today })).toEqual([]);
    // Fora da janela de sete dias.
    expect(buildWeeklyDigestLines([item({ dueAt: "2026-10-20" })], { todayIso: today })).toEqual(
      [],
    );
  });
  it("groups by day and names the child and the activity", () => {
    const lines = buildWeeklyDigestLines(
      [item(), item({ profileName: "Bia", title: "Levar tesoura", type: "material" })],
      { todayIso: today },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Terça (29/09)");
    expect(lines[0]).toContain("Ana: Prova, Prova de Ciências");
    expect(lines[0]).toContain("Bia: Material, Levar tesoura");
  });
  it("calls today and tomorrow by name", () => {
    const lines = buildWeeklyDigestLines([item({ dueAt: today }), item({ dueAt: "2026-09-28" })], {
      todayIso: today,
    });
    expect(lines[0]).toContain("Hoje");
    expect(lines[1]).toContain("Amanhã");
  });
  it("warns about the heaviest days", () => {
    const lines = buildWeeklyDigestLines(
      [item(), item({ title: "Trabalho" }), item({ title: "Lição" })],
      { todayIso: today },
    );
    expect(lines.at(-1)).toContain("Dias mais puxados: Terça (29/09) (3 entregas)");
  });
  it("leaves out what is already done or canceled", () => {
    expect(
      buildWeeklyDigestLines(
        [item({ status: "done" }), item({ status: "canceled", title: "Outra" })],
        { todayIso: today },
      ),
    ).toEqual([]);
  });
});
