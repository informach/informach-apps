import { describe, expect, it } from "vitest";
import { monthlyRevenueCents, summarizeSubscriptions } from "../money/logic";
import { outagesFromAlertKeys, previousWeek, weekLabel } from "./weekly-logic";

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
        { productId: "cozya_pro_monthly", status: "past_due" },
        { productId: "produto_que_nao_existe", status: "active" },
      ]),
    ).toBe(1490 + Math.round(14900 / 12));
  });

  it("dá a mesma receita do Painel, por produto e no total", () => {
    // Uma linha por assinatura, como o resumo da semana lê do banco.
    const subscriptions = [
      { app: "cozya", productId: "cozya_pro_annual", status: "active" },
      { app: "cozya", productId: "cozya_pro_annual", status: "active" },
      { app: "cozya", productId: "cozya_pro_monthly", status: "active" },
      { app: "cozya", productId: "cozya_pro_annual", status: "trialing" },
      { app: "missao-saber", productId: "missao_family_annual", status: "active" },
      { app: "missao-saber", productId: "missao_individual_monthly", status: "active" },
    ];
    // As mesmas, agrupadas por status, como o Painel e Dinheiro leem.
    const grouped = new Map<
      string,
      { app: string; productId: string; status: string; total: number }
    >();
    for (const item of subscriptions) {
      const key = `${item.app}|${item.productId}|${item.status}`;
      const row = grouped.get(key) ?? { ...item, total: 0 };
      row.total += 1;
      grouped.set(key, row);
    }
    const panel = summarizeSubscriptions([...grouped.values()]);
    for (const app of ["cozya", "missao-saber"] as const) {
      expect(monthlyRevenueCents(subscriptions.filter((item) => item.app === app))).toBe(
        panel.get(app)?.mrrCents,
      );
    }
    const panelTotal = [...panel.values()].reduce((sum, entry) => sum + entry.mrrCents, 0);
    expect(monthlyRevenueCents(subscriptions)).toBe(panelTotal);
    // Duas anuais do Cozya arredondam por plano, como no Painel: 2 × 1.242, não 2.483.
    expect(panel.get("cozya")?.mrrCents).toBe(2 * Math.round(14900 / 12) + 1490);
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
