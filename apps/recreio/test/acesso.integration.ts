import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  events as auditEvents,
  customers,
  recreioEntitlements as entitlements,
  recreioGroups as groups,
  recreioProfiles as profiles,
  subscriptions,
} from "@informach/db/schema";
import { ehErroDoRecreio, PerfilIdSchema } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { avaliarAcesso } from "@/features/acesso/service";
import { criarPerfilProprio } from "@/features/perfis/service";
import { conceder, RecusaDeConcessao, revogar } from "../scripts/concessoes";
import { type ContaDeTeste, novaConta } from "./apoio";

const DIA = 86_400_000;

async function contaComPerfil() {
  const conta = await novaConta();
  const { perfil } = await criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "sol" });
  return { conta, perfil };
}

/** Eventos de concessão gravados para uma conta, do mais antigo ao mais novo. */
function eventosDe(conta: ContaDeTeste) {
  return db
    .select({
      eventType: auditEvents.eventType,
      actorId: auditEvents.actorId,
      payload: auditEvents.payload,
    })
    .from(auditEvents)
    .where(sql`${auditEvents.payload}->>'targetId' = ${conta.id}`)
    .orderBy(auditEvents.createdAt);
}

function concessoesDe(grupoId: string) {
  return db.select().from(entitlements).where(eq(entitlements.groupId, grupoId));
}

