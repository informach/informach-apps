import { describe, expect, it } from "vitest";
import { OVERDUE_STATUSES } from "../money/logic";
import {
  banEndsAt,
  bannedMessage,
  composeReason,
  countLiveSessions,
  cozyaDemoDay,
  currentSubscription,
  describeEvent,
  describeSubscription,
  describeTimeline,
  describeUserAgent,
  emailCategoryLabel,
  emailStatus,
  isBanActive,
  joinNames,
  likePattern,
  parsePeopleFilters,
  peopleQuery,
  planLabel,
  planScope,
  productIn,
  type SubscriptionFacts,
  sessionsRevokedMessage,
  shouldRecordView,
} from "./service";

const now = new Date("2026-10-17T15:00:00Z");

function sub(partial: Partial<SubscriptionFacts>): SubscriptionFacts {
  return {
    status: "active",
    productId: "cozya_pro_annual",
    currentPeriodStart: new Date("2026-10-12T12:00:00Z"),
    currentPeriodEnd: new Date("2027-03-03T12:00:00Z"),
    cancelAtPeriodEnd: null,
    pendingProductId: null,
    canceledAt: null,
    confirmedAt: new Date("2026-03-03T12:00:00Z"),
    trialEnd: null,
    createdAt: new Date("2026-03-03T12:00:00Z"),
    updatedAt: new Date("2026-10-12T12:00:00Z"),
    ...partial,
  };
}

describe("filtros de Pessoas", () => {
  it("lê só valores conhecidos e limita a página", () => {
    expect(
      parsePeopleFilters({
        q: "  marina ",
        produto: "cozya",
        situacao: "atraso",
        conta: "x",
        pagina: "3",
      }),
    ).toEqual({ q: "marina", product: "cozya", plan: "atraso", account: null, page: 3 });
    expect(parsePeopleFilters({ produto: "sistema-zero", pagina: "-2" })).toMatchObject({
      product: null,
      page: 1,
    });
  });

  it("monta a query mantendo os filtros e sem página 1", () => {
    const filters = parsePeopleFilters({ q: "a@b.c", conta: "banida", pagina: "2" });
    expect(peopleQuery(filters, { page: 1 })).toBe("?q=a%40b.c&conta=banida");
    expect(peopleQuery(filters)).toBe("?q=a%40b.c&conta=banida&pagina=2");
    expect(peopleQuery({ q: "", product: null, plan: null, account: null, page: 1 })).toBe("");
  });

  it("escapa curingas do ILIKE", () => {
    expect(likePattern("50%_off")).toBe("%50\\%\\_off%");
  });

  it("procura a situação dentro do produto filtrado", () => {
    // A mesma definição de atraso do Painel e de Dinheiro.
    expect(planScope("atraso", "agenda-da-turma").statuses).toEqual([...OVERDUE_STATUSES]);
    expect(planScope("atraso", "agenda-da-turma")).toEqual({
      statuses: ["past_due", "unpaid"],
      without: false,
      app: "agenda-da-turma",
      cozyaDemo: false,
    });
    expect(planScope("assinante", null)).toMatchObject({ statuses: ["active"], app: null });
    // Grátis no Cozya: sem assinatura paga ou em teste no Cozya, mesmo assinando outro produto.
    expect(planScope("gratis", "cozya")).toMatchObject({ without: true, app: "cozya" });
  });

  it("conta a demonstração do Cozya como teste só no Cozya ou sem produto", () => {
    expect(planScope("teste", null).cozyaDemo).toBe(true);
    expect(planScope("teste", "cozya").cozyaDemo).toBe(true);
    expect(planScope("teste", "missao-saber")).toEqual({
      statuses: ["trialing"],
      without: false,
      app: "missao-saber",
      cozyaDemo: false,
    });
    expect(planScope("assinante", "cozya").cozyaDemo).toBe(false);
  });
});

