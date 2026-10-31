import { describe, expect, it } from "vitest";
import { oQueEnviar, type PreferenciasFamilia } from "./agenda";
import { montarResumo } from "./conteudo";

const base: PreferenciasFamilia = {
  reminderDays: 0,
  reminderHour: 18,
  timezone: "America/Sao_Paulo",
  weeklySummary: false,
  weeklySummaryWeek: null,
};
// segunda-feira, 02/11/2026, 18:30 em São Paulo
const segunda18 = new Date("2026-11-02T21:30:00Z");

describe("quando enviar", () => {
  it("lembrete só no dia e na hora escolhidos", () => {
    const segunda = 1 << 1;
    expect(oQueEnviar({ ...base, reminderDays: segunda }, segunda18).lembrete).toBe("2026-11-02");
    expect(
      oQueEnviar({ ...base, reminderDays: segunda, reminderHour: 7 }, segunda18).lembrete,
    ).toBeNull();
    expect(oQueEnviar({ ...base, reminderDays: 1 << 2 }, segunda18).lembrete).toBeNull();
  });
  it("resumo na segunda depois das 8h, uma vez por semana", () => {
    expect(oQueEnviar({ ...base, weeklySummary: true }, segunda18).resumo).toEqual({
      semana: "2026-11-02",
      anterior: "2026-10-26",
    });
    expect(
      oQueEnviar({ ...base, weeklySummary: true, weeklySummaryWeek: "2026-11-02" }, segunda18)
        .resumo,
    ).toBeNull();
    expect(
      oQueEnviar({ ...base, weeklySummary: true }, new Date("2026-11-02T09:00:00Z")).resumo,
    ).toBeNull();
  });
});

describe("texto do resumo", () => {
  it("conta treinos de cada perfil e o desafio", () => {
    const resumo = montarResumo(
      [
        { id: "a", name: "Ana", color: "#3D7BFF" },
        { id: "b", name: "Beto", color: "#FF7A45" },
      ],
      [
        {
          profileId: "a",
          durationSeconds: 600,
          logs: [{ exerciseId: "agachamento", reps: 30, holdSeconds: 0 }],
        },
      ],
      { metric: "treinos", exerciseId: null, target: 1 },
    );
    expect(resumo.blocos[0]?.linhas[0]).toBe("1 treino, 10 minutos e 30 repetições.");
    expect(resumo.blocos[1]?.linhas[0]).toContain("Não treinou");
    expect(resumo.linhaDesafio).toContain("cumprido");
  });
});
