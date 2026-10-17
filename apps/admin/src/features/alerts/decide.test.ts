import { describe, expect, it } from "vitest";
import {
  alertMessageKey,
  type CheckInput,
  decideTransition,
  isSameAvailability,
  reachedDetail,
  type StoredRow,
} from "./decide";

const t0 = new Date("2026-10-17T13:58:00.000Z");
const t1 = new Date("2026-10-17T14:03:00.000Z");
const t2 = new Date("2026-10-17T14:08:00.000Z");
const t3 = new Date("2026-10-17T14:13:00.000Z");

const up: CheckInput = {
  key: "edi",
  state: "up",
  latencyMs: 200,
  commit: "abc1234",
  problem: null,
};
const slow: CheckInput = { ...up, state: "slow", latencyMs: 4200 };
const down: CheckInput = {
  key: "edi",
  state: "down",
  latencyMs: null,
  commit: null,
  problem: "não respondeu em 10 segundos",
};

/** Roda a vigia em sequência, aplicando o `alertedAt` como a rotina faz quando o envio sai. */
function run(checks: Array<[CheckInput, Date]>, deliver = true) {
  let row: StoredRow | undefined;
  const alerts: string[] = [];
  for (const [check, at] of checks) {
    const decision = decideTransition(row, check, at);
    row = decision.row;
    if (decision.alert) {
      alerts.push(`${decision.alert.kind}@${decision.alert.downSince.toISOString()}`);
      if (deliver) row = { ...row, alertedAt: at };
    }
  }
  return { row, alerts };
}

describe("vigia dos serviços", () => {
  it("não avisa numa resposta perdida só", () => {
    const { alerts, row } = run([
      [up, t0],
      [down, t1],
      [up, t2],
    ]);
    expect(alerts).toEqual([]);
    expect(row?.state).toBe("up");
    expect(row?.detail).toBeNull();
  });

  it("avisa a queda na segunda verificação seguida, com o início da queda", () => {
    const { alerts, row } = run([
      [up, t0],
      [down, t1],
      [down, t2],
      [down, t3],
    ]);
    expect(alerts).toEqual([`down@${t1.toISOString()}`]);
    expect(row?.since).toEqual(t1);
    expect(row?.detail).toBe("não respondeu em 10 segundos");
  });

  it("avisa a volta uma vez, só depois de uma queda avisada", () => {
    const { alerts, row } = run([
      [down, t0],
      [down, t1],
      [up, t2],
      [up, t3],
    ]);
    expect(alerts).toEqual([`down@${t0.toISOString()}`, `up@${t0.toISOString()}`]);
    expect(row?.state).toBe("up");
    expect(row?.since).toEqual(t2);
  });

  it("tenta de novo o aviso que não saiu, sem duplicar quando sai", () => {
    let row: StoredRow | undefined;
    const kinds: string[] = [];
    for (const [check, at, delivered] of [
      [down, t0, false],
      [down, t1, false],
      [down, t2, true],
      [down, t3, false],
    ] as const) {
      const decision = decideTransition(row, check, at);
      row = decision.row;
      if (decision.alert) {
        kinds.push(decision.alert.kind);
        if (delivered) row = { ...row, alertedAt: at };
      }
    }
    // t1 tenta e falha, t2 tenta de novo e sai, t3 não repete.
    expect(kinds).toEqual(["down", "down"]);
  });

  it("guarda a volta pendente até o aviso sair", () => {
    let row = decideTransition(undefined, down, t0).row;
    row = { ...decideTransition(row, down, t1).row, alertedAt: t1 };
    const back = decideTransition(row, up, t2);
    expect(back.alert?.kind).toBe("up");
    // O envio falhou: a próxima passada pede o aviso de volta de novo.
    const retry = decideTransition(back.row, up, t3);
    expect(retry.alert).toEqual({ kind: "up", service: "edi", downSince: t0, upAt: t2 });
    // Saiu: nada mais.
    const after = decideTransition({ ...retry.row, alertedAt: t3 }, up, t3);
    expect(after.alert).toBeNull();
  });

  it("lento não avisa e não reinicia o no ar desde", () => {
    const { alerts, row } = run([
      [up, t0],
      [slow, t1],
      [slow, t2],
      [up, t3],
    ]);
    expect(alerts).toEqual([]);
    expect(row?.state).toBe("up");
    expect(row?.since).toEqual(t0);
    expect(isSameAvailability("up", "slow")).toBe(true);
    expect(isSameAvailability("down", "slow")).toBe(false);
  });

  it("queda que chegou a parte das pessoas é avisada na volta e tenta quem faltou", () => {
    // t1: segunda verificação fora do ar; o aviso chega a uma pessoa e falha para outra.
    let row = decideTransition(undefined, down, t0).row;
    const first = decideTransition(row, down, t1);
    expect(first.alert?.kind).toBe("down");
    row = { ...first.row, detail: reachedDetail(first.row.detail) };
    // t2: ainda fora; tenta de novo (a chave por pessoa evita repetir para quem já recebeu).
    const retry = decideTransition(row, down, t2);
    expect(retry.alert).toMatchObject({ kind: "down", downSince: t0 });
    expect(retry.row.detail?.startsWith("reached:")).toBe(true);
    // t3: voltou antes de o aviso chegar a todo mundo: a volta é avisada assim mesmo.
    const back = decideTransition(retry.row, up, t3);
    expect(back.alert).toEqual({ kind: "up", service: "edi", downSince: t0, upAt: t3 });
  });

  it("queda cujo aviso não chegou a ninguém volta em silêncio", () => {
    let row = decideTransition(undefined, down, t0).row;
    row = decideTransition(row, down, t1).row;
    expect(decideTransition(row, up, t2).alert).toBeNull();
  });

  it("mantém a última versão conhecida quando o serviço não responde", () => {
    const first = decideTransition(undefined, up, t0).row;
    expect(decideTransition(first, down, t1).row.commit).toBe("abc1234");
  });

  it("monta a chave sem o e-mail da pessoa", () => {
    const key = alertMessageKey(
      { kind: "down", service: "edi", downSince: t0, problem: null },
      "0123456789abcdef",
    );
    expect(key).toBe(`admin.alert:edi:${t0.toISOString()}:down:0123456789abcdef`);
    expect(key).not.toContain("@");
  });
});