describe("planos", () => {
  it("nomeia pelo catálogo", () => {
    expect(planLabel("cozya_pro_annual")).toBe("Pro anual");
    expect(planLabel("missao_family_monthly")).toBe("Família mensal");
    expect(planLabel("produto_que_nao_existe")).toBe("produto_que_nao_existe");
  });

  it("assinante ativo mostra desde quando e a renovação com o preço de tabela, só para owner", () => {
    const owner = describeSubscription(sub({}), { showPrice: true });
    expect(owner.kind).toBe("assinante");
    expect(owner.tone).toBe("ok");
    expect(owner.line).toContain("Renova em 3 de março de 2027");
    expect(owner.line).toMatch(/R\$\s149 por ano$/);
    // Preço de tabela é valor de receita: admin e o padrão não veem.
    const admin = describeSubscription(sub({}));
    expect(admin.line).toContain("Renova em 3 de março de 2027");
    expect(admin.line).not.toMatch(/R\$/);
  });

  it("past_due nunca é Pro e diz desde quando", () => {
    const state = describeSubscription(sub({ status: "past_due" }));
    expect(state.kind).toBe("atraso");
    expect(state.tone).toBe("bad");
    expect(state.line).toContain("Pagamento em atraso desde 12 de outubro");
  });

  it("teste, cancelamento agendado e cancelada", () => {
    expect(
      describeSubscription(sub({ status: "trialing", trialEnd: new Date("2026-10-20T12:00:00Z") }))
        .line,
    ).toBe("Em teste até 20 de outubro");
    const scheduled = describeSubscription(
      sub({ cancelAtPeriodEnd: new Date("2027-03-03T12:00:00Z") }),
    );
    expect(scheduled.tone).toBe("warn");
    expect(scheduled.short).toBe("Pro anual, cancelamento agendado");
    // Pode ter sido a pessoa no app ou a equipe no Stripe: a frase não diz quem.
    expect(scheduled.line).toBe("Cancelamento agendado, vale até 3 de março");
    expect(
      describeSubscription(
        sub({ status: "canceled", canceledAt: new Date("2026-09-01T12:00:00Z") }),
      ).kind,
    ).toBe("cancelada");
  });

  it("troca de plano agendada não é cancelamento", () => {
    const state = describeSubscription(
      sub({
        cancelAtPeriodEnd: new Date("2027-03-03T12:00:00Z"),
        pendingProductId: "cozya_pro_monthly",
      }),
    );
    expect(state.kind).toBe("assinante");
    expect(state.tone).toBe("info");
    expect(state.short).toBe("Pro anual, troca para Pro mensal em 3 de março");
    expect(state.line).toBe(
      "Troca para Pro mensal em 3 de março de 2027. Até lá, continua no plano Pro anual.",
    );
    expect(`${state.short} ${state.line}`).not.toMatch(/cancel/i);
  });

  it("escolhe a assinatura que dá acesso antes da mais nova cancelada", () => {
    const current = currentSubscription([
      sub({ status: "canceled", createdAt: new Date("2026-10-01T00:00:00Z") }),
      sub({ status: "active", createdAt: new Date("2026-01-01T00:00:00Z") }),
    ]);
    expect(current?.status).toBe("active");
    expect(currentSubscription([])).toBeNull();
  });

  it("depois da troca agendada, mostra o plano novo e não a assinatura antiga cancelada", () => {
    const old = sub({
      status: "canceled",
      productId: "cozya_pro_annual",
      canceledAt: new Date("2027-03-03T12:00:00Z"),
      createdAt: new Date("2026-03-03T12:00:00Z"),
    });
    for (const status of ["active", "past_due", "incomplete"]) {
      const replacement = sub({
        status,
        productId: "cozya_pro_monthly",
        createdAt: new Date("2027-03-03T12:00:05Z"),
      });
      const current = currentSubscription([old, replacement]);
      expect(current?.productId).toBe("cozya_pro_monthly");
      expect(current && describeSubscription(current).kind).not.toBe("cancelada");
    }
  });

  it("conta o dia da demonstração do Cozya só dentro dos 14 dias", () => {
    expect(cozyaDemoDay(new Date("2026-10-09T16:00:00Z"), now)).toBe(8);
    expect(cozyaDemoDay(new Date("2026-09-01T00:00:00Z"), now)).toBeNull();
    expect(cozyaDemoDay(null, now)).toBeNull();
  });
});

describe("sessões e e-mails", () => {
  it("resume o navegador e o sistema, sem mais nada", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile",
      ),
    ).toBe("Chrome no Android");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1",
      ),
    ).toBe("Safari no iPad");
    expect(
      describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Edg/130.0"),
    ).toBe("Edge no Windows");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0; rv:131.0) Gecko Firefox/131.0",
      ),
    ).toBe("Firefox no Mac");
    expect(describeUserAgent(null)).toBe("Aparelho não identificado");
    expect(describeUserAgent("curl/8.0")).toBe("Aparelho não identificado");
  });

  it("dá nome às categorias e às situações de envio", () => {
    expect(emailCategoryLabel("auth.sign-in-otp")).toBe("Código de acesso");
    expect(emailCategoryLabel("auth.two-factor-setup-otp")).toBe(
      "Código para ativar as duas etapas",
    );
    expect(emailCategoryLabel("categoria.nova")).toBe("E-mail do sistema");
    expect(emailStatus("failed", new Date())).toEqual({ label: "Tentando de novo", tone: "warn" });
    expect(emailStatus("failed", null).tone).toBe("bad");
    expect(emailStatus("dropped", null).label).toBe("Bloqueado pelo SendGrid");
  });
});

