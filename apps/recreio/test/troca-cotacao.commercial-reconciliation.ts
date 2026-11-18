import { randomUUID } from "node:crypto";
import { and, db, eq, sql } from "@informach/db";
import {
  events as auditEvents,
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioBillingReconciliations as jobs,
  recreioProfiles as profiles,
  recreioPurchaseAuthorizations as purchases,
  recreioPlanChangeProfiles as selections,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import {
  criarAceiteDeTroca,
  criarEncerramentoDeTroca,
} from "@/features/cobranca/troca-aceite-service";
import type { reciboDaTroca } from "@/features/cobranca/troca-cotacao-repository";
import { criarPreparacaoDeReducao } from "@/features/cobranca/troca-cotacao-service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";
import { adultoDoTeste } from "./teste-apoio";

async function fixture(comJogador = false) {
  const f = await fixtureDePagamento(comJogador, "recreio_family_monthly");
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  f.concluirCheckout();
  const falhas: string[] = [];
  const processar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: (e) => {
      if (e.payerId === f.adulto.conta.id) falhas.push(e.reasonCode);
    },
  });
  expect((await processar()).conciliadas).toBe(1);
  expect(falhas).toEqual([]);
  // Other fixtures may leave deliberately failed jobs; inspect this payer's
  // durable confirmation, rather than assuming the shared queue is empty.
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.payerUserId, f.adulto.conta.id), eq(jobs.providerMode, "dev")));
  expect(job?.reviewRequired).toBe(false);
  expect(job?.lastConfirmedAt).toBeInstanceOf(Date);
  const [origem] = await db.select().from(purchases).where(eq(purchases.id, f.recibo.id));
  if (!origem) throw new Error("Native financial origin absent");
  const origemAdmitida = origem;
  const cotar = criarPreparacaoDeReducao(() => ({ modo: "dev", produtos: f.products }));
  async function pedido() {
    const atuais = await db
      .select()
      .from(profiles)
      .where(eq(profiles.groupId, origemAdmitida.groupId));
    return {
      pedidoId: randomUUID(),
      grupoId: origemAdmitida.groupId,
      produtoDestino: "recreio_individual_monthly",
      revisaoContrato: 1,
      perfis: atuais.map((p) => ({
        perfilId: p.id,
        versao: p.policyVersion,
        cobrir: p.coverageEnabled,
      })),
    };
  }
  return { ...f, origem, cotar, pedido };
}

function aceite(cotacao: ReturnType<typeof reciboDaTroca>) {
  return {
    pedidoId: cotacao.id,
    produtoDestino: cotacao.produtoDestino,
    revisaoContrato: cotacao.revisaoContrato,
    valorAgoraCentavos: cotacao.valorAgoraCentavos,
    subtotalCentavos: cotacao.subtotalCentavos,
    creditoCentavos: cotacao.creditoCentavos,
    totalCentavos: cotacao.totalCentavos,
    valorRenovacaoCentavos: cotacao.valorRenovacaoCentavos,
    intervalo: cotacao.intervalo,
    moeda: cotacao.moeda,
    vigencia: cotacao.vigencia,
    versaoDasCondicoes: cotacao.versaoDasCondicoes,
    aceitoTrocaECobrancaRecorrente: true,
  };
}
function operacoes(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    aceitar: criarAceiteDeTroca(() => ({ modo: "dev", produtos: f.products })),
    encerrar: criarEncerramentoDeTroca(() => "dev"),
  };
}

