import { describe, expect, it } from "vitest";
import { CONQUISTAS, conquistasMerecidas, type SessaoResumo } from "./catalogo";

const DIA = 86_400_000;
const agora = Date.parse("2026-10-30T15:00:00Z");
const sessao = (diasAtras: number, extra: Partial<SessaoResumo> = {}): SessaoResumo => ({
  startedAt: agora - diasAtras * DIA,
  mode: "manual",
  reps: 20,
  bestHold: 0,
  ...extra,
});

describe("conquistas", () => {
  it("ids únicos", () => {
    expect(new Set(CONQUISTAS.map((c) => c.id)).size).toBe(CONQUISTAS.length);
  });
  it("primeiro treino e nada mais", () => {
    expect(conquistasMerecidas([sessao(0)], agora)).toEqual(["primeiro-treino"]);
  });
  it("sequência, volume da semana, isometria e câmera", () => {
    const ids = conquistasMerecidas(
      [
        sessao(0, { reps: 60, mode: "camera" }),
        sessao(1, { reps: 50, bestHold: 61 }),
        sessao(2, { mode: "pareado" }),
      ],
      agora,
    );
    expect(ids).toEqual(
      expect.arrayContaining(["sequencia-3", "cem-semana", "um-minuto", "com-camera", "na-tv"]),
    );
    expect(ids).not.toContain("sequencia-7");
  });
  it("repetições de outra semana não contam para a semana atual", () => {
    expect(conquistasMerecidas([sessao(10, { reps: 150 })], agora)).not.toContain("cem-semana");
  });
});