describe("linha do tempo", () => {
  const subject = "user-marina";
  const names = (id: string) => (id === "staff-helena" ? "Helena" : null);
  const event = (
    eventType: string,
    payload: Record<string, unknown>,
    actorId: string | null = subject,
  ) => ({
    id: "e1",
    eventType,
    actorId,
    payload,
    createdAt: now,
  });

  it("nunca mostra e-mail, IP ou texto do payload", () => {
    const created = describeEvent(
      event("user.created", { email: "marina@exemplo.com.br" }),
      subject,
      names,
    );
    const session = describeEvent(
      event("session.created", {
        sessionId: "s1",
        ipAddress: "203.0.113.9",
        userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130",
      }),
      subject,
      names,
    );
    expect(JSON.stringify([created, session])).not.toMatch(/marina@|203\.0\.113/);
    expect(session.detail).toBe("Chrome no Android");
  });

  it("atribui ações da equipe a quem agiu, com o motivo", () => {
    const entry = describeEvent(
      event(
        "admin.sessions_revoked",
        {
          targetId: subject,
          count: 3,
          apps: ["cozya", "agenda-da-turma", "missao-saber", "bora-treinar"],
          reason: "A pessoa pediu pelo direct",
        },
        "staff-helena",
      ),
      subject,
      names,
    );
    expect(entry.title).toBe("Helena encerrou 3 sessões em todos os produtos");
    const offline = describeEvent(
      event("admin.sessions_revoked", { targetId: subject, count: 0, apps: [] }, "staff-helena"),
      subject,
      names,
    );
    expect(offline.title).toBe(
      "Helena encerrou 0 sessões (sem alcançar Cozya, Agenda da Turma, Missão Saber e Bora Treinar)",
    );
    expect(entry.detail).toBe("Motivo: A pessoa pediu pelo direct");
    expect(entry.otherPersonId).toBeNull();
  });

  it("aponta a outra conta quando a pessoa agiu sobre alguém", () => {
    const entry = describeEvent(
      event("user.banned", { targetId: "user-rafael", reason: "Fraude" }),
      subject,
      names,
    );
    expect(entry.title).toBe("Baniu outra conta");
    expect(entry.otherPersonId).toBe("user-rafael");
  });

  it("usa o produto do catálogo e o gênero certo do nome", () => {
    expect(
      describeEvent(event("billing.credits_granted", { amount: 10, app: "cozya" }), subject, names)
        .title,
    ).toBe("Recebeu 10 créditos de IA no Cozya");
    expect(productIn("agenda-da-turma")).toBe("na Agenda da Turma");
    expect(productIn("bora-treinar")).toBe("no Bora Treinar");
    expect(
      describeEvent(
        event(
          "admin.verification_resent",
          { targetId: subject, app: "missao-saber" },
          "staff-helena",
        ),
        subject,
        names,
      ).title,
    ).toBe("Helena reenviou o código de confirmação pela Missão Saber");
  });

  it("evento desconhecido vira registro técnico, sem payload", () => {
    const entry = describeEvent(event("novo.evento", { segredo: "x" }), subject, names);
    expect(entry.title).toBe("Registro técnico");
    expect(entry.detail).toBe("novo.evento");
  });

  it("a troca de plano agendada não aparece como cancelamento nem como assinatura nova", () => {
    const customerId = "c2f0c3c4-0000-4000-8000-000000000001";
    const timeline = describeTimeline(
      [
        // Mais recente primeiro, como vem do banco.
        event(
          "billing.subscription_created",
          {
            subscriptionId: "sub_novo",
            customerId,
            productId: "cozya_pro_monthly",
            status: "active",
          },
          null,
        ),
        event(
          "billing.subscription_created",
          {
            subscriptionId: "sub_novo",
            customerId,
            productId: "cozya_pro_monthly",
            previousSubscriptionId: "sub_antigo",
            reason: "scheduled_downgrade",
          },
          null,
        ),
        event(
          "billing.subscription_canceled",
          {
            subscriptionId: "sub_antigo",
            customerId,
            productId: "cozya_pro_annual",
            status: "canceled",
          },
          null,
        ),
        event("billing.subscription_updated", {
          subscriptionId: "local-1",
          providerSubscriptionId: "sub_antigo",
          oldProductId: "cozya_pro_annual",
          newProductId: "cozya_pro_monthly",
          mode: "schedule_at_period_end",
          appliesAt: "2027-03-03T12:00:00.000Z",
        }),
      ],
      subject,
      names,
    );
    expect(timeline.map((entry) => entry.title)).toEqual([
      "O Stripe confirmou a assinatura do plano novo",
      "A troca de plano agendada começou a valer",
      "O plano anterior terminou para dar lugar ao novo",
      "Agendou a troca de plano",
    ]);
    expect(timeline[3]?.detail).toBe("Cozya, Pro mensal, a partir de 3 de março");
    expect(timeline.map((entry) => entry.title).join(" ")).not.toMatch(/cancel|Assinou/);
  });

  it("mostra o plano novo da troca feita pelo app e o fim de uma assinatura de verdade", () => {
    const immediate = describeEvent(
      event("billing.subscription_updated", {
        subscriptionId: "local-1",
        oldProductId: "missao_individual_monthly",
        newProductId: "missao_family_monthly",
        mode: "immediate",
      }),
      subject,
      names,
    );
    expect(immediate).toMatchObject({
      title: "Trocou de plano",
      detail: "Missão Saber, Família mensal",
    });
    expect(
      describeEvent(
        event("billing.subscription_updated", { subscriptionId: "local-1", reason: "reactivated" }),
        subject,
        names,
      ).title,
    ).toBe("Desfez o cancelamento agendado da assinatura");
    expect(
      describeEvent(
        event("billing.subscription_canceled", {
          subscriptionId: "local-1",
          atPeriodEnd: true,
          reason: "user_requested",
        }),
        subject,
        names,
      ).title,
    ).toBe("Agendou o cancelamento da assinatura");
    // Aviso do Stripe sem troca agendada por trás: terminou, sem dizer quem pediu.
    expect(
      describeEvent(
        event(
          "billing.subscription_canceled",
          {
            subscriptionId: "sub_x",
            customerId: "c1",
            productId: "cozya_pro_annual",
            status: "canceled",
          },
          null,
        ),
        subject,
        names,
      ),
    ).toMatchObject({ title: "A assinatura terminou", detail: "Cozya, Pro anual" });
    expect(
      describeEvent(
        event(
          "billing.subscription_canceled",
          { reason: "lgpd_account_deletion", subjectType: "user", subjectId: subject, canceled: 1 },
          null,
        ),
        subject,
        names,
      ).title,
    ).toBe("As assinaturas foram canceladas com a exclusão da conta");
  });

  it("créditos devolvidos são débito depois de um reembolso no Stripe", () => {
    expect(
      describeEvent(
        event("billing.credits_refunded", { amount: 10, app: "cozya", ownerId: subject }, null),
        subject,
        names,
      ).title,
    ).toBe("10 créditos de IA foram retirados no Cozya depois de um reembolso no Stripe");
    expect(
      describeEvent(event("billing.credits_refunded", { amount: -1 }, null), subject, names).title,
    ).toBe("1 crédito de IA foi retirado depois de um reembolso no Stripe");
  });

  it("tentativa de cadastro com o e-mail desta conta foi feita por outra pessoa", () => {
    // O pacote grava a conta existente como autora.
    const entry = describeEvent(
      event("auth.signup_attempt_on_existing", { emailDomain: "exemplo.com.br" }),
      subject,
      names,
    );
    expect(entry.title).toBe("Alguém tentou criar uma conta nova com o e-mail desta conta");
    expect(JSON.stringify(entry)).not.toContain("exemplo.com.br");
  });

  it("conta excluída que agiu aparece como excluída, não como a equipe", () => {
    expect(
      describeEvent(
        event("user.banned", { targetId: subject, reason: "Fraude" }, "conta-que-sumiu"),
        subject,
        names,
      ).title,
    ).toBe("Uma conta excluída baniu a conta");
    expect(
      describeEvent(
        event(
          "user.role_changed",
          { targetId: subject, newRole: "owner", source: "bootstrap-owner" },
          null,
        ),
        subject,
        names,
      ).title,
    ).toBe("O script do primeiro owner mudou o papel desta conta para owner");
  });
});

