import { describe, expect, it } from "vitest";
import { CONQUISTAS, conquistasMerecidas, type SessaoResumo } from "./catalogo";

const DIA = 86_400_000;
const SP = "America/Sao_Paulo";
const agora = Date.parse("2026-10-30T15:00:00Z");
const sessao = (diasAtras: number, extra: Partial<SessaoResumo> = {}): SessaoResumo => ({
  startedAt: agora - diasAtras * DIA,
  duration: 600,
  mode: "manual",
  reps: 20,
  holdSeconds: 0,
  bestHold: 0,
  semAvisos: true,
  ...extra,
});
/** um toque em "salvar" sem treino de verdade */
const toque = (diasAtras: number, extra: Partial<SessaoResumo> = {}) =>
  sessao(diasAtras, { duration: 20, reps: 2, ...extra });

describe("conquistas", () => {
  it("ids únicos", () => {
    expect(new Set(CONQUISTAS.map((c) => c.id)).size).toBe(CONQUISTAS.length);
  });
  it("primeiro treino e nada mais", () => {
    expect(conquistasMerecidas([sessao(0)], agora, SP)).toEqual(["primeiro-treino"]);
  });
  it("sequência, volume da semana, isometria e câmera", () => {
    const ids = conquistasMerecidas(
      [
        sessao(0, { reps: 60, mode: "camera", semAvisos: false }),
        sessao(1, { reps: 50, holdSeconds: 61, bestHold: 61 }),
        sessao(2, { mode: "pareado" }),
      ],
      agora,
      SP,
    );
    expect(ids).toEqual(
      expect.arrayContaining(["sequencia-3", "cem-semana", "um-minuto", "com-camera", "na-tv"]),
    );
    expect(ids).not.toContain("sequencia-7");
  });
  it("repetições de outra semana não contam para a semana atual", () => {
    expect(conquistasMerecidas([sessao(10, { reps: 150 })], agora, SP)).not.toContain("cem-semana");
  });
  it("sessão que não conta como treino não vale para nenhuma conquista", () => {
    expect(
      conquistasMerecidas([toque(0, { mode: "camera" }), toque(1), toque(2)], agora, SP, 1),
    ).toEqual([]);
    // isometria conta 1 por 1: 30 s de prancha numa sessão curta é treino
    expect(conquistasMerecidas([toque(0, { reps: 0, holdSeconds: 30 })], agora, SP)).toContain(
      "primeiro-treino",
    );
  });
});

describe("meta semanal", () => {
  // sexta, 30/10; as semanas começam nas segundas 05/10, 12/10, 19/10 e 26/10
  const semana = (segunda: string, dias: number) =>
    Array.from({ length: dias }, (_, i) =>
      sessao(0, { startedAt: Date.parse(`${segunda}T15:00:00Z`) + i * DIA }),
    );
  it("primeira semana cumprida, com a meta do perfil", () => {
    const ids = conquistasMerecidas(semana("2026-10-26", 2), agora, SP, 2);
    expect(ids).toContain("semana-cumprida");
    expect(conquistasMerecidas(semana("2026-10-26", 2), agora, SP, 3)).not.toContain(
      "semana-cumprida",
    );
  });
  it("três semanas seguidas; a quebra recomeça a conta", () => {
    const seguidas = [
      ...semana("2026-10-12", 2),
      ...semana("2026-10-19", 2),
      ...semana("2026-10-26", 2),
    ];
    expect(conquistasMerecidas(seguidas, agora, SP, 2)).toContain("3-semanas");
    const quebradas = [
      ...semana("2026-10-05", 2),
      ...semana("2026-10-12", 1),
      ...semana("2026-10-19", 2),
      ...semana("2026-10-26", 2),
    ];
    const ids = conquistasMerecidas(quebradas, agora, SP, 2);
    expect(ids).toContain("semana-cumprida");
    expect(ids).not.toContain("3-semanas");
    expect(ids).not.toContain("10-semanas");
  });
  it("dez semanas seguidas", () => {
    const dez = Array.from({ length: 10 }, (_, i) => sessao(0, { startedAt: agora - i * 7 * DIA }));
    expect(conquistasMerecidas(dez, agora, SP, 1)).toEqual(
      expect.arrayContaining(["semana-cumprida", "3-semanas", "10-semanas"]),
    );
  });
});

describe("recorde pessoal e técnica limpa", () => {
  const melhoresAnteriores = new Map([["flexao", { bestSet: 10, bestHold: 0 }]]);
  const serie = (reps: number) => ({
    exerciseId: "flexao",
    kind: "reps" as const,
    reps,
    holdSeconds: 0,
  });
  it("supera a melhor marca na sessão salva", () => {
    const salva = { duration: 300, logs: [serie(12)], melhoresAnteriores };
    expect(conquistasMerecidas([sessao(0)], agora, SP, 3, salva)).toContain("recorde-pessoal");
    expect(
      conquistasMerecidas([sessao(0)], agora, SP, 3, { ...salva, logs: [serie(10)] }),
    ).not.toContain("recorde-pessoal");
    expect(
      conquistasMerecidas([sessao(0)], agora, SP, 3, {
        ...salva,
        melhoresAnteriores: new Map(),
      }),
    ).not.toContain("recorde-pessoal");
  });
  it("vinte repetições pela câmera ou pelo celular, sem aviso de forma", () => {
    expect(conquistasMerecidas([sessao(0, { mode: "pareado" })], agora, SP)).toContain(
      "tecnica-limpa",
    );
    expect(
      conquistasMerecidas([sessao(0, { mode: "camera", semAvisos: false })], agora, SP),
    ).not.toContain("tecnica-limpa");
    expect(conquistasMerecidas([sessao(0, { mode: "camera", reps: 19 })], agora, SP)).not.toContain(
      "tecnica-limpa",
    );
    expect(conquistasMerecidas([sessao(0)], agora, SP)).not.toContain("tecnica-limpa");
  });
});