describe("cotação nativa de redução sem efeito externo", () => {
  it("pagante sem jogador recebe termos fixos e replay sem chamada ao provedor", async () => {
    const f = await fixture(),
      pedido = await f.pedido();
    const antes = f.requests.length;
    const cotacao = await f.cotar(f.adulto.autor, pedido);
    expect(cotacao).toMatchObject({
      id: pedido.pedidoId,
      tipo: "downgrade",
      valorAgoraCentavos: 0,
      valorRenovacaoCentavos: 5990,
      intervalo: "month",
      estado: "quoted",
      aceitoEm: null,
      tentativaEm: null,
    });
    expect(await f.cotar(f.adulto.autor, pedido)).toEqual(cotacao);
    expect(f.requests).toHaveLength(antes);
    expect(JSON.stringify(cotacao)).not.toContain(f.providerCustomerId);
    expect(JSON.stringify(cotacao)).not.toContain("price_");
    expect(JSON.stringify(cotacao)).not.toContain(f.recibo.id);
    const [saved] = await db.select().from(changes).where(eq(changes.id, pedido.pedidoId));
    expect(saved).toMatchObject({
      quotedSubtotalCents: 0,
      quotedCreditCents: 0,
      quotedTotalCents: 0,
      toAmountCents: 5990,
      toInterval: "month",
      acceptedAt: null,
      requestStartedAt: null,
      providerScheduleId: null,
    });
    expect(saved?.effectiveAt).toEqual(saved?.periodEnd);
    await expect(
      f.cotar(f.adulto.autor, { ...pedido, produtoDestino: "recreio_individual_annual" }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
  });

  it("outro adulto e login antigo são recusados antes de registrar a cotação", async () => {
    const f = await fixture(),
      pedido = await f.pedido(),
      outro = await adultoDoTeste();
    await expect(f.cotar(outro.autor, pedido)).rejects.toMatchObject({ code: "GRUPO" });
    await expect(
      f.cotar(
        {
          ...f.adulto.autor,
          login: { ...f.adulto.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
        },
        pedido,
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    expect(await db.select().from(changes).where(eq(changes.id, pedido.pedidoId))).toEqual([]);
  });

  it("revisão ou perfil alterado não autoriza uma escolha antiga", async () => {
    const f = await fixture(true),
      pedido = await f.pedido();
    expect(pedido.perfis).toHaveLength(1);
    await expect(f.cotar(f.adulto.autor, { ...pedido, revisaoContrato: 2 })).rejects.toMatchObject({
      code: "CONFLITO",
    });
    const perfil = pedido.perfis[0];
    if (!perfil) throw new Error("Native profile absent");
    await db
      .update(profiles)
      .set({ policyVersion: perfil.versao + 1 })
      .where(eq(profiles.id, perfil.perfilId));
    await expect(f.cotar(f.adulto.autor, pedido)).rejects.toMatchObject({ code: "CONFLITO" });
    expect(await db.select().from(changes).where(eq(changes.id, pedido.pedidoId))).toEqual([]);
  });

  it("seleção reduzida é guardada sem desligar perfis antes do fim pago", async () => {
    const f = await fixture(true);
    const intencao = await prepararPerfilMenor(f.adulto.autor);
    const { perfil } = await cadastrarPerfilMenor(f.adulto.autor, {
      intencaoId: intencao.id,
      perfil: { apelido: "Protegido", avatar: "padrao" },
      nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
      assumoResponsabilidade: true,
      versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
    });
    const pedido = await f.pedido();
    expect(pedido.perfis).toHaveLength(2);
    await expect(f.cotar(f.adulto.autor, pedido)).rejects.toMatchObject({
      code: "LIMITE_DE_PERFIS",
    });
    const escolhas = pedido.perfis.map((p) => ({ ...p, cobrir: p.perfilId !== perfil.id }));
    const cotacao = await f.cotar(f.adulto.autor, { ...pedido, perfis: escolhas });
    const [saved] = await db.select().from(selections).where(eq(selections.profileId, perfil.id));
    expect(saved).toMatchObject({ planChangeId: cotacao.id, coverageEnabled: false });
    const [atual] = await db.select().from(profiles).where(eq(profiles.id, perfil.id));
    expect(atual?.coverageEnabled).toBe(true);
    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.purchaseId, f.recibo.id));
    expect(contract).toMatchObject({
      revision: 1,
      currentProductId: "recreio_family_monthly",
      currentPlanChangeId: null,
    });
  });

  it("cotação não enviada vencida pode dar lugar a outra sem alterar a anterior", async () => {
    const f = await fixture(),
      primeiro = await f.pedido();
    await f.cotar(f.adulto.autor, primeiro);
    const segundo = await f.pedido();
    await expect(f.cotar(f.adulto.autor, segundo)).rejects.toMatchObject({
      code: "TROCA_PENDENTE",
    });
    await db.execute(
      sql`update recreio.plan_changes set quoted_at=clock_timestamp()-interval '6 minutes', quote_expires_at=clock_timestamp()-interval '1 minute' where id=${primeiro.pedidoId}`,
    );
    await f.cotar(f.adulto.autor, segundo);
    const [closed] = await db.select().from(changes).where(eq(changes.id, primeiro.pedidoId));
    expect(closed).toMatchObject({
      status: "failed",
      requestStartedAt: null,
      providerScheduleId: null,
    });
    expect(closed?.resolvedAt).not.toBeNull();
  });

  it("falha da auditoria reverte cotação e seleção na mesma transação", async () => {
    const f = await fixture(true),
      pedido = await f.pedido(),
      antes = f.requests.length;
    await db.execute(
      sql`create function recreio.recusar_cotacao_audit_fixture() returns trigger language plpgsql as $$ begin if NEW.event_type='recreio.plan_change_quoted' then raise exception 'fixture quote audit failure'; end if; return NEW; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_cotacao_audit_fixture before insert on audit.events for each row execute function recreio.recusar_cotacao_audit_fixture()`,
    );
    try {
      await expect(f.cotar(f.adulto.autor, pedido)).rejects.toThrow();
      expect(await db.select().from(changes).where(eq(changes.id, pedido.pedidoId))).toEqual([]);
      expect(
        await db.select().from(selections).where(eq(selections.planChangeId, pedido.pedidoId)),
      ).toEqual([]);
      expect(f.requests).toHaveLength(antes);
    } finally {
      await db.execute(sql`drop trigger recusar_cotacao_audit_fixture on audit.events`);
      await db.execute(sql`drop function recreio.recusar_cotacao_audit_fixture()`);
    }
  });
});

describe("aceite nativo da cotação e encerramento sem envio", () => {
  it("registra somente o aceite, com replay, sem iniciar efeito externo ou mudar cobertura", async () => {
    const f = await fixture(),
      { aceitar } = operacoes(f),
      pedido = await f.pedido();
    const cotacao = await f.cotar(f.adulto.autor, pedido),
      entrada = aceite(cotacao),
      antes = f.requests.length;
    const aceita = await aceitar(f.adulto.autor, entrada);
    expect(aceita).toMatchObject({
      estado: "accepted",
      tentativaEm: null,
      valorAgoraCentavos: 0,
      valorRenovacaoCentavos: 5990,
    });
    expect(aceita.aceitoEm).not.toBeNull();
    expect(await aceitar(f.adulto.autor, entrada)).toEqual(aceita);
    expect(f.requests).toHaveLength(antes);
    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorId, f.adulto.conta.id));
    expect(audits.filter((e) => e.eventType === "recreio.plan_change_accepted")).toHaveLength(1);
    const [saved] = await db.select().from(changes).where(eq(changes.id, cotacao.id));
    expect(saved).toMatchObject({
      status: "accepted",
      requestStartedAt: null,
      providerScheduleId: null,
      providerInvoiceId: null,
    });
  });
  it("termos divergentes e outro adulto não aceitam a cotação", async () => {
    const f = await fixture(),
      { aceitar } = operacoes(f),
      cotacao = await f.cotar(f.adulto.autor, await f.pedido()),
      entrada = aceite(cotacao),
      outro = await adultoDoTeste();
    await expect(aceitar(outro.autor, entrada)).rejects.toMatchObject({ code: "COBRANCA" });
    await expect(
      aceitar(f.adulto.autor, { ...entrada, valorRenovacaoCentavos: 5991 }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(
      aceitar(
        {
          ...f.adulto.autor,
          login: { ...f.adulto.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
        },
        entrada,
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    const [saved] = await db.select().from(changes).where(eq(changes.id, cotacao.id));
    expect(saved).toMatchObject({ status: "quoted", acceptedAt: null });
  });
  it("alteração de perfil depois da cotação impede o aceite antigo", async () => {
    const f = await fixture(true),
      { aceitar } = operacoes(f),
      pedido = await f.pedido(),
      cotacao = await f.cotar(f.adulto.autor, pedido),
      perfil = pedido.perfis[0];
    if (!perfil) throw new Error("Native profile absent");
    await db
      .update(profiles)
      .set({ policyVersion: perfil.versao + 1 })
      .where(eq(profiles.id, perfil.perfilId));
    await expect(aceitar(f.adulto.autor, aceite(cotacao))).rejects.toMatchObject({
      code: "CONFLITO",
    });
    const [saved] = await db.select().from(changes).where(eq(changes.id, cotacao.id));
    expect(saved?.acceptedAt).toBeNull();
  });
  it("aceite ainda não enviado pode ser encerrado, sem ser reaberto por replay", async () => {
    const f = await fixture(),
      { aceitar, encerrar } = operacoes(f),
      cotacao = await f.cotar(f.adulto.autor, await f.pedido()),
      entrada = aceite(cotacao);
    await aceitar(f.adulto.autor, entrada);
    const encerrada = await encerrar(f.adulto.autor, cotacao.id);
    expect(encerrada).toMatchObject({ estado: "canceled", tentativaEm: null });
    expect(await encerrar(f.adulto.autor, cotacao.id)).toEqual(encerrada);
    expect((await aceitar(f.adulto.autor, entrada)).estado).toBe("canceled");
  });
  it("tentativa admitida sem ID remoto continua incerta e não é declarada cancelada", async () => {
    const f = await fixture(),
      { aceitar, encerrar } = operacoes(f),
      cotacao = await f.cotar(f.adulto.autor, await f.pedido());
    await aceitar(f.adulto.autor, aceite(cotacao));
    // Simulated admitted attempt; no provider call is claimed by this SQL fixture.
    await db.execute(
      sql`update recreio.plan_changes set status='sent', request_started_at=clock_timestamp() where id=${cotacao.id}`,
    );
    await expect(encerrar(f.adulto.autor, cotacao.id)).rejects.toMatchObject({
      code: "OPERACAO_EM_CONFERENCIA",
    });
    const [saved] = await db.select().from(changes).where(eq(changes.id, cotacao.id));
    expect(saved).toMatchObject({
      status: "sent",
      resolvedAt: null,
      providerScheduleId: null,
      providerInvoiceId: null,
    });
  });
  it("recusa de auditoria reverte o aceite e conserva a cotação original", async () => {
    const f = await fixture(),
      { aceitar } = operacoes(f),
      cotacao = await f.cotar(f.adulto.autor, await f.pedido());
    await db.execute(
      sql`create function recreio.recusar_aceite_audit_fixture() returns trigger language plpgsql as $$ begin if NEW.event_type='recreio.plan_change_accepted' then raise exception 'fixture acceptance audit failure'; end if; return NEW; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_aceite_audit_fixture before insert on audit.events for each row execute function recreio.recusar_aceite_audit_fixture()`,
    );
    try {
      await expect(aceitar(f.adulto.autor, aceite(cotacao))).rejects.toThrow();
      const [saved] = await db.select().from(changes).where(eq(changes.id, cotacao.id));
      expect(saved).toMatchObject({ status: "quoted", acceptedAt: null, requestStartedAt: null });
    } finally {
      await db.execute(sql`drop trigger recusar_aceite_audit_fixture on audit.events`);
      await db.execute(sql`drop function recreio.recusar_aceite_audit_fixture()`);
    }
  });
});