describe("ações", () => {
  it("grava a consulta de novo só depois de 10 minutos", () => {
    expect(shouldRecordView(null, now)).toBe(true);
    expect(shouldRecordView(new Date(now.getTime() - 9 * 60_000), now)).toBe(false);
    expect(shouldRecordView(new Date(now.getTime() - 10 * 60_000), now)).toBe(true);
  });

  it("monta o motivo com a nota e exige texto em outro motivo", () => {
    expect(composeReason("Fraude no pagamento", "  cartão   de terceiro ")).toBe(
      "Fraude no pagamento: cartão de terceiro",
    );
    expect(composeReason("Conta de teste", undefined)).toBe("Conta de teste");
    expect(composeReason("Outro motivo", "")).toBe("");
  });

  it("calcula o fim do banimento e se ele vale", () => {
    expect(banEndsAt("7", now)?.toISOString()).toBe("2026-10-24T15:00:00.000Z");
    expect(banEndsAt("sempre", now)).toBeNull();
    expect(isBanActive(true, null, now)).toBe(true);
    expect(isBanActive(true, new Date("2026-10-01T00:00:00Z"), now)).toBe(false);
    expect(isBanActive(false, null, now)).toBe(false);
  });

  it("é honesto sobre o cache em cookie e sobre o Redis fora", () => {
    const message = sessionsRevokedMessage({
      databaseCount: 1,
      perApp: [
        { name: "Cozya", count: 2, cookieCacheMinutes: 5 },
        { name: "Agenda da Turma", count: 0, cookieCacheMinutes: 5 },
        { name: "Missão Saber", count: null, cookieCacheMinutes: 0 },
      ],
    });
    expect(message).toBe(
      "3 sessões encerradas. Cozya pode levar até 5 minutos para pedir a entrada de novo. Não deu para alcançar Missão Saber: as sessões de lá continuam abertas. Tente encerrar as sessões de novo em alguns minutos.",
    );
    expect(sessionsRevokedMessage({ databaseCount: 0, perApp: [] })).toBe(
      "Não havia sessão aberta.",
    );
    expect(joinNames(["Cozya", "Agenda da Turma", "Missão Saber"])).toBe(
      "Cozya, Agenda da Turma e Missão Saber",
    );
  });

  it("diz quando o Postgres ou os aparelhos confiados falharam, sem contar o que não saiu", () => {
    const message = sessionsRevokedMessage({
      databaseCount: null,
      trustedDevices: null,
      perApp: [{ name: "Cozya", count: 1, cookieCacheMinutes: 5 }],
    });
    expect(message).toBe(
      "1 sessão encerrada. Cozya pode levar até 5 minutos para pedir a entrada de novo. Não deu para encerrar as sessões do Bastidores e da Suíte Edi no navegador: elas continuam abertas. Não deu para apagar os aparelhos confiados das duas etapas. Tente encerrar as sessões de novo em alguns minutos.",
    );
  });

  it("conta como encerradas só as sessões que estavam valendo", () => {
    expect(
      countLiveSessions(
        [
          { expiresAt: new Date("2026-10-17T16:00:00Z") },
          { expiresAt: new Date("2026-10-17T15:00:00Z") },
          { expiresAt: new Date("2026-10-01T00:00:00Z") },
        ],
        now,
      ),
    ).toBe(1);
  });

  it("banimento gravado nunca vira 'nada foi alterado', e diz o que faltou", () => {
    const audited = "O registro entrou na auditoria em seu nome.";
    const complete = bannedMessage({
      period: "por 7 dias",
      audited,
      revoke: {
        databaseCount: 0,
        trustedDevices: 0,
        perApp: [{ name: "Cozya", count: 2, cookieCacheMinutes: 5 }],
      },
    });
    expect(complete.incomplete).toBe(false);
    expect(complete.message).toBe(
      "Conta banida por 7 dias. A pessoa sai de todos os produtos; no Cozya e na Agenda da Turma isso pode levar até 5 minutos. Assinaturas não foram canceladas: se for o caso, cancele no Stripe. O registro entrou na auditoria em seu nome.",
    );

    const postgresDown = bannedMessage({
      period: "por 7 dias",
      audited,
      revoke: { databaseCount: null, trustedDevices: null, perApp: [] },
    });
    expect(postgresDown.incomplete).toBe(true);
    expect(postgresDown.message).toMatch(/^Conta banida por 7 dias\. /);
    expect(postgresDown.message).toContain(
      "Não deu para encerrar as sessões do Bastidores e da Suíte Edi no navegador",
    );
    expect(postgresDown.message).not.toContain("Nada foi alterado");

    const nothing = bannedMessage({ period: "sem data para acabar", audited, revoke: null });
    expect(nothing.incomplete).toBe(true);
    expect(nothing.message).toContain("Conta banida sem data para acabar.");
    expect(nothing.message).toContain('Use "Encerrar sessões" em alguns minutos.');
    expect(nothing.message).toContain(audited);
  });
});
