import { EMAIL_CATEGORIES } from "@informach/emails";
import { describe, expect, it } from "vitest";
import { emailCategoryLabel as operationsLabel } from "../operations/email-labels";
import { emailCategoryLabel as personLabel } from "../people/service";
import {
  type AttentionItem,
  attentionHeadline,
  barHeights,
  brDay,
  dailySeries,
  emailCategoryPhrase,
  joinPhrases,
  lostEmailsByCategory,
  routineAttention,
  seriesDescription,
  seriesTotal,
  sortAttention,
  stripeWebhookTitle,
} from "./logic";

describe("Precisa de você", () => {
  it("põe fora do ar antes de atenção e atenção antes de informação", () => {
    const items: AttentionItem[] = [
      { id: "info", tone: "info", title: "", detail: "" },
      { id: "warn-pequeno", tone: "warn", title: "", detail: "", weight: 1 },
      { id: "bad", tone: "bad", title: "", detail: "" },
      { id: "warn-grande", tone: "warn", title: "", detail: "", weight: 5 },
    ];
    expect(sortAttention(items).map((item) => item.id)).toEqual([
      "bad",
      "warn-grande",
      "warn-pequeno",
      "info",
    ]);
  });

  it("conta por extenso até dez e diz quando nada precisa de atenção", () => {
    expect(attentionHeadline(0)).toBe("Nada precisa de você agora.");
    expect(attentionHeadline(1)).toBe("Uma coisa precisa de você hoje.");
    expect(attentionHeadline(2)).toBe("Duas coisas precisam de você hoje.");
    expect(attentionHeadline(12)).toBe("12 coisas precisam de você hoje.");
  });

  it("junta as partes como numa frase", () => {
    expect(joinPhrases([])).toBe("");
    expect(joinPhrases(["2 no Cozya"])).toBe("2 no Cozya");
    expect(joinPhrases(["2 no Cozya", "1 na Agenda", "1 na Missão"])).toBe(
      "2 no Cozya, 1 na Agenda e 1 na Missão",
    );
  });

  it("dá nome humano às categorias de e-mail e cai no técnico quando não conhece", () => {
    expect(emailCategoryPhrase("auth.sign-in-otp", 4)).toBe("4 códigos de acesso");
    expect(emailCategoryPhrase("billing.payment-success", 1)).toBe("1 recibo");
    expect(emailCategoryPhrase("categoria.nova", 2)).toBe("2 de categoria.nova");
  });
});

describe("novas contas por dia", () => {
  // Sábado, 17 de outubro de 2026, 14:32 em Brasília.
  const now = new Date("2026-10-17T17:32:00Z");

  it("usa o dia de Brasília, não o do servidor", () => {
    expect(brDay(new Date("2026-10-18T02:00:00Z"))).toBe("2026-10-17");
  });

  it("completa os sete dias com zero e termina hoje", () => {
    const series = dailySeries(
      [
        { day: "2026-10-11", count: 6 },
        { day: "2026-10-14", count: 12 },
        { day: "2026-10-17", count: 10 },
      ],
      7,
      now,
    );
    expect(series.map((point) => point.day)).toEqual([
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
    ]);
    expect(series.map((point) => point.label)).toEqual([
      "dom",
      "seg",
      "ter",
      "qua",
      "qui",
      "sex",
      "sáb",
    ]);
    expect(series.map((point) => point.count)).toEqual([6, 0, 0, 12, 0, 0, 10]);
  });

  it("novas nos últimos 7 dias soma as barras, sem o pedaço do oitavo dia", () => {
    // A consulta pega desde agora menos 7 dias, que começa no meio do dia 10.
    const series = dailySeries(
      [
        { day: "2026-10-10", count: 4 },
        { day: "2026-10-11", count: 6 },
        { day: "2026-10-17", count: 10 },
      ],
      7,
      now,
    );
    expect(seriesTotal(series)).toBe(16);
  });

  it("descreve o gráfico em texto para leitor de tela", () => {
    const series = dailySeries([{ day: "2026-10-17", count: 3 }], 7, now);
    expect(seriesDescription("Novas contas por dia", series)).toBe(
      "Novas contas por dia, de domingo a sábado: 0, 0, 0, 0, 0, 0 e 3.",
    );
  });

  it("mostra um traço mínimo quando não há cadastro", () => {
    const empty = dailySeries([], 3, now);
    expect(barHeights(empty)).toEqual([4, 4, 4]);
    const some = dailySeries(
      [
        { day: "2026-10-16", count: 1 },
        { day: "2026-10-17", count: 4 },
      ],
      3,
      now,
    );
    expect(barHeights(some)).toEqual([4, 25, 100]);
  });
});

