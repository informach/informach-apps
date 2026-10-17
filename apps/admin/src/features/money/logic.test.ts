import { describe, expect, it } from "vitest";
import {
  aiTaskOutcome,
  creditTotals,
  cycleListCents,
  type MovementRow,
  monthlyListCents,
  planLabel,
  scheduledPhrases,
  subscriptionMovementFrom,
  summarizeScheduled,
  summarizeSubscriptions,
  switchingTotal,
  webhookConsequence,
  webhookNeedsResend,
  webhookProduct,
} from "./logic";

describe("receita mensal pelo preço de tabela", () => {
  it("divide o anual por 12 e mantém o mensal", () => {
    expect(monthlyListCents("cozya_pro_monthly")).toBe(1490);
    expect(monthlyListCents("cozya_pro_annual")).toBe(Math.round(14900 / 12));
    expect(monthlyListCents("edi_suite_annual")).toBe(Math.round(49900 / 12));
  });

  it("não inventa preço para pacote de créditos ou produto desconhecido", () => {
    expect(monthlyListCents("cozya_credits_10")).toBeNull();
    expect(monthlyListCents("produto_que_nao_existe")).toBeNull();
    expect(cycleListCents("cozya_pro_annual")).toBe(14900);
  });

  it("só soma receita das assinaturas ativas; teste e atraso ficam à parte", () => {
    const summary = summarizeSubscriptions([
      { app: "cozya", productId: "cozya_pro_monthly", status: "active", total: 3 },
      { app: "cozya", productId: "cozya_pro_annual", status: "active", total: 2 },
      { app: "cozya", productId: "cozya_pro_monthly", status: "trialing", total: 5 },
      { app: "cozya", productId: "cozya_pro_monthly", status: "past_due", total: 1 },
      { app: "cozya", productId: "cozya_pro_monthly", status: "canceled", total: 9 },
      {
        app: "agenda-da-turma",
        productId: "agenda_da_turma_pro_monthly",
        status: "active",
        total: 1,
      },
      { app: "outro-app", productId: "x", status: "active", total: 4 },
    ]);
    const cozya = summary.get("cozya");
    expect(cozya).toMatchObject({ monthly: 3, annual: 2, trialing: 5, pastDue: 1, unpriced: 0 });
    // Pro segue PRO_STATUSES: ativas e em teste; atraso e canceladas ficam de fora.
    expect(cozya?.pro).toBe(3 + 2 + 5);
    expect(cozya?.mrrCents).toBe(3 * 1490 + 2 * Math.round(14900 / 12));
    expect(summary.get("agenda-da-turma")?.mrrCents).toBe(1990);
    expect(summary.has("edi")).toBe(false);
    expect([...summary.keys()]).not.toContain("outro-app");
  });

  it("conta como sem preço a assinatura ativa fora do catálogo", () => {
    const summary = summarizeSubscriptions([
      { app: "edi", productId: "edi_plano_antigo", status: "active", total: 2 },
    ]);
    expect(summary.get("edi")).toMatchObject({ monthly: 2, mrrCents: 0, unpriced: 2 });
  });
});

describe("nome do plano", () => {
  it("escreve o ciclo do mesmo jeito para todos os produtos", () => {
    expect(planLabel("cozya_pro_monthly")).toBe("Cozya Pro mensal");
    expect(planLabel("cozya_pro_annual")).toBe("Cozya Pro anual");
    expect(planLabel("missao_family_annual")).toBe("Missão Saber Família anual");
    expect(planLabel("edi_suite_monthly")).toBe("Suíte Edi mensal");
    expect(planLabel("desconhecido")).toBe("desconhecido");
  });
});

describe("avisos do Stripe", () => {
  it("descobre o produto pelo prefixo do evento", () => {
    expect(webhookProduct("Cozya:evt_123")).toBe("cozya");
    expect(webhookProduct("Agenda da Turma:evt_1")).toBe("agenda-da-turma");
    expect(webhookProduct("Missão Saber:evt_1")).toBe("missao-saber");
    expect(webhookProduct("Suíte Edi:evt_9")).toBe("edi");
    expect(webhookProduct("evt_sem_prefixo")).toBeNull();
  });

  it("diz a consequência em frase de gente", () => {
    expect(webhookConsequence("invoice.paid")).toMatch(/créditos do mês/);
    expect(webhookConsequence("customer.subscription.updated")).toMatch(/plano/);
    expect(webhookConsequence("algo.novo")).toMatch(/Stripe/);
  });
});

describe("fim de período marcado", () => {
  it("separa cancelamento de troca de plano agendada", () => {
    const scheduled = summarizeScheduled([
      { app: "cozya", pendingProductId: null, total: 2 },
      { app: "cozya", pendingProductId: "cozya_pro_monthly", total: 1 },
      { app: "cozya", pendingProductId: "cozya_pro_monthly", total: 2 },
      { app: "agenda-da-turma", pendingProductId: "agenda_da_turma_pro_monthly", total: 1 },
    ]);
    const cozya = scheduled.get("cozya");
    expect(cozya?.canceling).toBe(2);
    expect(switchingTotal(cozya)).toBe(3);
    expect(scheduled.get("agenda-da-turma")?.canceling).toBe(0);
    expect(scheduledPhrases(cozya)).toEqual([
      "2 com cancelamento agendado",
      "3 com troca para Cozya Pro mensal no fim do período",
    ]);
    expect(scheduledPhrases(undefined)).toEqual([]);
  });
});

