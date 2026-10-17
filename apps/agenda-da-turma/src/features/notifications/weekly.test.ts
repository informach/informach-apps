import { describe, expect, it } from "vitest";
import { buildWeeklyDigest, buildWeeklyDigestLines, type WeeklyItem, weeklyWindow } from "./weekly";

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
    // Quarta, 30: a semana do resumo é de hoje até sexta.
    const wednesday = "2026-09-30";
    const lines = buildWeeklyDigestLines(
      [item({ dueAt: wednesday }), item({ dueAt: "2026-10-01" })],
      { todayIso: wednesday },
    );
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
    expect(lines.join(" ")).not.toMatch(/[\u2014\u2013]/);
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
    expect(digest?.title).toBe("De 28 de setembro a 2 de outubro: quinta está cheia");
  });
  it("names the week when no day is full", () => {
    expect(buildWeeklyDigest([item()], { todayIso: today })?.title).toBe(
      "A semana de 28 de setembro a 2 de outubro",
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
    expect(digest?.push.body).toBe("3 atividades até sexta, dia 2. Terça está cheia.");
    expect(`${digest?.push.title} ${digest?.push.body}`).not.toMatch(/Ana|Ciências|Maquete/);
  });
});

describe("o que vence antes da semana do resumo", () => {
  it("keeps what is due today on a Sunday, ahead of the school week", () => {
    // Domingo, 27: a semana do resumo começa na segunda, mas a prova de hoje
    // não pode sumir do resumo.
    const items = [item({ title: "Prova de hoje", dueAt: today }), item({ dueAt: "2026-09-29" })];
    const lines = buildWeeklyDigestLines(items, { todayIso: today });
    expect(lines[0]).toMatch(/^Hoje: .*Prova de hoje\.$/);
    expect(lines).toHaveLength(2);
    const digest = buildWeeklyDigest(items, { todayIso: today });
    expect(digest?.title).toBe("A semana de 28 de setembro a 2 de outubro");
    expect(digest?.push.body).toBe("2 atividades até sexta, dia 2.");
  });
});

describe("weeklyWindow", () => {
  it("covers the school days ahead, like the week on paper", () => {
    // Domingo: a segunda a sexta seguinte.
    expect(weeklyWindow(today)).toEqual({ fromIso: "2026-09-28", toIso: "2026-10-02" });
    // Quarta: de hoje até sexta.
    expect(weeklyWindow("2026-09-30")).toEqual({ fromIso: "2026-09-30", toIso: "2026-10-02" });
    // Sexta: a semana que vem.
    expect(weeklyWindow("2026-10-02")).toEqual({ fromIso: "2026-10-05", toIso: "2026-10-09" });
  });
  it("takes in the weekend only when something is due then", () => {
    expect(weeklyWindow(today, [{ dueAt: "2026-10-03" }])).toEqual({
      fromIso: "2026-09-28",
      toIso: "2026-10-03",
    });
    expect(weeklyWindow(today, [{ dueAt: "2026-10-03", status: "done" }]).toIso).toBe("2026-10-02");
  });
});