/** Assinatura do Recreio para a conta, como o webhook da cobrança deixaria no banco. */
async function assinatura(
  conta: ContaDeTeste,
  status: "active" | "trialing" | "past_due" | "canceled",
  productId: string,
  extra: { cancelaEm?: Date } = {},
) {
  const [cliente] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_recreio_${randomUUID()}`,
      subjectType: "user",
      subjectId: conta.id,
      app: "recreio",
      email: conta.email,
    })
    .onConflictDoNothing()
    .returning();
  const [existente] = cliente
    ? [cliente]
    : await db
        .select()
        .from(customers)
        .where(and(eq(customers.subjectId, conta.id), eq(customers.app, "recreio")));
  if (!existente) throw new Error("Cliente de teste não criado");
  await db.insert(subscriptions).values({
    customerId: existente.id,
    provider: "stripe",
    providerSubscriptionId: `sub_recreio_${randomUUID()}`,
    productId,
    providerPriceId: "price_recreio_fixture",
    status,
    currentPeriodStart: new Date(Date.now() - DIA),
    currentPeriodEnd: new Date(Date.now() + 29 * DIA),
    cancelAtPeriodEnd: extra.cancelaEm ?? null,
  });
}

describe("direito de jogar por concessão", () => {
  it("sem concessão nem assinatura, não joga", async () => {
    const { perfil } = await contaComPerfil();
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "SEM_ACESSO",
      podeJogar: false,
      motivo: "sem_plano",
      limiteDePerfis: 0,
    });
  });

  it("concessão família deixa ATIVO com quatro perfis, até a data do fim", async () => {
    const { conta, perfil } = await contaComPerfil();
    const feita = await conceder({
      email: conta.email.toUpperCase(),
      tier: "family",
      dias: 30,
      motivo: "alfa_equipe",
    });
    expect(feita.fim.getTime() - feita.inicio.getTime()).toBe(30 * DIA);
    expect(feita.grupoId).toBe(perfil.grupoId);
    expect(await avaliarAcesso({ profileId: perfil.id, gameId: "morada" })).toMatchObject({
      estado: "ATIVO",
      podeJogar: true,
      origem: "concessao",
      origemId: feita.concessaoId,
      limiteDePerfis: 4,
      validoAte: feita.fim,
      versaoDaPolitica: 1,
    });
  });

  it("concessão individual cobre um perfil: o segundo do grupo fica de fora", async () => {
    const { conta, perfil } = await contaComPerfil();
    await conceder({ email: conta.email, tier: "individual", dias: 7, motivo: "alfa_equipe" });
    const [segundo] = await db
      .insert(profiles)
      .values({ groupId: perfil.grupoId, kind: "minor", nickname: "Filha" })
      .returning({ id: profiles.id });
    if (!segundo) throw new Error("Perfil de teste não criado");
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "ATIVO",
      limiteDePerfis: 1,
    });
    const segundoId = PerfilIdSchema.parse(segundo.id);
    expect(await avaliarAcesso({ profileId: segundoId })).toMatchObject({
      estado: "SEM_ACESSO",
      podeJogar: false,
      motivo: "perfil_sem_cobertura",
    });
    // Com a cobertura do titular desligada, a vaga passa para o próximo.
    await db.update(profiles).set({ coverageEnabled: false }).where(eq(profiles.id, perfil.id));
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "SEM_ACESSO",
      motivo: "perfil_sem_cobertura",
    });
    expect(await avaliarAcesso({ profileId: segundoId })).toMatchObject({
      estado: "ATIVO",
      podeJogar: true,
    });
  });

  it("concessão vencida dá ENCERRADO, e uma nova pode ser concedida", async () => {
    const { conta, perfil } = await contaComPerfil();
    const antiga = await conceder(
      { email: conta.email, tier: "family", dias: 30, motivo: "alfa_equipe" },
      { agora: new Date(Date.now() - 40 * DIA) },
    );
    expect(antiga.fim.getTime()).toBeLessThan(Date.now());
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "ENCERRADO",
      podeJogar: false,
      motivo: "concessao_encerrada",
      validoAte: null,
    });
    await conceder({ email: conta.email, tier: "individual", dias: 5, motivo: "alfa_equipe" });
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "ATIVO",
      limiteDePerfis: 1,
    });
  });

  it("revogar dá REVOGADO na hora, guarda a linha e libera conceder de novo", async () => {
    const { conta, perfil } = await contaComPerfil();
    const feita = await conceder({
      email: conta.email,
      tier: "family",
      dias: 30,
      motivo: "alfa_equipe",
    });
    const desfeita = await revogar({ email: conta.email, motivo: "fim_do_alfa" });
    expect(desfeita.concessaoIds).toEqual([feita.concessaoId]);
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "REVOGADO",
      podeJogar: false,
      motivo: "concessao_revogada",
    });
    expect(await concessoesDe(feita.grupoId)).toMatchObject([
      {
        id: feita.concessaoId,
        kind: "courtesy",
        reasonCode: "alfa_equipe",
        revokedAt: desfeita.revogadaEm,
        revokeReasonCode: "fim_do_alfa",
        grantedByUserId: null,
        revokedByUserId: null,
      },
    ]);
    // Não há mais concessão vigente: revogar de novo é recusado, conceder passa.
    await expect(revogar({ email: conta.email, motivo: "fim_do_alfa" })).rejects.toMatchObject({
      codigo: "SEM_CONCESSAO_VIGENTE",
    });
    await conceder({ email: conta.email, tier: "family", dias: 3, motivo: "alfa_equipe" });
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({ estado: "ATIVO" });
  });

  it("recusa a segunda concessão enquanto a primeira vale, mesmo pedidas juntas", async () => {
    const { conta } = await contaComPerfil();
    const pedido = { email: conta.email, tier: "family", dias: 30, motivo: "alfa_equipe" };
    const resultados = await Promise.allSettled([
      conceder(pedido),
      conceder(pedido),
      conceder(pedido),
    ]);
    const feitas = resultados.filter((resultado) => resultado.status === "fulfilled");
    const recusadas = resultados.filter(
      (resultado): resultado is PromiseRejectedResult => resultado.status === "rejected",
    );
    expect(feitas).toHaveLength(1);
    expect(recusadas).toHaveLength(2);
    for (const recusada of recusadas)
      expect(recusada.reason).toMatchObject({
        name: "RecusaDeConcessao",
        codigo: "CONCESSAO_VIGENTE",
      });
    await expect(conceder({ ...pedido, tier: "individual" })).rejects.toBeInstanceOf(
      RecusaDeConcessao,
    );
    const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, conta.id));
    expect(await concessoesDe(grupo?.id ?? "")).toHaveLength(1);
    expect(await eventosDe(conta)).toHaveLength(1);
  });

  it("exige conta existente e confirmada, e um pedido bem formado", async () => {
    const semConfirmar = await novaConta({ confirmada: false });
    await expect(
      conceder({ email: semConfirmar.email, tier: "family", dias: 30, motivo: "alfa_equipe" }),
    ).rejects.toMatchObject({ codigo: "EMAIL_NAO_CONFIRMADO" });
    await expect(
      conceder({
        email: `${randomUUID()}@example.test`,
        tier: "family",
        dias: 30,
        motivo: "alfa_equipe",
      }),
    ).rejects.toMatchObject({ codigo: "CONTA_NAO_ENCONTRADA" });
    const conta = await novaConta();
    const bom = { email: conta.email, tier: "family", dias: 30, motivo: "alfa_equipe" };
    for (const ruim of [
      { ...bom, tier: "gratis" },
      { ...bom, dias: 0 },
      { ...bom, dias: 367 },
      { ...bom, dias: 1.5 },
      { ...bom, dias: Number.NaN },
      { ...bom, motivo: "Pedido da Lia por e-mail" },
      { ...bom, motivo: "" },
      { ...bom, email: "sem-arroba" },
      { ...bom, extra: true },
    ])
      await expect(conceder(ruim)).rejects.toBeInstanceOf(ZodError);
    await expect(revogar({ email: conta.email, motivo: "com espaço" })).rejects.toBeInstanceOf(
      ZodError,
    );
    // Nenhuma das recusas deixou grupo, concessão ou evento para trás.
    expect(await db.select().from(groups).where(eq(groups.ownerUserId, conta.id))).toHaveLength(0);
    expect(
      await db.select().from(groups).where(eq(groups.ownerUserId, semConfirmar.id)),
    ).toHaveLength(0);
    expect(await eventosDe(conta)).toHaveLength(0);
  });
});

describe("concessão e auditoria andam juntas", () => {
  it("conceder e revogar gravam o evento com ids, plano, dias e motivo, sem e-mail", async () => {
    const conta = await novaConta();
    const feita = await conceder({
      email: conta.email,
      tier: "individual",
      dias: 30,
      motivo: "alfa_equipe",
    });
    await revogar({ email: conta.email, motivo: "fim_do_alfa" });
    const eventos = await eventosDe(conta);
    expect(eventos).toEqual([
      {
        eventType: "recreio.entitlement_granted",
        actorId: null,
        payload: {
          app: "recreio",
          entitlementId: feita.concessaoId,
          groupId: feita.grupoId,
          targetId: conta.id,
          tier: "individual",
          days: 30,
          reasonCode: "alfa_equipe",
        },
      },
      {
        eventType: "recreio.entitlement_revoked",
        actorId: null,
        payload: {
          app: "recreio",
          entitlementId: feita.concessaoId,
          groupId: feita.grupoId,
          targetId: conta.id,
          reasonCode: "fim_do_alfa",
        },
      },
    ]);
    expect(JSON.stringify(eventos)).not.toContain(conta.email);
    expect(JSON.stringify(eventos)).not.toContain("@");
  });

  it("se o evento não grava, a concessão e o grupo novo também não ficam", async () => {
    const conta = await novaConta();
    // O banco passa a recusar o evento de concessão: a falha é de verdade, na
    // mesma transação da linha.
    await db.execute(sql`
      create function audit.recusar_concessao_em_teste() returns trigger language plpgsql as $$
      begin
        if new.event_type in ('recreio.entitlement_granted', 'recreio.entitlement_revoked') then
          raise exception 'auditoria indisponível (teste)';
        end if;
        return new;
      end $$`);
    await db.execute(sql`
      create trigger recusar_concessao_em_teste before insert on audit.events
      for each row execute function audit.recusar_concessao_em_teste()`);
    try {
      await expect(
        conceder({ email: conta.email, tier: "family", dias: 30, motivo: "alfa_equipe" }),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(await db.select().from(groups).where(eq(groups.ownerUserId, conta.id))).toHaveLength(
        0,
      );
      expect(await eventosDe(conta)).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger recusar_concessao_em_teste on audit.events`);
    }

    // Com a auditoria de volta, a concessão entra, e a revogação sem evento é desfeita.
    const { perfil } = await criarPerfilProprio(conta.id, { apelido: "Lia", avatar: "sol" });
    const feita = await conceder({
      email: conta.email,
      tier: "family",
      dias: 30,
      motivo: "alfa_equipe",
    });
    await db.execute(sql`
      create trigger recusar_concessao_em_teste before insert on audit.events
      for each row execute function audit.recusar_concessao_em_teste()`);
    try {
      await expect(revogar({ email: conta.email, motivo: "fim_do_alfa" })).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
    } finally {
      await db.execute(sql`drop trigger recusar_concessao_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_concessao_em_teste()`);
    }
    expect(await concessoesDe(feita.grupoId)).toMatchObject([
      { id: feita.concessaoId, revokedAt: null, revokeReasonCode: null },
    ]);
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({ estado: "ATIVO" });
    expect((await eventosDe(conta)).map((evento) => evento.eventType)).toEqual([
      "recreio.entitlement_granted",
    ]);
  });

  it("se a linha da concessão não grava, nenhum evento nem grupo fica", async () => {
    const conta = await novaConta();
    await db.execute(sql`
      create function recreio.recusar_concessao_em_teste() returns trigger language plpgsql as $$
      begin
        raise exception 'concessão indisponível (teste)';
      end $$`);
    await db.execute(sql`
      create trigger recusar_concessao_em_teste before insert on recreio.entitlements
      for each row execute function recreio.recusar_concessao_em_teste()`);
    try {
      await expect(
        conceder({ email: conta.email, tier: "family", dias: 30, motivo: "alfa_equipe" }),
      ).rejects.toThrow();
    } finally {
      await db.execute(sql`drop trigger recusar_concessao_em_teste on recreio.entitlements`);
      await db.execute(sql`drop function recreio.recusar_concessao_em_teste()`);
    }
    expect(await db.select().from(groups).where(eq(groups.ownerUserId, conta.id))).toHaveLength(0);
    expect(await eventosDe(conta)).toHaveLength(0);
  });
});

