import { describe, expect, it } from "vitest";
import { buildWeeklyDigest, buildWeeklyDigestLines, type WeeklyItem } from "./weekly";

// Domingo, 27 de setembro de 2026.
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
  it("groups by day and names the child, the subject and the activity", () => {
    const lines = buildWeeklyDigestLines(
      [
        item({ subjectName: "Ciências" }),
        item({ profileName: "Bia", title: "Levar tesoura", type: "material" }),
      ],
      { todayIso: today },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Terça, 29:");
    expect(lines[0]).toContain("Ana · Ciências: Prova de Ciências");
    expect(lines[0]).toContain("Bia: Levar tesoura");
  });
  it("calls today and tomorrow by name", () => {
    const lines = buildWeeklyDigestLines([item({ dueAt: today }), item({ dueAt: "2026-09-28" })], {
      todayIso: today,
    });
    expect(lines[0]?.startsWith("Hoje:")).toBe(true);
    expect(lines[1]?.startsWith("Amanhã:")).toBe(true);
  });
  it("warns about the heaviest days", () => {
    const lines = buildWeeklyDigestLines(
      [item(), item({ title: "Trabalho" }), item({ title: "Lição" })],
      { todayIso: today },
    );
    expect(lines.at(-1)).toContain("Dias mais puxados: Terça, 29 (3 entregas)");
  });
  it("leaves out what is already done or canceled", () => {
    expect(
      buildWeeklyDigestLines(
        [item({ status: "done" }), item({ status: "canceled", title: "Outra" })],
        { todayIso: today },
      ),
    ).toEqual([]);
  });
  it("never uses a dash to join the day and its load", () => {
    const lines = buildWeeklyDigestLines([item()], { todayIso: today });
    expect(lines.join(" ")).not.toMatch(/[—–]/);
  });
});

describe("buildWeeklyDigest", () => {
  it("puts the full day in the subject line", () => {
    const digest = buildWeeklyDigest(
      [
        item({ dueAt: "2026-10-01" }),
        item({ dueAt: "2026-10-01", title: "B" }),
        item({ dueAt: "2026-10-01", title: "C" }),
      ],
      { todayIso: today },
    );
    expect(digest?.title).toBe("De 27 de setembro a 3 de outubro: quinta está cheia");
  });
  it("names the week when no day is full", () => {
    expect(buildWeeklyDigest([item()], { todayIso: today })?.title).toBe(
      "A semana de 27 de setembro a 3 de outubro",
    );
    expect(buildWeeklyDigest([], { todayIso: today })).toBeNull();
  });
  it("keeps names and titles off the lock screen", () => {
    const digest = buildWeeklyDigest(
      [
        item({ subjectName: "Ciências" }),
        item({ title: "Maquete", dueAt: "2026-09-29" }),
        item({ title: "Lição" }),
      ],
      { todayIso: today },
    );
    expect(digest?.push.body).toBe("3 atividades nos próximos sete dias. Terça está cheia.");
    expect(`${digest?.push.title} ${digest?.push.body}`).not.toMatch(/Ana|Ciências|Maquete/);
  });
});
