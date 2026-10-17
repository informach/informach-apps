import { describe, expect, it } from "vitest";
import type { ServiceCheck } from "@/lib/services";
import { buildAiRows, buildEmailSummary, buildServiceRows, databaseText } from "./service";

const at = new Date("2026-10-17T14:00:00Z");

function check(overrides: Partial<ServiceCheck>): ServiceCheck {
  return {
    key: "cozya",
    state: "up",
    latencyMs: 310,
    commit: "54c8cee",
    problem: null,
    httpStatus: 200,
    checkedAt: at,
    ...overrides,
  };
}

describe("composição de Operação", () => {
  it("diz como está o banco de cada serviço pela resposta do ready", () => {
    expect(databaseText("site", check({ key: "site" }))).toBe("não usa");
    expect(databaseText("cozya", check({}))).toBe("em dia");
    expect(databaseText("cozya", check({ state: "down", problem: "schema_behind" }))).toBe(
      "atrás desta versão",
    );
    expect(databaseText("edi", check({ key: "edi", state: "down", problem: "timeout" }))).toBe(
      "não conferido",
    );
  });

  it("usa o desde da vigia só quando o estado bate", () => {
    const since = new Date("2026-10-17T13:58:00Z");
    const rows = buildServiceRows(
      [check({ key: "edi", state: "down", problem: "timeout", httpStatus: null }), check({})],
      new Map([
        ["edi", { state: "down", since }],
        ["cozya", { state: "down", since }],
      ]),
    );
    expect(rows.find((row) => row.key === "edi")).toMatchObject({
      since,
      problem: "não respondeu em 10 segundos",
    });
    expect(rows.find((row) => row.key === "cozya")?.since).toBeNull();
  });

  it("lento e no ar são o mesmo período para o desde", () => {
    const since = new Date("2026-10-17T10:00:00Z");
    const rows = buildServiceRows(
      [check({ state: "slow", latencyMs: 4200 })],
      new Map([["cozya", { state: "up", since }]]),
    );
    expect(rows[0]?.since).toEqual(since);
  });

  it("conta e-mails por situação e agrupa as categorias com o mesmo nome", () => {
    const summary = buildEmailSummary(
      [
        { category: "auth.verify-email", status: "sent", retryScheduled: false, count: 3 },
        { category: "auth.verify-email-otp", status: "failed", retryScheduled: true, count: 2 },
        { category: "billing.payment-failed", status: "bounced", retryScheduled: false, count: 1 },
      ],
      [
        { category: "auth.verify-email", status: "sent", retryScheduled: false, count: 10 },
        { category: "auth.verify-email-otp", status: "failed", retryScheduled: false, count: 1 },
      ],
    );
    expect(summary.day).toEqual({ delivered: 0, sent: 3, retrying: 2, lost: 1, skipped: 0 });
    expect(summary.categories[0]).toEqual({
      label: "Confirmação de e-mail",
      day: 5,
      week: 11,
      weekLost: 1,
    });
  });

  it("calcula falhas de IA sobre as tarefas encerradas e não inventa custo", () => {
    const rows = buildAiRows(
      [
        { app: "cozya", status: "committed", count: 90 },
        { app: "cozya", status: "released", count: 8 },
        { app: "cozya", status: "expired", count: 2 },
        { app: "cozya", status: "active", count: 1 },
        { app: "agenda-da-turma", status: "committed", count: 10 },
      ],
      [{ app: "cozya", runs: 100, withCost: 93, reportedUsd: 24.1 }],
    );
    expect(rows[0]).toMatchObject({
      app: "cozya",
      tasks: 101,
      active: 1,
      returned: 10,
      failureRate: 0.1,
    });
    expect(rows[0]?.costCoverage).toBeCloseTo(0.93);
    expect(rows[1]).toMatchObject({
      app: "agenda-da-turma",
      failureRate: 0,
      costCoverage: null,
      reportedUsd: 0,
    });
  });
});