describe("e-mails que não chegaram", () => {
  it("conta só o que se perdeu, pela mesma regra de Operação", () => {
    const lost = lostEmailsByCategory([
      { category: "auth.sign-in-otp", status: "bounced", retryScheduled: false, count: 2 },
      { category: "auth.sign-in-otp", status: "failed", retryScheduled: false, count: 1 },
      // Ainda vai ser tentado de novo: não se perdeu.
      { category: "auth.sign-in-otp", status: "failed", retryScheduled: true, count: 5 },
      // Descadastro ou lista de bloqueio: bloqueado de propósito.
      { category: "agenda.routine", status: "skipped", retryScheduled: false, count: 7 },
      { category: "billing.payment-failed", status: "dropped", retryScheduled: false, count: 1 },
      { category: "auth.sign-in-otp", status: "delivered", retryScheduled: false, count: 40 },
    ]);
    expect(lost).toEqual([
      { category: "auth.sign-in-otp", total: 3 },
      { category: "billing.payment-failed", total: 1 },
    ]);
  });
});

describe("avisos do Stripe no Precisa de você", () => {
  it("conta todos, não só a página da lista, e diz quando precisa reenviar", () => {
    expect(stripeWebhookTitle({ total: 45, needsResend: 30, attempts: 1 })).toBe(
      "45 avisos do Stripe não foram processados.",
    );
    expect(stripeWebhookTitle({ total: 1, needsResend: 1, attempts: 4 })).toBe(
      "Um aviso do Stripe precisa ser reenviado pelo Stripe.",
    );
    expect(stripeWebhookTitle({ total: 1, needsResend: 0, attempts: 3 })).toBe(
      "Um aviso do Stripe falhou 3 vezes.",
    );
    expect(stripeWebhookTitle({ total: 1, needsResend: 0, attempts: 1 })).toBe(
      "Um aviso do Stripe não foi processado.",
    );
  });
});

describe("rotinas no Precisa de você", () => {
  const ok = { app: "cozya", label: "Reenviar e-mails que falharam", state: "ok" };

  it("não aparece quando tudo está em dia, rodando ou parado de propósito", () => {
    expect(
      routineAttention([ok, { ...ok, state: "running" }, { ...ok, state: "paused" }]),
    ).toBeNull();
  });

  it("junta falha, parada no meio, atraso e nunca rodou num item só", () => {
    const item = routineAttention([
      ok,
      { app: "cozya", label: "Conciliar cobrança com o Stripe", state: "failed" },
      { app: "missao-saber", label: "Resumo semanal das famílias", state: "late" },
      { app: "admin", label: "Vigia dos serviços e avisos", state: "interrupted" },
      { app: "agenda-da-turma", label: "Rotina e lembretes da Agenda", state: "never" },
    ]);
    expect(item?.title).toBe("4 rotinas precisam de atenção");
    expect(item?.detail).toBe(
      "Conciliar cobrança com o Stripe no Cozya falhou, Resumo semanal das famílias na Missão Saber passou do prazo sem rodar, Vigia dos serviços e avisos no Bastidores parou no meio e mais 1 rotina. Os detalhes estão em Operação.",
    );
    expect(item?.href).toBe("/operacao");
  });

  it("usa o título da situação quando todas estão iguais", () => {
    const item = routineAttention([
      { app: "cozya", label: "Conciliar cobrança com o Stripe", state: "failed" },
      { app: "agenda-da-turma", label: "Conciliar cobrança com o Stripe", state: "failed" },
    ]);
    expect(item?.title).toBe("2 rotinas falharam");
  });
});

describe("rótulos das categorias de e-mail", () => {
  it("toda categoria do pacote tem nome no Painel, em Operação e na ficha", () => {
    for (const category of EMAIL_CATEGORIES) {
      expect(emailCategoryPhrase(category, 2), category).not.toContain(category);
      expect(operationsLabel(category), category).not.toBe("Outros e-mails");
      expect(personLabel(category), category).not.toBe("E-mail do sistema");
    }
    expect(emailCategoryPhrase("auth.two-factor-setup-otp", 2)).toBe(
      "2 códigos de ativação das duas etapas",
    );
    expect(operationsLabel("auth.two-factor-setup-otp")).toBe("Ativação das duas etapas");
  });
});
