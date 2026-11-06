import { describe, expect, it } from "vitest";
import {
  contaComoTreino,
  historicoDeSemanas,
  recordesBatidos,
  type SessaoDeHabito,
  semanaAtual,
  TREINO_MIN_REPETICOES,
  TREINO_MIN_SEGUNDOS,
} from "../engine/habito";

const SP = "America/Sao_Paulo";
const DIA = 86_400_000;
// quinta-feira, 05/11/2026, 12:00 em São Paulo (a semana começou na segunda, 02/11)
const agora = Date.parse("2026-11-05T15:00:00Z");
const log = (reps: number, holdSeconds = 0) => ({ reps, holdSeconds });
const treino = (instante: number, extra: Partial<SessaoDeHabito> = {}): SessaoDeHabito => ({
  startedAt: instante,
  duration: 600,
  logs: [log(10)],
  ...extra,
});
/** meio-dia em São Paulo do dia AAAA-MM-DD */
const em = (data: string) => Date.parse(`${data}T15:00:00Z`);

describe("o que conta como treino", () => {
  it("5 repetições ou 1 minuto, com a isometria contando 1 por 1", () => {
    expect(TREINO_MIN_REPETICOES).toBe(5);
    expect(TREINO_MIN_SEGUNDOS).toBe(60);
    expect(contaComoTreino({ duration: 20, logs: [log(5)] })).toBe(true);
    expect(contaComoTreino({ duration: 20, logs: [log(2), log(2)] })).toBe(false);
    expect(contaComoTreino({ duration: 60, logs: [log(0)] })).toBe(true);
    expect(contaComoTreino({ duration: 59, logs: [log(0, 3), log(1)] })).toBe(false);
    expect(contaComoTreino({ duration: 30, logs: [log(0, 5)] })).toBe(true);
  });
});

describe("semana atual", () => {
  it("dias distintos de segunda a domingo, só com treino que conta", () => {
    const semana = semanaAtual(
      [
        treino(em("2026-11-02")),
        treino(em("2026-11-02") + 3_600_000), // mesmo dia: conta uma vez
        treino(em("2026-11-04")),
        treino(em("2026-11-05"), { duration: 10, logs: [log(1)] }), // não conta
        treino(em("2026-11-01")), // domingo da semana passada
      ],
      agora,
      SP,
      3,
    );
    expect(semana).toEqual({
      dias: 2,
      meta: 3,
      cumprida: false,
      diasDaSemana: [true, false, true, false, false, false, false],
    });
  });
  it("segue o fuso da família: 22h de domingo em São Paulo ainda é a semana passada", () => {
    // domingo, 01/11, 22h em SP = segunda 01h UTC
    const semana = semanaAtual([treino(Date.parse("2026-11-02T01:00:00Z"))], agora, SP, 1);
    expect(semana.dias).toBe(0);
    // o mesmo instante em UTC já é segunda, 01h
    expect(semanaAtual([treino(Date.parse("2026-11-02T01:00:00Z"))], agora, "UTC", 1).dias).toBe(1);
  });
  it("cumpre a meta e corrige meta fora de 1 a 7", () => {
    const sessoes = [treino(em("2026-11-03"))];
    expect(semanaAtual(sessoes, agora, SP, 1).cumprida).toBe(true);
    expect(semanaAtual(sessoes, agora, SP, 0).meta).toBe(1);
    expect(semanaAtual(sessoes, agora, SP, 12).meta).toBe(7);
  });
});

describe("histórico de semanas", () => {
  const semanaCom = (segunda: string, dias: number) =>
    Array.from({ length: dias }, (_, i) => treino(em(segunda) + i * DIA));

  it("semanas seguidas terminam na última semana completa, mais a atual se cumprida", () => {
    const sessoes = [
      ...semanaCom("2026-10-05", 3), // cumprida, mas a de 12/10 quebra a sequência
      ...semanaCom("2026-10-12", 1),
      ...semanaCom("2026-10-19", 3),
      ...semanaCom("2026-10-26", 4),
      ...semanaCom("2026-11-02", 2), // atual, ainda não cumprida
    ];
    const h = historicoDeSemanas(sessoes, agora, SP, 3, 4);
    expect(h.seguidas).toBe(2);
    expect(h.total).toBe(3);
    expect(h.melhor).toBe(2);
    expect(h.semanas.map((s) => [s.dias, s.cumprida])).toEqual([
      [1, false],
      [3, true],
      [4, true],
      [2, false],
    ]);
    expect(h.semanas[3]?.inicio).toBe(Date.parse("2026-11-02T03:00:00Z"));

    const cumpriu = historicoDeSemanas([...sessoes, treino(em("2026-11-05"))], agora, SP, 3, 4);
    expect(cumpriu.seguidas).toBe(3);
    expect(cumpriu.melhor).toBe(3);
  });
  it("semana atual sem a meta ainda não quebra a sequência; a passada sem a meta quebra", () => {
    expect(historicoDeSemanas(semanaCom("2026-10-26", 2), agora, SP, 2).seguidas).toBe(1);
    expect(historicoDeSemanas(semanaCom("2026-10-19", 2), agora, SP, 2).seguidas).toBe(0);
  });
  it("sessões que não contam não fazem dia de treino", () => {
    const toques = semanaCom("2026-10-26", 3).map((s) => ({ ...s, duration: 5, logs: [log(1)] }));
    expect(historicoDeSemanas(toques, agora, SP, 1).total).toBe(0);
  });
});

describe("recordes batidos", () => {
  const anteriores = new Map([
    ["flexao", { bestSet: 10, bestHold: 0 }],
    ["prancha", { bestSet: 0, bestHold: 40 }],
  ]);
  const serie = (exerciseId: string, kind: "reps" | "hold", reps: number, holdSeconds = 0) => ({
    exerciseId,
    kind,
    reps,
    holdSeconds,
  });
  it("melhor série acima da marca anterior; exercício novo não é recorde", () => {
    expect(
      recordesBatidos(
        [
          serie("flexao", "reps", 8),
          serie("flexao", "reps", 12),
          serie("prancha", "hold", 0, 40),
          serie("agachamento", "reps", 30),
        ],
        anteriores,
      ),
    ).toEqual([{ exerciseId: "flexao", kind: "reps", value: 12, anterior: 10 }]);
    expect(recordesBatidos([serie("prancha", "hold", 0, 45)], anteriores)).toEqual([
      { exerciseId: "prancha", kind: "hold", value: 45, anterior: 40 },
    ]);
  });
});
