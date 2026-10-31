import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";
import {
  BILLING_CUSTOMER_PAYLOAD_KEY,
  exportReturnPath,
  filtersQuery,
  GROUP_MATCH,
  groupOf,
  PERSON_PAYLOAD_KEYS,
  parseAuditFilters,
  periodStart,
} from "./filters";
import {
  type AuditEventInput,
  describeEvent,
  describeEvents,
  eventPeople,
  type Person,
  peopleIdsOf,
  sentenceText,
} from "./humanize";

const helena: Person = { id: "u-helena", name: "Helena", staff: true };
const marina: Person = { id: "u-marina", name: "Marina Duarte", staff: false };
const people = new Map([helena, marina].map((person) => [person.id, person]));

function event(
  eventType: string,
  actorId: string | null,
  payload: Record<string, unknown>,
): AuditEventInput {
  return {
    id: `e-${eventType}`,
    eventType,
    actorId,
    payload,
    createdAt: new Date("2026-10-17T14:35:00Z"),
  };
}

describe("frases da auditoria", () => {
  it("descreve as ações da equipe com quem agiu e sobre quem", () => {
    const viewed = describeEvent(
      event("admin.user_viewed", "u-helena", { targetId: "u-marina" }),
      people,
    );
    expect(viewed.actor).toEqual({ kind: "staff", label: "Helena", id: "u-helena" });
    expect(sentenceText(viewed.parts)).toBe("Abriu a ficha de Marina Duarte");
    expect(viewed.parts).toContainEqual({ kind: "person", id: "u-marina", name: "Marina Duarte" });
    expect(viewed.team).toBe(true);

    const revoked = describeEvent(
      event("admin.sessions_revoked", "u-helena", {
        targetId: "u-marina",
        count: 3,
        apps: ["cozya", "agenda-da-turma", "missao-saber", "bora-treinar"],
        reason: "pedido pelo direct",
      }),
      people,
    );
    expect(sentenceText(revoked.parts)).toBe(
      "Encerrou as sessões de Marina Duarte em todos os produtos, 3 sessões, motivo: pedido pelo direct",
    );

    // Redis fora do alcance: a frase diz onde não chegou, em vez de "todos os produtos".
    const partial = describeEvent(
      event("admin.sessions_revoked", "u-helena", {
        targetId: "u-marina",
        count: 0,
        apps: ["cozya"],
      }),
      people,
    );
    expect(sentenceText(partial.parts)).toBe(
      "Encerrou as sessões de Marina Duarte (sem alcançar Agenda da Turma, Missão Saber e Bora Treinar), 0 sessões",
    );
  });

  it("diz em qual app a pessoa entrou quando o evento traz o nome do app", () => {
    const where = (appName: unknown) =>
      sentenceText(describeEvent(event("session.created", "u-marina", { appName }), people).parts);
    expect(where("Bastidores")).toBe("Entrou no Bastidores");
    expect(where("Agenda da Turma")).toBe("Entrou na Agenda da Turma");
    expect(where("Cozya")).toBe("Entrou no Cozya");
    expect(where("<script>")).toBe("Entrou em um produto");
    expect(where(undefined)).toBe("Entrou em um produto");
  });

  it("nunca coloca e-mail, IP ou valores livres do payload na frase", () => {
    const created = describeEvent(
      event("user.created", "u-marina", { email: "marina@example.test" }),
      people,
    );
    const session = describeEvent(
      event("session.created", "u-marina", { ipAddress: "203.0.113.9", userAgent: "Mozilla" }),
      people,
    );
    for (const described of [created, session]) {
      const text = sentenceText(described.parts);
      expect(text).not.toContain("marina@example.test");
      expect(text).not.toContain("203.0.113.9");
      expect(text).not.toContain("Mozilla");
    }
    // Os nomes dos campos aparecem; os valores não.
    expect(created.fields).toEqual(["email"]);
  });

  it("dá nome a quem age sem conta e ao script do primeiro owner", () => {
    expect(
      describeEvent(event("billing.payment_failed", null, { app: "cozya", attempt: 2 }), people)
        .actor.label,
    ).toBe("Stripe");
    const failed = describeEvent(
      event("billing.payment_failed", null, { app: "cozya", attempt: 2 }),
      people,
    );
    expect(sentenceText(failed.parts)).toBe("Cobrança recusada no Cozya, tentativa 2");
    // Payload gravado por `scripts/bootstrap-owner.ts`.
    const role = describeEvent(
      event("user.role_changed", null, {
        targetId: "u-helena",
        previousRole: "member",
        newRole: "owner",
        source: "bootstrap-owner",
      }),
      people,
    );
    expect(role.actor).toEqual({ kind: "system", label: "Script do primeiro owner", id: null });
    expect(sentenceText(role.parts)).toBe("Mudou o papel de Helena para owner");
    expect(role.team).toBe(true);
    const emergency = describeEvent(
      event("user.role_changed", null, {
        targetId: "u-helena",
        newRole: "owner",
        source: "bootstrap-owner:emergencia",
      }),
      people,
    );
    expect(emergency.actor.label).toBe("Script de emergência do owner");
    // O nome antigo do script não existe mais.
    expect(
      describeEvent(
        event("user.role_changed", null, { targetId: "u-helena", source: "grant-role-script" }),
        people,
      ).actor.label,
    ).toBe("Sistema");
  });

  it("usa o nome da categoria de e-mail e um texto neutro para conta desconhecida", () => {
    const failed = describeEvent(
      event("email.delivery_failed", null, { category: "auth.sign-in-otp" }),
      people,
    );
    expect(sentenceText(failed.parts)).toBe("Um e-mail de código de acesso falhou");
    const unknown = describeEvent(
      event("user.banned", "u-helena", { targetId: "u-sumiu" }),
      people,
    );
    expect(sentenceText(unknown.parts)).toBe("Baniu uma conta excluída");
    // Sem link para uma ficha que não existe.
    expect(unknown.parts.some((part) => part.kind === "person")).toBe(false);
    const other = describeEvent(event("novo.evento", null, {}), people);
    expect(sentenceText(other.parts)).toContain("sem descrição");
  });

  it("conta excluída que agiu aparece como excluída, sem link e sem passar por pessoa", () => {
    const described = describeEvent(
      event("session.created", "u-excluida", { appName: "Cozya" }),
      people,
    );
    expect(described.actor).toEqual({ kind: "deleted", label: "Conta excluída", id: null });
  });

  it("tentativa de cadastro: quem tentou é alguém, a conta existente é o alvo", () => {
    const attempt = event("auth.signup_attempt_on_existing", "u-marina", {
      emailDomain: "example.test",
    });
    const described = describeEvent(attempt, people);
    expect(described.actor).toEqual({ kind: "system", label: "Alguém", id: null });
    expect(sentenceText(described.parts)).toBe(
      "Tentou criar uma conta nova com o e-mail de Marina Duarte",
    );
    expect(described.parts).toContainEqual({
      kind: "person",
      id: "u-marina",
      name: "Marina Duarte",
    });
    expect(eventPeople(attempt)).toEqual({ actorId: null, targetId: "u-marina" });
    expect(peopleIdsOf([attempt])).toEqual(["u-marina"]);
  });

  it("cancelamento sem conta diz de onde veio, sem pôr a culpa no Stripe", () => {
    const webhook = describeEvent(
      event("billing.subscription_canceled", null, {
        subscriptionId: "sub_1",
        customerId: "c-1",
        productId: "cozya_pro_annual",
        status: "canceled",
      }),
      people,
    );
    expect(webhook.actor.label).toBe("Aviso do Stripe");
    expect(sentenceText(webhook.parts)).toBe(
      "Cancelamento registrado no Cozya, a assinatura terminou",
    );
    const lgpd = describeEvent(
      event("billing.subscription_canceled", null, {
        reason: "lgpd_account_deletion",
        subjectType: "user",
        subjectId: "u-marina",
        canceled: 2,
        failed: 0,
      }),
      people,
    );
    expect(lgpd.actor.label).toBe("Exclusão da conta");
    expect(sentenceText(lgpd.parts)).toBe(
      "Assinaturas canceladas pela exclusão da conta (2 canceladas)",
    );
    const byApp = describeEvent(
      event("billing.subscription_canceled", "u-marina", {
        subscriptionId: "local-1",
        providerSubscriptionId: "sub_1",
        atPeriodEnd: true,
      }),
      people,
    );
    expect(sentenceText(byApp.parts)).toBe("Agendou o cancelamento da assinatura");
  });

  it("troca de plano mostra o plano novo, e a agendada não vira cancelamento", () => {
    const scheduled = describeEvent(
      event("billing.subscription_updated", "u-marina", {
        subscriptionId: "local-1",
        oldProductId: "cozya_pro_annual",
        newProductId: "cozya_pro_monthly",
        mode: "schedule_at_period_end",
        appliesAt: "2027-03-03T12:00:00.000Z",
      }),
      people,
    );
    expect(sentenceText(scheduled.parts)).toBe(
      "Agendou a troca de plano no Cozya para Pro mensal em 3 de março",
    );
    const immediate = describeEvent(
      event("billing.subscription_updated", "u-marina", {
        newProductId: "missao_family_annual",
        mode: "immediate",
      }),
      people,
    );
    expect(sentenceText(immediate.parts)).toBe(
      "Trocou de plano na Missão Saber para Família anual, na hora",
    );

    const [created, ended] = describeEvents(
      [
        event("billing.subscription_created", null, {
          subscriptionId: "sub_novo",
          productId: "cozya_pro_monthly",
          customerId: "c-1",
          previousSubscriptionId: "sub_antigo",
          reason: "scheduled_downgrade",
        }),
        event("billing.subscription_canceled", null, {
          subscriptionId: "sub_antigo",
          customerId: "c-1",
          productId: "cozya_pro_annual",
          status: "canceled",
        }),
      ],
      people,
    );
    expect(sentenceText(created?.parts ?? [])).toBe(
      "Troca de plano agendada aplicada no Cozya, agora Pro mensal",
    );
    expect(sentenceText(ended?.parts ?? [])).toBe(
      "Plano anterior encerrado pela troca agendada no Cozya",
    );
  });

  it("créditos devolvidos são débito depois de reembolso no Stripe", () => {
    const refunded = describeEvent(
      event("billing.credits_refunded", null, { app: "cozya", amount: 10, ownerId: "u-marina" }),
      people,
    );
    expect(sentenceText(refunded.parts)).toBe(
      "10 créditos de IA retirados no Cozya depois de um reembolso no Stripe",
    );
  });

  it("junta as pessoas citadas para buscar os nomes de uma vez", () => {
    expect(
      peopleIdsOf([
        event("admin.user_viewed", "u-helena", { targetId: "u-marina" }),
        event("user.banned", "u-helena", { targetUserId: "u-outra" }),
      ]).sort(),
    ).toEqual(["u-helena", "u-marina", "u-outra"]);
  });
});

