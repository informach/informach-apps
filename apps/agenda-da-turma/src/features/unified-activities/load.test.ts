import { describe, expect, it } from "vitest";
import { formatDayLoad, summarizeDayLoad } from "./load";

const from = "2026-09-28";
const item = (
  dueAt: string | null,
  estimatedMinutes: number | null = null,
  status = "pending",
  type = "task",
) => ({
  dueAt,
  estimatedMinutes,
  status,
  type,
});

describe("summarizeDayLoad", () => {
  it("covers the whole window even where there is nothing", () => {
    const days = summarizeDayLoad([], { fromIso: from, days: 7 });
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ iso: from, deliveries: 0, study: 0, minutes: 0, level: "leve" });
    expect(days[6]?.iso).toBe("2026-10-04");
  });
  it("counts three deliveries as a full day", () => {
    const days = summarizeDayLoad([item(from), item(from), item(from)], {
      fromIso: from,
      days: 7,
    });
    expect(days[0]).toMatchObject({ deliveries: 3, level: "cheio" });
  });
  it("counts an hour and a half as a full day even with a single activity", () => {
    const days = summarizeDayLoad([item(from, 90)], { fromIso: from, days: 7 });
    expect(days[0]).toMatchObject({ deliveries: 1, minutes: 90, level: "cheio" });
    expect(summarizeDayLoad([item(from, 60)], { fromIso: from, days: 7 })[0]).toMatchObject({
      level: "leve",
    });
  });
  it("ignores what is done, canceled, undated or outside the window", () => {
    const days = summarizeDayLoad(
      [
        item(from, 60, "done"),
        item(from, 60, "canceled"),
        item(null, 60),
        item("2026-10-20", 60),
        item(from, 30),
      ],
      { fromIso: from, days: 7 },
    );
    expect(days[0]).toMatchObject({ deliveries: 1, minutes: 30, level: "leve" });
  });
});

describe("summarizeDayLoad: sessão de estudo", () => {
  it("não deixa o plano da própria família encher o dia que ela reservou", () => {
    // Três sessões marcadas pela casa não são três entregas. Contá-las como
    // tal fazia o resumo de domingo avisar sobre o dia reservado para estudar.
    const days = summarizeDayLoad(
      [
        item(from, 20, "pending", "study"),
        item(from, 20, "pending", "study"),
        item(from, 20, "pending", "study"),
      ],
      { fromIso: from },
    );
    expect(days[0]).toMatchObject({ deliveries: 0, study: 3, minutes: 60, level: "leve" });
  });

  it("mas conta os minutos: o dia continua ocupado", () => {
    const days = summarizeDayLoad([item(from, 90, "pending", "study")], { fromIso: from });
    expect(days[0]).toMatchObject({ deliveries: 0, study: 1, level: "cheio" });
  });

  it("usa a mesma janela do resumo de domingo quando ninguém a escolhe", () => {
    expect(summarizeDayLoad([], { fromIso: from })).toHaveLength(7);
  });
});

describe("formatDayLoad", () => {
  it("says the count, and the estimate only when someone estimated", () => {
    expect(formatDayLoad({ iso: from, deliveries: 1, study: 0, minutes: 0, level: "leve" })).toBe(
      "1 entrega",
    );
    expect(formatDayLoad({ iso: from, deliveries: 3, study: 0, minutes: 90, level: "cheio" })).toBe(
      "3 entregas · ~1h30",
    );
  });

  it("nunca chama sessão de estudo de entrega", () => {
    expect(formatDayLoad({ iso: from, deliveries: 0, study: 2, minutes: 60, level: "leve" })).toBe(
      "2 sessões de estudo · ~1h",
    );
    expect(formatDayLoad({ iso: from, deliveries: 1, study: 1, minutes: 90, level: "cheio" })).toBe(
      "1 entrega e 1 sessão de estudo · ~1h30",
    );
  });
});
