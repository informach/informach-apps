import { randomUUID } from "node:crypto";
import { createStripeRecreioPlanSchedules } from "@informach/billing/providers/stripe-plans";
import { and, db, eq, sql } from "@informach/db";
import {
  events as auditEvents,
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioDeviceSessions as devices,
  recreioBillingReconciliations as jobs,
  recreioProfiles as profiles,
  recreioPurchaseAuthorizations as purchases,
  recreioPlanChangeProfiles as selections,
} from "@informach/db/schema";
import { GrupoIdSchema, VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { beforeAll, describe, expect, it } from "vitest";
import { decidirPlanoLido } from "@/features/acesso/decisao";
import { lerFatosDoGrupo } from "@/features/acesso/repository";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import {
  criarAceiteDeTroca,
  criarEncerramentoDeTroca,
} from "@/features/cobranca/troca-aceite-service";
import type { reciboDaTroca } from "@/features/cobranca/troca-cotacao-repository";
import { criarPreparacaoDeReducao } from "@/features/cobranca/troca-cotacao-service";
import type { RuntimeDeEnvioDaTroca } from "@/features/cobranca/troca-execucao-runtime";
import {
  criarEnvioDeReducao,
  criarRecuperacaoDeReducao,
} from "@/features/cobranca/troca-execucao-service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { atualizarCobertura, consultarGrupo } from "@/features/grupo/service";
import { env } from "@/lib/env";
import { transporteDeAgenda } from "./agenda-stripe-apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";
import { adultoDoTeste } from "./teste-apoio";

async function fixture(
  comJogador = false,
  extensao?: (request: Request) => Promise<Response | null>,
  fimCurto?: number,
) {
  const f = await fixtureDePagamento(comJogador, "recreio_family_monthly", extensao);
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  const financeiro = f.concluirCheckout();
  if (fimCurto !== undefined) {
    const item = financeiro.assinatura.items.data[0];
    if (!item) throw new Error("Closed subscription item absent");
    item.current_period_end = fimCurto;
    financeiro.linha.period.end = fimCurto;
  }
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
  return { ...f, origem, cotar, pedido, financeiro, processar, falhas };
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

async function fixtureDeEnvio(
  comJogador = false,
  fimCurto?: number,
  prepararSelecao?: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>,
) {
  const remoto = transporteDeAgenda();
  const f = await fixture(comJogador, remoto.http, fimCurto);
  await prepararSelecao?.(f);
  remoto.abrir(f.financeiro);
  const pedido = await f.pedido();
  // Application scenarios deliberately keep exactly the first profile covered.
  if (prepararSelecao) pedido.perfis = pedido.perfis.map((p, i) => ({ ...p, cobrir: i === 0 }));
  const cotacao = await f.cotar(f.adulto.autor, pedido);
  await operacoes(f).aceitar(f.adulto.autor, aceite(cotacao));
  const runtime: RuntimeDeEnvioDaTroca = {
    modo: "dev",
    produtos: f.products,
    conferirCatalogo: f.runtime.conferirCatalogo,
    agendas: createStripeRecreioPlanSchedules({
      secretKey: "unused",
      mode: "dev",
      client: f.stripe,
    }),
  };
  return {
    ...f,
    cotacao,
    remoto,
    runtime,
    enviar: criarEnvioDeReducao(() => runtime),
    recuperar: criarRecuperacaoDeReducao(() => runtime),
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

describe("envio nativo da redução com PostgreSQL e SDK fechado", () => {
  it("admite a tentativa antes do primeiro POST e conserva oferta/cobertura até a vigência", async () => {
    const f = await fixtureDeEnvio(true);
    f.remoto.antesDeEnviar(async () => {
      const [linha] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
      expect(linha?.requestStartedAt).toBeInstanceOf(Date);
      expect(linha?.acceptedAt).toBeInstanceOf(Date);
      expect(linha?.reviewRequired).toBe(true);
    });
    const recibo = await f.enviar(f.adulto.autor, f.cotacao.id);
    expect(recibo).toMatchObject({
      estado: "scheduled",
      emConferencia: false,
      produtoAtual: "recreio_family_monthly",
    });
    expect(f.remoto.escritas).toHaveLength(2);
    expect(f.remoto.escritas[0]?.key).toBe(`recreio:plan:${f.cotacao.id}:create`);
    expect(JSON.stringify(recibo)).not.toContain(f.remoto.agendaId);
    const [contrato] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.purchaseId, f.recibo.id));
    expect(contrato).toMatchObject({
      revision: 1,
      currentProductId: "recreio_family_monthly",
      currentPlanChangeId: null,
    });
    const [perfil] = await db.select().from(profiles).where(eq(profiles.groupId, f.origem.groupId));
    expect(perfil?.coverageEnabled).toBe(true);
    const [linha] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
    expect(linha).toMatchObject({
      providerScheduleId: f.remoto.agendaId,
      appliedAt: null,
      resolvedAt: null,
    });
  });

  it.each(["create", "update"] as const)(
    "recupera resposta perdida de %s sem nova agenda ou aceite",
    async (operacao) => {
      const f = await fixtureDeEnvio();
      f.remoto.perderResposta(operacao);
      await expect(f.enviar(f.adulto.autor, f.cotacao.id)).rejects.toMatchObject({
        code: "COBRANCA_EM_CONFERENCIA",
      });
      const [antes] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
      expect(antes?.reviewRequired).toBe(true);
      f.runtime.conferirCatalogo = async () => {
        throw new Error("Recovery must not read catalog");
      };
      const recibo = await f.recuperar(f.adulto.autor, f.cotacao.id);
      expect(recibo).toMatchObject({
        estado: "scheduled",
        emConferencia: false,
        tentativaEm: antes?.requestStartedAt?.toISOString(),
        aceitoEm: antes?.acceptedAt?.toISOString(),
      });
      expect(f.remoto.escritas).toHaveLength(2);
      const audits = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.actorId, f.adulto.conta.id));
      expect(
        audits.filter((e) => e.eventType === "recreio.plan_change_attempt_started"),
      ).toHaveLength(1);
      expect(audits.filter((e) => e.eventType === "recreio.plan_change_accepted")).toHaveLength(1);
    },
  );

  it("UUID alheio e login antigo recusam antes de ler catálogo ou escrever no provedor", async () => {
    const f = await fixtureDeEnvio(),
      outro = await adultoDoTeste(),
      antes = f.requests.length;
    await expect(f.enviar(outro.autor, f.cotacao.id)).rejects.toMatchObject({ code: "COBRANCA" });
    await expect(
      f.enviar(
        {
          ...f.adulto.autor,
          login: { ...f.adulto.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
        },
        f.cotacao.id,
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    expect(f.requests).toHaveLength(antes);
    expect(f.remoto.escritas).toEqual([]);
  });

  it("perfil alterado depois do aceite impede o primeiro envio", async () => {
    const f = await fixtureDeEnvio(true);
    await db
      .update(profiles)
      .set({ policyVersion: sql`${profiles.policyVersion}+1` })
      .where(eq(profiles.groupId, f.origem.groupId));
    const antes = f.requests.length;
    await expect(f.enviar(f.adulto.autor, f.cotacao.id)).rejects.toMatchObject({
      code: "CONFLITO",
    });
    expect(f.requests).toHaveLength(antes);
    const [linha] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
    expect(linha?.requestStartedAt).toBeNull();
  });

  it("mudança de preço configurado não envia o preço antigo mesmo com catálogo válido", async () => {
    const f = await fixtureDeEnvio();
    f.runtime.produtos = f.products.map((p) =>
      p.id === f.cotacao.produtoDestino
        ? { ...p, stripePriceId: { ...p.stripePriceId, dev: "price_new_configuration" } }
        : p,
    );
    await expect(f.enviar(f.adulto.autor, f.cotacao.id)).rejects.toMatchObject({ code: "OFERTA" });
    const [linha] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
    expect(linha?.requestStartedAt).toBeNull();
    expect(f.remoto.escritas).toEqual([]);
  });

  it("catálogo indisponível e recuperação de pedido não enviado não admitem tentativa", async () => {
    const f = await fixtureDeEnvio();
    f.runtime.conferirCatalogo = async () => {
      throw new Error("Closed catalog unavailable");
    };
    await expect(f.enviar(f.adulto.autor, f.cotacao.id)).rejects.toThrow(
      "Closed catalog unavailable",
    );
    await expect(f.recuperar(f.adulto.autor, f.cotacao.id)).rejects.toMatchObject({
      code: "OPERACAO_EM_CONFERENCIA",
    });
    const [linha] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
    expect(linha?.requestStartedAt).toBeNull();
    expect(f.remoto.escritas).toEqual([]);
  });

  it("recuperação de tentativa continua com novas vendas desligadas", async () => {
    const f = await fixtureDeEnvio();
    f.remoto.perderResposta("create");
    await expect(f.enviar(f.adulto.autor, f.cotacao.id)).rejects.toThrow();
    const modo = env.RECREIO_BILLING_MODE;
    env.RECREIO_BILLING_MODE = "off";
    try {
      expect((await f.recuperar(f.adulto.autor, f.cotacao.id)).estado).toBe("scheduled");
    } finally {
      env.RECREIO_BILLING_MODE = modo;
    }
    expect(f.remoto.escritas).toHaveLength(2);
  });

  it("logout durante o POST conserva fatos externos e recusa devolver o recibo", async () => {
    const f = await fixtureDeEnvio();
    f.remoto.aposPersistir(async () => {
      await db
        .update(devices)
        .set({ revokedAt: new Date() })
        .where(eq(devices.id, f.adulto.autor.sessaoDeAparelhoId));
    });
    await expect(f.enviar(f.adulto.autor, f.cotacao.id)).rejects.toMatchObject({ code: "AUTH" });
    const [linha] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
    expect(linha).toMatchObject({
      providerScheduleId: f.remoto.agendaId,
      status: "scheduled",
      reviewRequired: false,
    });
    expect(f.remoto.escritas).toHaveLength(2);
  });

  it("fase efetiva não declara aplicação local nem concede oferta sem conciliação atômica", async () => {
    const f = await fixtureDeEnvio();
    await f.enviar(f.adulto.autor, f.cotacao.id);
    f.remoto.aplicar();
    const recibo = await f.recuperar(f.adulto.autor, f.cotacao.id);
    expect(recibo).toMatchObject({ estado: "scheduled", emConferencia: true });
    const [contrato] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.purchaseId, f.recibo.id));
    expect(contrato).toMatchObject({ revision: 1, currentProductId: "recreio_family_monthly" });
    const [linha] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
    expect(linha?.appliedAt).toBeNull();
  });

  it("recusa de auditoria reverte a admissão antes de qualquer POST", async () => {
    const f = await fixtureDeEnvio();
    await db.execute(
      sql`create function recreio.recusar_envio_audit_fixture() returns trigger language plpgsql as $$ begin if NEW.event_type='recreio.plan_change_attempt_started' then raise exception 'fixture plan attempt audit failure'; end if; return NEW; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_envio_audit_fixture before insert on audit.events for each row execute function recreio.recusar_envio_audit_fixture()`,
    );
    try {
      await expect(f.enviar(f.adulto.autor, f.cotacao.id)).rejects.toThrow();
      const [linha] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
      expect(linha).toMatchObject({
        status: "accepted",
        requestStartedAt: null,
        providerScheduleId: null,
      });
      expect(f.remoto.escritas).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_envio_audit_fixture on audit.events`);
      await db.execute(sql`drop function recreio.recusar_envio_audit_fixture()`);
    }
  });
});

describe("aplicação da redução pela conciliação financeira completa", () => {
  const preparados: Awaited<ReturnType<typeof fixtureDeEnvio>>[] = [];
  beforeAll(async () => {
    // These gates run only in GitHub. Real PG time crosses the admitted paid
    // period: do not change immutable receipts, mock clocks, or backdate facts.
    const fim = Math.floor(Date.now() / 1000) + 110;
    for (let i = 0; i < 5; i++) {
      const f = await fixtureDeEnvio(true, fim, async (f) => {
        const intencao = await prepararPerfilMenor(f.adulto.autor);
        await cadastrarPerfilMenor(f.adulto.autor, {
          intencaoId: intencao.id,
          perfil: { apelido: "Jogador sintético", avatar: "padrao" },
          nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
          assumoResponsabilidade: true,
          versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
        });
      });
      await f.enviar(f.adulto.autor, f.cotacao.id);
      f.runtimeFinanceiro.agendasAdmitidas = f.runtime.agendas;
      preparados.push(f);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, fim * 1000 + 1500 - Date.now())),
    );
  }, 180_000);

  function caso(indice: number) {
    const f = preparados[indice];
    if (!f) throw new Error("Native application fixture absent");
    return f;
  }
  async function aplicar(f: ReturnType<typeof caso>, pago = true) {
    f.remoto.aplicar();
    const item = f.financeiro.assinatura.items.data[0];
    if (!item) throw new Error("Closed effective phase absent");
    if (pago)
      f.registrarRenovacao(
        f.cotacao.produtoDestino,
        item.current_period_start,
        item.current_period_end,
      );
    else f.financeiro.assinatura.status = "past_due";
    await db
      .update(jobs)
      .set({ nextAttemptAt: new Date() })
      .where(eq(jobs.payerUserId, f.adulto.conta.id));
    return f.processar();
  }
  async function contrato(f: ReturnType<typeof caso>) {
    const [atual] = await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id));
    if (!atual) throw new Error("Native current contract absent");
    return atual;
  }

  it("captura fase paga, oferta atual e seleção sem reinicializar a origem", async () => {
    const f = caso(0);
    expect((await aplicar(f)).conciliadas).toBe(1);
    expect(f.falhas).toEqual([]);
    expect(await contrato(f)).toMatchObject({
      revision: 2,
      currentProductId: "recreio_individual_monthly",
      currentPlanChangeId: f.cotacao.id,
      coverageReviewRequired: false,
      originProductId: "recreio_family_monthly",
    });
    const [recibo] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
    expect(recibo).toMatchObject({ status: "applied", appliedRevision: 2, reviewRequired: false });
    expect(recibo?.appliedAt).toBeInstanceOf(Date);
    const perfis = await db.select().from(profiles).where(eq(profiles.groupId, f.origem.groupId));
    expect(perfis).toHaveLength(2);
    expect(perfis.filter((p) => p.coverageEnabled)).toHaveLength(1);
    const fatos = await lerFatosDoGrupo(GrupoIdSchema.parse(f.origem.groupId));
    if (!fatos) throw new Error("Native financial facts absent");
    expect(decidirPlanoLido(fatos, new Date())).toMatchObject({
      podeJogar: true,
      limiteDePerfis: 1,
    });
    expect(fatos.assinaturaAtiva?.financeiro.origemAdmitida).toBe(true);
    const [origem] = await db.select().from(purchases).where(eq(purchases.id, f.recibo.id));
    expect(origem?.productId).toBe("recreio_family_monthly");
  });

  it("mudança de perfil conserva o fato financeiro e exige nova seleção sem reativar cobertura", async () => {
    const f = caso(1);
    await db
      .update(profiles)
      .set({ policyVersion: sql`${profiles.policyVersion}+1` })
      .where(eq(profiles.groupId, f.origem.groupId));
    expect((await aplicar(f)).conciliadas).toBe(1);
    expect(await contrato(f)).toMatchObject({
      revision: 2,
      currentPlanChangeId: f.cotacao.id,
      coverageReviewRequired: true,
    });
    const perfis = await db.select().from(profiles).where(eq(profiles.groupId, f.origem.groupId));
    expect(perfis.filter((p) => p.coverageEnabled)).toHaveLength(2);
    const fatos = await lerFatosDoGrupo(GrupoIdSchema.parse(f.origem.groupId));
    if (!fatos) throw new Error("Native financial facts absent");
    expect(fatos.assinaturaAtiva?.financeiro.emConferencia).toBe(true);
    expect(decidirPlanoLido(fatos, new Date()).podeJogar).toBe(false);
    const grupo = await consultarGrupo(f.adulto.autor, f.origem.groupId);
    expect(grupo).toMatchObject({ limite: 1, revisaoDaSelecao: 2 });
    const escolhas = grupo.perfis.map((p, i) => ({
      perfilId: p.perfilId,
      versao: p.versao,
      cobrir: i === 0,
    }));
    const pedido = {
      grupoId: grupo.grupoId,
      revisaoDoContrato: grupo.revisaoDaSelecao,
      perfis: escolhas,
    };
    await expect(
      atualizarCobertura(f.adulto.autor, { ...pedido, revisaoDoContrato: undefined }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(
      atualizarCobertura(f.adulto.autor, { ...pedido, revisaoDoContrato: 3 }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(
      atualizarCobertura(f.adulto.autor, {
        ...pedido,
        perfis: escolhas.map((p) => ({ ...p, cobrir: true })),
      }),
    ).rejects.toMatchObject({ code: "LIMITE_DE_PERFIS" });
    expect((await contrato(f)).coverageReviewRequired).toBe(true);
    await atualizarCobertura(f.adulto.autor, pedido);
    expect((await contrato(f)).coverageReviewRequired).toBe(false);
    const depois = await lerFatosDoGrupo(GrupoIdSchema.parse(f.origem.groupId));
    if (!depois) throw new Error("Native financial facts absent after selection");
    expect(decidirPlanoLido(depois, new Date())).toMatchObject({
      podeJogar: true,
      limiteDePerfis: 1,
    });
    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorId, f.adulto.conta.id));
    expect(
      audits.filter((e) => e.eventType === "recreio.plan_change_selection_confirmed"),
    ).toHaveLength(1);
  });

  it("fase nova sem renovação paga muda o contrato comercial e continua sem acesso pago", async () => {
    const f = caso(2);
    await db
      .update(profiles)
      .set({ policyVersion: sql`${profiles.policyVersion}+1` })
      .where(eq(profiles.groupId, f.origem.groupId));
    expect((await aplicar(f, false)).conciliadas).toBe(1);
    expect(await contrato(f)).toMatchObject({
      revision: 2,
      currentProductId: "recreio_individual_monthly",
    });
    const fatos = await lerFatosDoGrupo(GrupoIdSchema.parse(f.origem.groupId));
    if (!fatos) throw new Error("Native financial facts absent");
    expect(decidirPlanoLido(fatos, new Date()).podeJogar).toBe(false);
    const grupo = await consultarGrupo(f.adulto.autor, f.origem.groupId);
    expect(grupo.revisaoDaSelecao).toBe(2);
    await atualizarCobertura(f.adulto.autor, {
      grupoId: grupo.grupoId,
      revisaoDoContrato: grupo.revisaoDaSelecao,
      perfis: grupo.perfis.map((p, i) => ({
        perfilId: p.perfilId,
        versao: p.versao,
        cobrir: i === 0,
      })),
    });
    expect((await contrato(f)).coverageReviewRequired).toBe(false);
    const depois = await lerFatosDoGrupo(GrupoIdSchema.parse(f.origem.groupId));
    if (!depois) throw new Error("Native unpaid financial facts absent");
    expect(decidirPlanoLido(depois, new Date()).podeJogar).toBe(false);
  });

  it("falha de auditoria reverte oferta, seleção, aplicação e confirmação financeira juntas", async () => {
    const f = caso(3);
    const [antes] = await db.select().from(jobs).where(eq(jobs.payerUserId, f.adulto.conta.id));
    await db.execute(
      sql`create function recreio.recusar_aplicacao_audit_fixture() returns trigger language plpgsql as $$ begin if NEW.event_type='recreio.plan_change_applied' then raise exception 'fixture application audit failure'; end if; return NEW; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_aplicacao_audit_fixture before insert on audit.events for each row execute function recreio.recusar_aplicacao_audit_fixture()`,
    );
    try {
      await aplicar(f);
      expect(f.falhas).toHaveLength(1);
      expect(await contrato(f)).toMatchObject({
        revision: 1,
        currentProductId: "recreio_family_monthly",
      });
      const [recibo] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
      expect(recibo).toMatchObject({ status: "scheduled", appliedAt: null, resolvedAt: null });
      const perfis = await db.select().from(profiles).where(eq(profiles.groupId, f.origem.groupId));
      expect(perfis.filter((p) => p.coverageEnabled)).toHaveLength(2);
      const [depois] = await db.select().from(jobs).where(eq(jobs.payerUserId, f.adulto.conta.id));
      expect(depois?.lastConfirmedAt).toEqual(antes?.lastConfirmedAt);
      expect(depois?.reviewRequired).toBe(true);
    } finally {
      await db.execute(sql`drop trigger recusar_aplicacao_audit_fixture on audit.events`);
      await db.execute(sql`drop function recreio.recusar_aplicacao_audit_fixture()`);
    }
  });

  it("histórico financeiro divergente também reverte a aplicação comercial e a seleção", async () => {
    const f = caso(4);
    f.financeiro.fatura.status_transitions.paid_at++;
    await aplicar(f);
    expect(f.falhas).toHaveLength(1);
    expect(await contrato(f)).toMatchObject({
      revision: 1,
      currentProductId: "recreio_family_monthly",
    });
    const [recibo] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
    expect(recibo?.appliedAt).toBeNull();
    const perfis = await db.select().from(profiles).where(eq(profiles.groupId, f.origem.groupId));
    expect(perfis.filter((p) => p.coverageEnabled)).toHaveLength(2);
  });
});