describe("filtros da auditoria", () => {
  it("lê a URL com valores padrão seguros", () => {
    expect(parseAuditFilters({})).toEqual({ group: "tudo", period: "7d", person: "", page: 1 });
    expect(
      parseAuditFilters({ grupo: "equipe", periodo: "hoje", pessoa: " a@b.c ", pagina: "3" }),
    ).toEqual({
      group: "equipe",
      period: "hoje",
      person: "a@b.c",
      page: 3,
    });
    expect(parseAuditFilters({ grupo: "drop table", pagina: "-2" })).toMatchObject({
      group: "tudo",
      page: 1,
    });
  });

  it("monta a query sem os padrões", () => {
    const filters = parseAuditFilters({ grupo: "cobranca" });
    expect(filtersQuery(filters)).toBe("?grupo=cobranca");
    expect(filtersQuery(filters, { group: "tudo" })).toBe("");
  });

  it("classifica cada evento no grupo certo", () => {
    expect(groupOf("admin.audit_exported")).toBe("equipe");
    expect(groupOf("email.verified")).toBe("contas");
    expect(groupOf("user.created")).toBe("contas");
    expect(groupOf("email.delivery_sent")).toBe("emails");
    expect(groupOf("auth.two_factor_enabled")).toBe("sessoes");
    expect(groupOf("missao.profile_updated")).toBe("produtos");
    expect(groupOf("bora.custom_workout_saved")).toBe("produtos");
  });

  it("banir, desbanir e mudar papel entram em Ações da equipe e ficam em azul", () => {
    for (const type of ["user.banned", "user.unbanned", "user.role_changed"]) {
      expect(groupOf(type)).toBe("equipe");
      expect(GROUP_MATCH.equipe.exact).toContain(type);
      // O filtro Contas continua mostrando, pelo prefixo `user.`.
      expect(GROUP_MATCH.contas.prefixes.some((prefix) => type.startsWith(prefix))).toBe(true);
      const described = describeEvent(
        event(type, "u-helena", { targetId: "u-marina", newRole: "admin" }),
        people,
      );
      expect(described.team).toBe(true);
      expect(described.actor.kind).toBe("staff");
    }
    expect(describeEvent(event("user.created", "u-marina", {}), people).team).toBe(false);
  });

  it("o filtro por pessoa olha os campos de cobrança, além do alvo", () => {
    expect([...PERSON_PAYLOAD_KEYS].sort()).toEqual(
      ["ownerId", "subjectId", "targetId", "targetUserId", "userId"].sort(),
    );
    // Avisos de assinatura do Stripe só trazem o cliente de cobrança.
    expect(BILLING_CUSTOMER_PAYLOAD_KEY).toBe("customerId");
  });

  it("calcula o início do período", () => {
    const now = new Date("2026-10-17T15:00:00Z");
    const today = new Date("2026-10-17T03:00:00Z");
    expect(periodStart("hoje", now, today)).toEqual(today);
    expect(periodStart("7d", now, today)).toEqual(new Date("2026-10-10T15:00:00Z"));
    expect(periodStart("tudo", now, today)).toBeNull();
  });
});

describe("volta da exportação sem arquivo", () => {
  it("mantém os filtros e diz o motivo", () => {
    expect(exportReturnPath({ grupo: "equipe", periodo: "30d", pagina: "3" }, "falhou")).toBe(
      "/auditoria?grupo=equipe&periodo=30d&exportacao=falhou",
    );
    expect(exportReturnPath({}, "confirmar")).toBe("/auditoria?exportacao=confirmar");
  });

  it("não leva para a tela nada além dos filtros conhecidos", () => {
    expect(exportReturnPath({ grupo: "x", next: "//evil.example" }, "confirmar")).toBe(
      "/auditoria?exportacao=confirmar",
    );
  });
});

describe("CSV da exportação", () => {
  it("escapa aspas, vírgulas e quebras de linha", () => {
    expect(csvCell('diz "oi", tchau')).toBe('"diz ""oi"", tchau"');
    expect(csvCell("linha\nnova")).toBe('"linha\nnova"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("não deixa célula virar fórmula", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("=1,2")).toBe(`"'=1,2"`);
  });

  it("abre no Excel com acentos e linhas CRLF", () => {
    const csv = toCsv([
      ["a", "b"],
      ["ç", "é"],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("a,b\r\nç,é\r\n");
  });
});
