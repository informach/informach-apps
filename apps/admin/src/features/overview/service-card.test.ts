import { describe, expect, it } from "vitest";
import type { ServiceCheck, StoredServiceStatus } from "@/lib/services";
import { serviceCard } from "./service";

const now = new Date("2026-10-17T17:32:00Z");

function check(partial: Partial<ServiceCheck>): ServiceCheck {
  return {
    key: "edi",
    state: "up",
    latencyMs: 120,
    commit: "54c8cee",
    problem: null,
    httpStatus: 200,
    checkedAt: now,
    ...partial,
  };
}

function stored(partial: Partial<StoredServiceStatus>): StoredServiceStatus {
  return {
    service: "edi",
    state: "down",
    since: new Date("2026-10-17T16:58:00Z"),
    checkedAt: now,
    latencyMs: null,
    commit: null,
    detail: null,
    alertedAt: null,
    ...partial,
  };
}

describe("cartão de serviço no Painel", () => {
  it("fora do ar diz o problema e desde quando, pelo horário de Brasília", () => {
    const card = serviceCard(
      check({ state: "down", problem: "timeout", latencyMs: null, httpStatus: null }),
      stored({}),
      now,
    );
    expect(card.name).toBe("Suíte Edi");
    expect(card.line).toBe("Não respondeu em 10 segundos, desde 13:58");
  });

  it("não inventa o desde quando a vigia viu outro estado", () => {
    const card = serviceCard(
      check({ state: "down", problem: "schema_behind", httpStatus: 503 }),
      stored({ state: "up" }),
      now,
    );
    expect(card.line).toBe("O banco está atrás desta versão; o migrator ainda não rodou");
  });

  it("lento mostra o tempo de resposta com vírgula", () => {
    const card = serviceCard(
      check({ key: "missao-saber", state: "slow", latencyMs: 4200 }),
      undefined,
      now,
    );
    expect(card.line).toBe("Respondeu em 4,2 s na última verificação");
  });

  it("no ar mostra a versão e há quanto tempo, quando a vigia sabe", () => {
    const card = serviceCard(
      check({ key: "cozya" }),
      stored({ service: "cozya", state: "up", since: new Date("2026-10-17T15:32:00Z") }),
      now,
    );
    expect(card.line).toBe("54c8cee · no ar há 2 horas");
    // Lento não tira do ar: o "no ar há" continua contando de quando o serviço voltou.
    const afterSlow = serviceCard(
      check({ key: "cozya" }),
      stored({ service: "cozya", state: "slow", since: new Date("2026-10-17T15:32:00Z") }),
      now,
    );
    expect(afterSlow.line).toBe("54c8cee · no ar há 2 horas");
    expect(serviceCard(check({ key: "site", commit: null }), undefined, now).line).toBe(
      "Respondeu agora",
    );
  });
});