describe("movimento de assinaturas em 30 dias", () => {
  const since = new Date("2026-09-17T12:00:00Z");
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
  function sub(partial: Partial<MovementRow> & { id: string }): MovementRow {
    return {
      customerId: "cus-1",
      app: "cozya",
      status: "active",
      providerSubscriptionId: `sub_${partial.id}`,
      previousSubscription: null,
      createdAt: day("2026-10-01"),
      confirmedAt: day("2026-10-01"),
      endedAt: null,
      ...partial,
    };
  }

  it("troca de plano agendada não é cancelada nem nova", () => {
    const movement = subscriptionMovementFrom(
      [
        sub({
          id: "anual",
          status: "canceled",
          createdAt: day("2025-10-10"),
          confirmedAt: day("2025-10-10"),
          endedAt: day("2026-10-10"),
        }),
        sub({
          id: "mensal",
          createdAt: day("2026-10-10"),
          confirmedAt: day("2026-10-10"),
          previousSubscription: "sub_anual",
        }),
      ],
      since,
    );
    expect(movement.get("cozya")).toEqual({ started: 0, canceled: 0, switched: 1 });
  });

  it("acha a troca pela data quando a assinatura nova não guardou a antiga", () => {
    const movement = subscriptionMovementFrom(
      [
        sub({
          id: "antiga",
          status: "canceled",
          createdAt: day("2026-01-05"),
          confirmedAt: day("2026-01-05"),
          endedAt: new Date("2026-10-05T03:00:00Z"),
        }),
        sub({
          id: "nova",
          createdAt: new Date("2026-10-05T03:00:04Z"),
          confirmedAt: day("2026-10-05"),
        }),
      ],
      since,
    );
    expect(movement.get("cozya")).toEqual({ started: 0, canceled: 0, switched: 1 });
  });

  it("conta cancelamento de verdade e assinatura nova de verdade", () => {
    const movement = subscriptionMovementFrom(
      [
        sub({ id: "nova", customerId: "cus-2" }),
        sub({
          id: "saiu",
          customerId: "cus-3",
          status: "canceled",
          createdAt: day("2026-03-01"),
          confirmedAt: day("2026-03-01"),
          endedAt: day("2026-10-02"),
        }),
        // Checkout que nunca foi confirmado não é cancelamento.
        sub({
          id: "incompleta",
          customerId: "cus-4",
          status: "canceled",
          confirmedAt: null,
          endedAt: day("2026-10-03"),
        }),
        // Encerrada antes da janela: fora.
        sub({
          id: "antiga",
          customerId: "cus-5",
          status: "canceled",
          createdAt: day("2026-01-01"),
          confirmedAt: day("2026-01-01"),
          endedAt: day("2026-09-01"),
        }),
        // A mesma pessoa voltou um mês depois: é nova, e a saída conta.
        sub({
          id: "voltou",
          customerId: "cus-3",
          createdAt: day("2026-11-05"),
          confirmedAt: day("2026-11-05"),
        }),
      ],
      since,
    );
    expect(movement.get("cozya")).toEqual({ started: 2, canceled: 1, switched: 0 });
  });
});

describe("créditos pelo razão", () => {
  it("separa compensação e reembolso e não chama vencimento de sobra", () => {
    const totals = creditTotals([
      { entryType: "purchase", amount: 100 },
      { entryType: "bonus_grant", amount: 50 },
      { entryType: "promo_grant", amount: 10 },
      { entryType: "consumption", amount: -70 },
      { entryType: "adjustment", amount: 15 },
      { entryType: "refund", amount: -40 },
      { entryType: "expiration", amount: -50 },
    ]);
    expect(totals).toEqual({
      granted: 160,
      consumed: 70,
      compensated: 15,
      refunded: 40,
      reachedExpiry: 50,
    });
  });
});

describe("tarefas de IA que falharam", () => {
  it("conta a falha pelas reservas soltas ou vencidas, sobre as encerradas", () => {
    const outcome = aiTaskOutcome([
      { status: "committed", total: 90, credits: 900 },
      { status: "released", total: 8, credits: 80 },
      { status: "expired", total: 2, credits: 30 },
      { status: "active", total: 5, credits: 50 },
    ]);
    expect(outcome).toEqual({
      tasks: 105,
      active: 5,
      resolved: 100,
      returned: 10,
      returnedCredits: 110,
      failureRate: 0.1,
    });
  });

  it("sem tarefa encerrada não inventa taxa", () => {
    expect(aiTaskOutcome([{ status: "active", total: 3 }]).failureRate).toBeNull();
    expect(aiTaskOutcome([]).failureRate).toBeNull();
  });
});

describe("aviso do Stripe que precisa de reenvio", () => {
  it("vira reenvio manual depois dos três dias do Stripe", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    expect(webhookNeedsResend(new Date("2026-10-15T12:00:00Z"), now)).toBe(false);
    expect(webhookNeedsResend(new Date("2026-10-14T11:59:00Z"), now)).toBe(true);
  });
});
