import { describe, expect, it } from "vitest";
import { monthlyRevenueCents, outagesFromAlertKeys, previousWeek, weekLabel } from "./weekly-logic";

describe("resumo da semana", () => {
  it("resume a semana anterior, de segunda a segunda em Brasília", () => {
    // Segunda, 19/10/2026, 08:00 em Brasília (11:00 UTC).
    const monday = previousWeek(new Date("2026-10-19T11:00:00Z"));
    expect(monday.start.toISOString()).toBe("2026-10-12T03:00:00.000Z");
    expect(monday.end.toISOString()).toBe("2026-10-19T03:00:00.000Z");
    // A passada de terça resume a mesma semana, então usa a mesma chave.
    const tuesday = previousWeek(new Date("2026-10-20T11:00:00Z"));
    expect(tuesday).toEqual(monday);
    // Domingo à noite em Brasília ainda é a semana que está acabando.
    const sunday = previousWeek(new Date("2026-10-19T02:30:00Z"));
    expect(sunday.end.toISOString()).toBe("2026-10-12T03:00:00.000Z");
  });

  it("escreve o período por extenso, trocando o mês quando precisa", () => {
    const week = previousWeek(new Date("2026-10-19T11:00:00Z"));
    expect(weekLabel(week.start, week.end)).toBe("de 12 a 18 de outubro");
    const turn = previousWeek(new Date("2026-10-05T11:00:00Z"));
    expect(weekLabel(turn.start, turn.end)).toBe("de 28 de setembro a 4 de outubro");
  });

  it("estima a receita por mês pelo preço de tabela, só das assinaturas ativas", () => {
    expect(
      monthlyRevenueCents([
        { productId: "cozya_pro_monthly", status: "active" },
        { productId: "cozya_pro_annual", status: "active" },
        { productId: "cozya_pro_monthly", status: "trialing" },
        { productId: "produto_que_nao_existe", status: "active" },
      ]),
    ).toBe(1490 + Math.round(14900 / 12));
  });

  it("reconstrói as quedas pelas chaves dos avisos, uma por queda", () => {
    const since = "2026-10-17T13:58:00.000Z";
    const outages = outagesFromAlertKeys([
      {
        messageKey: `admin.alert:edi:${since}:down:aaaa`,
        createdAt: new Date("2026-10-17T14:03:00Z"),
      },
      {
        messageKey: `admin.alert:edi:${since}:down:bbbb`,
        createdAt: new Date("2026-10-17T14:03:01Z"),
      },
      {
        messageKey: `admin.alert:edi:${since}:up:aaaa`,
        createdAt: new Date("2026-10-17T14:32:00Z"),
      },
      {
        messageKey: "admin.alert:agenda-da-turma:2026-10-18T10:00:00.000Z:down:aaaa",
        createdAt: new Date("2026-10-18T10:05:00Z"),
      },
      { messageKey: "outra-coisa", createdAt: new Date("2026-10-18T10:05:00Z") },
    ]);
    expect(outages).toEqual([
      { service: "edi", downSince: new Date(since), upAt: new Date("2026-10-17T14:32:00Z") },
      { service: "agenda-da-turma", downSince: new Date("2026-10-18T10:00:00Z"), upAt: null },
    ]);
  });
});