describe("direito de jogar por assinatura", () => {
  it("assinatura ativa do titular dá ATIVO pelo plano do produto", async () => {
    const { conta, perfil } = await contaComPerfil();
    await assinatura(conta, "active", "recreio_family_monthly");
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "ATIVO",
      podeJogar: true,
      origem: "assinatura",
      limiteDePerfis: 4,
      validoAte: null,
    });
  });

  it("cancelamento agendado continua jogando até a data", async () => {
    const { conta, perfil } = await contaComPerfil();
    const cancelaEm = new Date(Date.now() + 10 * DIA);
    await assinatura(conta, "active", "recreio_individual_annual", { cancelaEm });
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "CANCELAMENTO_AGENDADO",
      podeJogar: true,
      limiteDePerfis: 1,
      validoAte: cancelaEm,
    });
  });

  it("pagamento atrasado não joga; com cortesia vigente, joga pela cortesia", async () => {
    const { conta, perfil } = await contaComPerfil();
    await assinatura(conta, "past_due", "recreio_family_monthly");
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "PAGAMENTO_PENDENTE",
      podeJogar: false,
      motivo: "pagamento_pendente",
    });
    await conceder({ email: conta.email, tier: "individual", dias: 5, motivo: "alfa_equipe" });
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "ATIVO",
      origem: "concessao",
      limiteDePerfis: 1,
    });
  });

  it("assinatura encerrada dá ENCERRADO", async () => {
    const { conta, perfil } = await contaComPerfil();
    await assinatura(conta, "canceled", "recreio_family_monthly");
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "ENCERRADO",
      podeJogar: false,
      motivo: "assinatura_encerrada",
    });
  });

  it("assinatura de outro app ou de produto que não é plano do Recreio não libera", async () => {
    const { conta, perfil } = await contaComPerfil();
    const [outro] = await db
      .insert(customers)
      .values({
        provider: "stripe",
        providerCustomerId: `cus_outro_${randomUUID()}`,
        subjectType: "user",
        subjectId: conta.id,
        app: "dia-de-estrela",
        email: conta.email,
      })
      .returning();
    if (!outro) throw new Error("Cliente de teste não criado");
    await db.insert(subscriptions).values({
      customerId: outro.id,
      provider: "stripe",
      providerSubscriptionId: `sub_outro_${randomUUID()}`,
      productId: "estrela_family_monthly",
      providerPriceId: "price_estrela_fixture",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * DIA),
    });
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "SEM_ACESSO",
      podeJogar: false,
    });
    // No app certo, mas com um produto que não é plano do Recreio: não vira plano.
    await assinatura(conta, "active", "estrela_family_monthly");
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      podeJogar: false,
      limiteDePerfis: 0,
    });
  });
});

describe("outras recusas", () => {
  it("perfil suspenso não joga, mesmo com concessão", async () => {
    const { conta, perfil } = await contaComPerfil();
    await conceder({ email: conta.email, tier: "family", dias: 30, motivo: "alfa_equipe" });
    await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.id, perfil.id));
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({
      estado: "SUSPENSO",
      podeJogar: false,
    });
  });

  it("jogo fora do catálogo é recusado antes de qualquer leitura", async () => {
    const { perfil } = await contaComPerfil();
    const erro = await avaliarAcesso({ profileId: perfil.id, gameId: "nao-existe" }).catch(
      (motivo: unknown) => motivo,
    );
    expect(ehErroDoRecreio(erro, "JOGO_INDISPONIVEL")).toBe(true);
  });
});
