import { describe, expect, it } from "vitest";
import { descreverDesafio, placar } from "./placar";

const perfis = [
  { id: "a", name: "Ana", color: "#3D7BFF" },
  { id: "b", name: "Beto", color: "#FF7A45" },
];
const sessoes = [
  {
    profileId: "a",
    durationSeconds: 600,
    logs: [
      { exerciseId: "agachamento", reps: 30 },
      { exerciseId: "flexao", reps: 10 },
    ],
  },
  { profileId: "b", durationSeconds: 1200, logs: [{ exerciseId: "agachamento", reps: 50 }] },
  { profileId: "outro", durationSeconds: 9999, logs: [{ exerciseId: "agachamento", reps: 999 }] },
];

describe("placar do desafio da semana", () => {
  it("soma repetições da família e ordena os perfis", () => {
    const p = placar({ metric: "repeticoes", exerciseId: null, target: 100 }, sessoes, perfis);
    expect(p.total).toBe(90);
    expect(p.concluido).toBe(false);
    expect(p.linhas.map((l) => [l.id, l.valor])).toEqual([
      ["b", 50],
      ["a", 40],
    ]);
  });
  it("minutos, treinos e um exercício", () => {
    expect(
      placar({ metric: "minutos", exerciseId: null, target: 30 }, sessoes, perfis),
    ).toMatchObject({ total: 30, concluido: true });
    expect(placar({ metric: "treinos", exerciseId: null, target: 2 }, sessoes, perfis).total).toBe(
      2,
    );
    expect(
      placar({ metric: "exercicio", exerciseId: "agachamento", target: 80 }, sessoes, perfis),
    ).toMatchObject({ total: 80, concluido: true, progresso: 1 });
  });
  it("descreve a meta em português", () => {
    expect(descreverDesafio({ metric: "exercicio", exerciseId: "polichinelo", target: 300 })).toBe(
      "300 repetições de polichinelo",
    );
  });
});
