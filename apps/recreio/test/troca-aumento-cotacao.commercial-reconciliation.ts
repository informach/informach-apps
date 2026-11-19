import { randomUUID } from "node:crypto";
import { createStripeRecreioUpgrades } from "@informach/billing/providers/stripe-recreio-upgrades";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioDeviceSessions as devices,
  recreioFundingObservations as fundingObservations,
  recreioPaymentFunding as fundingProofs,
  recreioGameSessions as gameSessions,
  recreioBillingReconciliations as jobs,
  subscriptionPaymentPeriods as paidPeriods,
  recreioProfiles as profiles,
  recreioPurchaseAuthorizations as purchases,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { avaliarAcesso } from "@/features/acesso/service";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { criarAceiteDeTroca } from "@/features/cobranca/troca-aceite-service";
import {
  criarEnvioDeAumento,
  criarRecuperacaoDeAumento,
} from "@/features/cobranca/troca-aumento-execucao-service";
import { criarPreparacaoDeAumento } from "@/features/cobranca/troca-cotacao-service";
import { entrarNoJogo, ingressoDe } from "./jogo-apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";
import { adultoDoTeste } from "./teste-apoio";

type Financeiro = ReturnType<Awaited<ReturnType<typeof fixtureDePagamento>>["concluirCheckout"]>;

/** Native identity, receipt, PostgreSQL, audit and SDK are real. HTTP payment
 * and preview facts are closed fixtures, not a Stripe settlement claim. */
async function fixture(comJogador = false, produtoInicial = "recreio_individual_monthly") {
  let financeiro: Financeiro | undefined;
  let depoisDaPrevia: (() => Promise<void>) | undefined;
  let totalIncorreto = false;
  let transporteDoEnvio: ((request: Request) => Promise<Response | null>) | undefined;
  const previas: URLSearchParams[] = [];
  const f = await fixtureDePagamento(comJogador, produtoInicial, async (request) => {
    const enviada = await transporteDoEnvio?.(request.clone());
    if (enviada) return enviada;
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !== "/v1/invoices/create_preview"
    )
      return null;
    const item = financeiro?.assinatura.items.data[0];
    if (!financeiro || !item) throw new Error("Closed paid origin absent");
    const params = new URLSearchParams(await request.text());
    previas.push(params);
    expect(params.get("subscription_details[items][0][id]")).toBe(item.id);
    expect(params.get("customer")).toBe(financeiro.assinatura.customer);
    const line = (id: string, amount: number, price: string) => ({
      id,
      amount,
      currency: "brl",
      quantity: 1,
      parent: { subscription_item_details: { subscription: financeiro?.assinatura.id } },
      pricing: { price_details: { price } },
    });
    const total = 12790 - financeiro.fatura.amount_paid;
    const resposta = {
      id: "upcoming_in_native",
      object: "invoice",
      livemode: false,
      customer: financeiro.assinatura.customer,
      currency: "brl",
      amount_due: Math.max(0, total),
      total: totalIncorreto ? total + 1 : total,
      starting_balance: 0,
      parent: { subscription_details: { subscription: financeiro.assinatura.id } },
      lines: {
        has_more: false,
        data: [
          line("il_native_credit", -financeiro.fatura.amount_paid, item.price.id),
          line("il_native_family", 12790, "price_recreio_family_monthly"),
        ],
      },
    };
    await depoisDaPrevia?.();
    return Response.json(resposta);
  });
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  financeiro = f.concluirCheckout();
  const falhas: string[] = [];
  const processar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: (entrada) => {
      if (entrada.payerId === f.adulto.conta.id) falhas.push(entrada.reasonCode);
    },
  });
  expect((await processar()).conciliadas).toBe(1);
  expect(falhas).toEqual([]);
  const [origem] = await db.select().from(purchases).where(eq(purchases.id, f.recibo.id));
  if (!origem) throw new Error("Native purchase absent");
  const origemAdmitida = origem;
  const runtime = {
    modo: "dev" as const,
    produtos: f.products,
    conferirCatalogo: f.runtime.conferirCatalogo,
    aumentos: createStripeRecreioUpgrades({ secretKey: "unused", mode: "dev", client: f.stripe }),
  };
  const cotar = criarPreparacaoDeAumento(() => runtime);
  async function pedido() {
    const atuais = await db
      .select()
      .from(profiles)
      .where(eq(profiles.groupId, origemAdmitida.groupId));
    return {
      pedidoId: randomUUID(),
      grupoId: origemAdmitida.groupId,
      produtoDestino: "recreio_family_monthly",
      revisaoContrato: 1,
      perfis: atuais.map((p) => ({
        perfilId: p.id,
        versao: p.policyVersion,
        cobrir: p.coverageEnabled,
      })),
    };
  }
  return {
    ...f,
    origem,
    financeiro,
    runtime,
    cotar,
    pedido,
    previas,
    depoisDaPrevia(callback: () => Promise<void>) {
      depoisDaPrevia = callback;
    },
    invalidarTotal() {
      totalIncorreto = true;
    },
    usarTransporteDoEnvio(transporte: (request: Request) => Promise<Response | null>) {
      transporteDoEnvio = transporte;
    },
  };
}

describe("cotação nativa do aumento imediato", () => {
  it("pagante sem jogador recebe cotação vinculada ao item, data e saldo, sem tentativa externa", async () => {
    const f = await fixture(),
      pedido = await f.pedido();
    const cotacao = await f.cotar(f.adulto.autor, pedido);
    expect(cotacao).toMatchObject({
      tipo: "upgrade",
      valorAgoraCentavos: 6800,
      creditoCentavos: -5990,
      totalCentavos: 6800,
      saldoAnteriorCentavos: 0,
      estado: "quoted",
      aceitoEm: null,
      tentativaEm: null,
    });
    expect(f.previas).toHaveLength(1);
    const [saved] = await db.select().from(changes).where(eq(changes.id, cotacao.id));
    expect(saved).toMatchObject({
      providerItemId: f.financeiro.assinatura.items.data[0]?.id,
      quotedStartingBalanceCents: 0,
      prorationAt: new Date(cotacao.vigencia),
      requestStartedAt: null,
    });
    expect(f.previas[0]?.get("subscription_details[proration_date]")).toBe(
      String(new Date(cotacao.vigencia).getTime() / 1000),
    );
    expect("providerItemId" in cotacao).toBe(false);
    expect(await f.cotar(f.adulto.autor, pedido)).toEqual(cotacao);
    expect(f.previas).toHaveLength(1);
    const aceitar = criarAceiteDeTroca(() => ({ modo: "dev", produtos: f.products }));
    const aceita = await aceitar(f.adulto.autor, {
      pedidoId: cotacao.id,
      produtoDestino: cotacao.produtoDestino,
      revisaoContrato: cotacao.revisaoContrato,
      valorAgoraCentavos: cotacao.valorAgoraCentavos,
      subtotalCentavos: cotacao.subtotalCentavos,
      creditoCentavos: cotacao.creditoCentavos,
      totalCentavos: cotacao.totalCentavos,
      saldoAnteriorCentavos: cotacao.saldoAnteriorCentavos,
      valorRenovacaoCentavos: cotacao.valorRenovacaoCentavos,
      intervalo: cotacao.intervalo,
      moeda: cotacao.moeda,
      vigencia: cotacao.vigencia,
      versaoDasCondicoes: cotacao.versaoDasCondicoes,
      aceitoTrocaECobrancaRecorrente: true,
    });
    expect(aceita).toMatchObject({ estado: "accepted", tentativaEm: null });
    const [current] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.purchaseId, f.recibo.id));
    expect(current).toMatchObject({ revision: 1, currentProductId: "recreio_individual_monthly" });
  });
  it("recusa outra conta e autoridade injetada antes do I/O", async () => {
    const f = await fixture(),
      pedido = await f.pedido(),
      outro = await adultoDoTeste(false);
    await expect(f.cotar(outro.autor, pedido)).rejects.toThrow();
    await expect(
      f.cotar(f.adulto.autor, { ...pedido, providerItemId: "si_injected" }),
    ).rejects.toThrow();
    expect(f.previas).toEqual([]);
    expect(await db.select().from(changes).where(eq(changes.id, pedido.pedidoId))).toEqual([]);
  });
  it("I/O ocorre sem a trava de perfil e alteração concorrente recusa a cotação inteira", async () => {
    const f = await fixture(true),
      pedido = await f.pedido(),
      perfil = pedido.perfis[0];
    if (!perfil) throw new Error("Native player absent");
    f.depoisDaPrevia(() =>
      db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout='1s'`);
        await tx
          .update(profiles)
          .set({ policyVersion: perfil.versao + 1 })
          .where(eq(profiles.id, perfil.perfilId));
      }),
    );
    await expect(f.cotar(f.adulto.autor, pedido)).rejects.toMatchObject({ code: "CONFLITO" });
    expect(f.previas).toHaveLength(1);
    expect(await db.select().from(changes).where(eq(changes.id, pedido.pedidoId))).toEqual([]);
  });
  it("logout durante a prévia impede gravação e devolução do recibo", async () => {
    const f = await fixture(),
      pedido = await f.pedido();
    f.depoisDaPrevia(async () => {
      await db
        .update(devices)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(devices.userId, f.adulto.conta.id),
            eq(devices.id, f.adulto.autor.sessaoDeAparelhoId),
          ),
        );
    });
    await expect(f.cotar(f.adulto.autor, pedido)).rejects.toThrow();
    expect(await db.select().from(changes).where(eq(changes.id, pedido.pedidoId))).toEqual([]);
  });
  it("fatura inconsistente não produz cotação, aceite ou alteração atual", async () => {
    const f = await fixture(),
      pedido = await f.pedido();
    f.invalidarTotal();
    await expect(f.cotar(f.adulto.autor, pedido)).rejects.toThrow("totals differ");
    expect(await db.select().from(changes).where(eq(changes.id, pedido.pedidoId))).toEqual([]);
    expect(
      (await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id)))[0]?.revision,
    ).toBe(1);
  });
  it("falha de auditoria reverte cotação e seleção, sem esconder o erro", async () => {
    const f = await fixture(true),
      pedido = await f.pedido();
    await db.execute(
      sql`create function recreio.recusar_aumento_cotacao_fixture() returns trigger language plpgsql as $$ begin if NEW.event_type='recreio.plan_change_quoted' then raise exception 'fixture upgrade quote audit failure'; end if; return NEW; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_aumento_cotacao_fixture before insert on audit.events for each row execute function recreio.recusar_aumento_cotacao_fixture()`,
    );
    try {
      await expect(f.cotar(f.adulto.autor, pedido)).rejects.toThrow();
      expect(await db.select().from(changes).where(eq(changes.id, pedido.pedidoId))).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_aumento_cotacao_fixture on audit.events`);
      await db.execute(sql`drop function recreio.recusar_aumento_cotacao_fixture()`);
    }
  });
});

async function fixtureDeEnvio(comJogador = false, produtoInicial = "recreio_individual_monthly") {
  const f = await fixture(comJogador, produtoInicial),
    pedido = await f.pedido(),
    cotacao = await f.cotar(f.adulto.autor, pedido);
  await criarAceiteDeTroca(() => ({ modo: "dev", produtos: f.products }))(f.adulto.autor, {
    pedidoId: cotacao.id,
    produtoDestino: cotacao.produtoDestino,
    revisaoContrato: cotacao.revisaoContrato,
    valorAgoraCentavos: cotacao.valorAgoraCentavos,
    subtotalCentavos: cotacao.subtotalCentavos,
    creditoCentavos: cotacao.creditoCentavos,
    totalCentavos: cotacao.totalCentavos,
    saldoAnteriorCentavos: cotacao.saldoAnteriorCentavos,
    valorRenovacaoCentavos: cotacao.valorRenovacaoCentavos,
    intervalo: cotacao.intervalo,
    moeda: cotacao.moeda,
    vigencia: cotacao.vigencia,
    versaoDasCondicoes: cotacao.versaoDasCondicoes,
    aceitoTrocaECobrancaRecorrente: true,
  });
  let criada: ReturnType<typeof f.registrarRenovacao> | undefined;
  let recusar = false,
    perder = false;
  let aposPersistir: (() => Promise<void>) | undefined;
  const eventos: unknown[] = [],
    escritas: URLSearchParams[] = [];
  const item = f.financeiro.assinatura.items.data[0];
  if (!item) throw new Error("Closed recurring item absent");
  const originalItem = item;
  const total = 12790 - f.financeiro.fatura.amount_paid;
  const devido = Math.max(0, total),
    saldoFinal = Math.min(0, total);
  const assinatura = () => ({
    ...f.financeiro.assinatura,
    latest_invoice: criada?.fatura.id ?? f.financeiro.fatura.id,
    pending_update:
      criada && !criada.pago ? { expires_at: Math.floor(Date.now() / 1000) + 3600 } : null,
  });
  function linhas() {
    const atual = criada;
    if (!atual) throw new Error("Closed own invoice absent");
    return {
      object: "list",
      has_more: false,
      data: [
        {
          id: `il_credit_${cotacao.id.replaceAll("-", "")}`,
          invoice: atual.fatura.id,
          livemode: false,
          amount: -f.financeiro.fatura.amount_paid,
          currency: "brl",
          quantity: 1,
          parent: {
            subscription_item_details: {
              subscription: f.financeiro.assinatura.id,
              proration_details: {
                credited_items: {
                  invoice: f.financeiro.fatura.id,
                  invoice_line_items: [f.financeiro.linha.id],
                },
              },
            },
          },
          pricing: { price_details: { price: f.financeiro.linha.pricing.price_details.price } },
          period: { start: atual.linha.period.start, end: f.financeiro.linha.period.end },
        },
        { ...atual.linha, currency: "brl", quantity: 1 },
      ],
    };
  }
  f.usarTransporteDoEnvio(async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === "GET") {
      if (criada && path === `/v1/customers/${f.providerCustomerId}`)
        return Response.json({
          id: f.providerCustomerId,
          object: "customer",
          livemode: false,
          balance: saldoFinal,
        });
      if (criada && path === `/v1/customers/${f.providerCustomerId}/balance_transactions`)
        return Response.json({
          object: "list",
          has_more: false,
          data:
            saldoFinal === 0
              ? []
              : [
                  {
                    id: `cbtxn_native_${cotacao.id.replaceAll("-", "")}`,
                    object: "customer_balance_transaction",
                    livemode: false,
                    customer: f.providerCustomerId,
                    currency: "brl",
                    type: "applied_to_invoice",
                    invoice: criada.fatura.id,
                    amount: saldoFinal,
                    ending_balance: saldoFinal,
                  },
                ],
        });
      if (path === `/v1/subscriptions/${f.financeiro.assinatura.id}`)
        return Response.json(assinatura());
      if (path === "/v1/events")
        return Response.json({ object: "list", data: eventos, has_more: false });
      if (criada && path === `/v1/invoices/${criada.fatura.id}`)
        return Response.json({
          ...criada.fatura,
          billing_reason: "subscription_update",
          amount_due: devido,
          total,
          starting_balance: 0,
          parent: { subscription_details: { subscription: f.financeiro.assinatura.id } },
        });
      if (criada && path === `/v1/invoices/${criada.fatura.id}/lines`)
        return Response.json(linhas());
      return null;
    }
    if (request.method !== "POST" || path !== `/v1/subscriptions/${f.financeiro.assinatura.id}`)
      return null;
    const params = new URLSearchParams(await request.text());
    escritas.push(params);
    expect(params.get("items[0][id]")).toBe(originalItem.id);
    expect(params.get("items[0][price]")).toBe("price_recreio_family_monthly");
    expect(params.get("proration_date")).toBe(String(new Date(cotacao.vigencia).getTime() / 1000));
    expect(params.get("payment_behavior")).toBe("pending_if_incomplete");
    if (criada) throw new Error("Repeated closed subscription mutation");
    const inicio = new Date(cotacao.vigencia).getTime() / 1000;
    criada = f.registrarRenovacao(
      "recreio_family_monthly",
      inicio,
      originalItem.current_period_end,
    );
    criada.fatura.amount_paid = devido;
    criada.fatura.total = total;
    criada.fatura.ending_balance = saldoFinal;
    criada.alocacao.amount_paid = devido;
    criada.charge.amount_captured = devido;
    criada.fatura.status_transitions.paid_at = inicio;
    criada.pago = !recusar;
    criada.fatura.status = recusar ? "open" : "paid";
    originalItem.price.id = recusar
      ? f.financeiro.linha.pricing.price_details.price
      : "price_recreio_family_monthly";
    eventos.push({
      id: `evt_upgrade_${cotacao.id.replaceAll("-", "")}`,
      type: "customer.subscription.updated",
      livemode: false,
      request: { idempotency_key: request.headers.get("idempotency-key") },
      data: { object: structuredClone(assinatura()) },
    });
    await aposPersistir?.();
    if (perder) {
      perder = false;
      throw new TypeError("Closed upgrade response lost");
    }
    return Response.json(assinatura());
  });
  const falhas: string[] = [];
  const processar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => ({ ...f.runtimeFinanceiro, aumentosAdmitidos: f.runtime.aumentos }),
    relatarFalha: (entrada) => {
      if (entrada.payerId === f.adulto.conta.id) falhas.push(entrada.reasonCode);
    },
  });
  return {
    ...f,
    cotacao,
    escritas,
    falhas,
    processar,
    enviar: criarEnvioDeAumento(() => f.runtime),
    recuperar: criarRecuperacaoDeAumento(() => f.runtime),
    perderResposta() {
      perder = true;
    },
    recusarPagamento() {
      recusar = true;
    },
    aposPersistir(callback: () => Promise<void>) {
      aposPersistir = callback;
    },
    pagar() {
      if (!criada) throw new Error("Closed invoice absent");
      criada.pago = true;
      criada.fatura.status = "paid";
      originalItem.price.id = "price_recreio_family_monthly";
    },
    estornar() {
      if (!criada) throw new Error("Closed invoice absent");
      criada.charge.refunded = true;
      criada.charge.amount_refunded = 6800;
    },
  };
}

describe("tentativa e conciliação nativas do aumento", () => {
  it("registra a tentativa antes do POST e aplica revisão somente com a fatura própria capturada", async () => {
    const f = await fixtureDeEnvio();
    f.aposPersistir(async () => {
      const [admitida] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
      expect(admitida).toMatchObject({ status: "sent", reviewRequired: true });
      expect(admitida?.requestStartedAt).toBeInstanceOf(Date);
    });
    const enviada = await f.enviar(f.adulto.autor, f.cotacao.id);
    expect(enviada.estado).toBe("sent");
    expect(f.escritas).toHaveLength(1);
    expect(
      (await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id)))[0]?.revision,
    ).toBe(1);
    expect((await f.processar()).conciliadas).toBe(1);
    expect(f.falhas).toEqual([]);
    expect(
      (await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id)))[0],
    ).toMatchObject({
      revision: 2,
      currentProductId: "recreio_family_monthly",
      originProductId: "recreio_individual_monthly",
    });
    expect((await db.select().from(changes).where(eq(changes.id, f.cotacao.id)))[0]).toMatchObject({
      status: "applied",
      reviewRequired: false,
      appliedRevision: 2,
    });
    expect((await f.recuperar(f.adulto.autor, f.cotacao.id)).estado).toBe("applied");
    expect(f.escritas).toHaveLength(1);
  });
  it("resposta perdida é recuperada pelo worker sem outro POST e sem fabricar login", async () => {
    const f = await fixtureDeEnvio();
    f.perderResposta();
    await expect(f.enviar(f.adulto.autor, f.cotacao.id)).rejects.toMatchObject({
      code: "COBRANCA_EM_CONFERENCIA",
    });
    expect((await f.processar()).conciliadas).toBe(1);
    expect(f.falhas).toEqual([]);
    expect(f.escritas).toHaveLength(1);
    expect(
      (await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id)))[0]?.revision,
    ).toBe(2);
  });
  it("logout durante o POST preserva a fatura, retém o recibo e permite conciliação técnica", async () => {
    const f = await fixtureDeEnvio();
    f.aposPersistir(async () => {
      await db
        .update(devices)
        .set({ revokedAt: new Date() })
        .where(eq(devices.id, f.adulto.autor.sessaoDeAparelhoId));
    });
    await expect(f.enviar(f.adulto.autor, f.cotacao.id)).rejects.toMatchObject({ code: "AUTH" });
    const [recibo] = await db.select().from(changes).where(eq(changes.id, f.cotacao.id));
    expect(recibo?.providerInvoiceId).toMatch(/^in_/);
    expect((await f.processar()).conciliadas).toBe(1);
    expect(f.falhas).toEqual([]);
    expect(f.escritas).toHaveLength(1);
  });
  it("recuperação de cotação ainda não enviada não admite tentativa", async () => {
    const f = await fixtureDeEnvio();
    await expect(f.recuperar(f.adulto.autor, f.cotacao.id)).rejects.toMatchObject({
      code: "OPERACAO_EM_CONFERENCIA",
    });
    expect(f.escritas).toEqual([]);
    expect(
      (await db.select().from(changes).where(eq(changes.id, f.cotacao.id)))[0]?.requestStartedAt,
    ).toBeNull();
  });
  it("pagamento recusado mantém oferta anterior; depois aplica a mesma fatura sem nova alteração", async () => {
    const f = await fixtureDeEnvio();
    f.recusarPagamento();
    await f.enviar(f.adulto.autor, f.cotacao.id);
    expect((await f.processar()).conciliadas).toBe(1);
    expect(f.falhas).toEqual([]);
    expect(
      (await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id)))[0]?.revision,
    ).toBe(1);
    f.pagar();
    await f.recuperar(f.adulto.autor, f.cotacao.id);
    expect((await f.processar()).conciliadas).toBe(1);
    expect(f.falhas).toEqual([]);
    expect(
      (await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id)))[0]?.revision,
    ).toBe(2);
    expect(f.escritas).toHaveLength(1);
  });
  it.each(["estorno", "parcial", "contestacao", "credito_anual"] as const)(
    "fato adverso %s na origem corta a SID do aumento dependente",
    async (tipo) => {
      const anual = tipo === "credito_anual";
      const f = await fixtureDeEnvio(
        true,
        anual ? "recreio_individual_annual" : "recreio_individual_monthly",
      );
      if (anual) expect(f.cotacao).toMatchObject({ valorAgoraCentavos: 0, totalCentavos: -47110 });
      await f.enviar(f.adulto.autor, f.cotacao.id);
      expect((await f.processar()).conciliadas).toBe(1);
      const jogador = f.adulto.jogador;
      if (!jogador) throw new Error("Native payer/player absent");
      expect(await avaliarAcesso({ profileId: jogador.perfil.id })).toMatchObject({
        podeJogar: true,
      });
      const aberta = await entrarNoJogo(jogador);
      f.financeiro.charge.amount_refunded =
        tipo === "estorno" || anual ? f.financeiro.fatura.amount_paid : tipo === "parcial" ? 1 : 0;
      f.financeiro.charge.refunded = tipo === "estorno" || anual;
      f.financeiro.charge.disputed = tipo === "contestacao";
      if (tipo === "contestacao")
        f.financeiro.disputas.push({ id: "dp_native_origin", status: "needs_response" });
      await db.execute(
        sql`update recreio.billing_reconciliations set next_attempt_at=clock_timestamp() where payer_user_id=${f.adulto.conta.id} and provider_mode='dev'`,
      );
      expect((await f.processar()).conciliadas).toBe(1);
      expect(f.falhas).toEqual([]);
      expect(await avaliarAcesso({ profileId: jogador.perfil.id })).toMatchObject({
        podeJogar: false,
      });
      await expect(ingressoDe(jogador)).rejects.toMatchObject({ codigo: "ACESSO_NEGADO" });
      expect(
        (await db.select().from(gameSessions).where(eq(gameSessions.id, aberta.sid)))[0]?.endedAt,
      ).toBeInstanceOf(Date);
      const [contrato] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.purchaseId, f.recibo.id));
      if (!contrato) throw new Error("Native applied contract absent");
      expect(contrato.revision).toBe(2);
      const provas = await db
        .select({ periodo: paidPeriods, prova: fundingObservations })
        .from(fundingProofs)
        .innerJoin(fundingObservations, eq(fundingObservations.id, fundingProofs.observationId))
        .innerJoin(paidPeriods, eq(paidPeriods.id, fundingProofs.paymentPeriodId))
        .where(eq(paidPeriods.subscriptionId, contrato.subscriptionId));
      const dependente = provas.find(
        (p) => p.periodo.providerPriceId === "price_recreio_family_monthly",
      );
      expect(dependente?.prova.fundingStatus).toBe(tipo === "parcial" ? "review" : "revoked");
      expect(dependente?.periodo.fullyRefunded).toBe(false);
      expect(dependente?.periodo.disputed).toBe(false);
      expect(f.escritas).toHaveLength(1);
    },
  );
  it("estorno antes da captura registra a oferta aplicada, revoga financiamento e corta a SID", async () => {
    const f = await fixtureDeEnvio(true);
    const jogador = f.adulto.jogador;
    if (!jogador) throw new Error("Native player absent");
    const aberta = await entrarNoJogo(jogador);
    await f.enviar(f.adulto.autor, f.cotacao.id);
    f.estornar();
    expect((await f.processar()).conciliadas).toBe(1);
    expect(f.falhas).toEqual([]);
    expect(
      (await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id)))[0]?.revision,
    ).toBe(2);
    expect(
      (await db.select().from(changes).where(eq(changes.id, f.cotacao.id)))[0]?.appliedAt,
    ).toBeInstanceOf(Date);
    expect(await avaliarAcesso({ profileId: jogador.perfil.id })).toMatchObject({
      podeJogar: false,
    });
    await expect(ingressoDe(jogador)).rejects.toMatchObject({ codigo: "ACESSO_NEGADO" });
    expect(
      (await db.select().from(gameSessions).where(eq(gameSessions.id, aberta.sid)))[0]?.endReason,
    ).toBe("access_lost");
    const [observada] = await db
      .select({ estado: fundingObservations.fundingStatus })
      .from(fundingProofs)
      .innerJoin(fundingObservations, eq(fundingObservations.id, fundingProofs.observationId))
      .innerJoin(paidPeriods, eq(paidPeriods.id, fundingProofs.paymentPeriodId))
      .where(
        and(
          eq(paidPeriods.providerPriceId, "price_recreio_family_monthly"),
          eq(fundingObservations.payerUserId, f.adulto.conta.id),
        ),
      );
    expect(observada?.estado).toBe("revoked");
  });
  it("falha de auditoria da tentativa impede qualquer POST", async () => {
    const f = await fixtureDeEnvio();
    await db.execute(
      sql`create function recreio.recusar_aumento_envio_fixture() returns trigger language plpgsql as $$ begin if NEW.event_type='recreio.plan_change_attempt_started' then raise exception 'fixture upgrade admission audit failure'; end if; return NEW; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_aumento_envio_fixture before insert on audit.events for each row execute function recreio.recusar_aumento_envio_fixture()`,
    );
    try {
      await expect(f.enviar(f.adulto.autor, f.cotacao.id)).rejects.toThrow();
      expect(f.escritas).toEqual([]);
      expect(
        (await db.select().from(changes).where(eq(changes.id, f.cotacao.id)))[0],
      ).toMatchObject({ status: "accepted", requestStartedAt: null });
    } finally {
      await db.execute(sql`drop trigger recusar_aumento_envio_fixture on audit.events`);
      await db.execute(sql`drop function recreio.recusar_aumento_envio_fixture()`);
    }
  });
  it("auditoria da aplicação reverte oferta/seleção e não atualiza confirmação", async () => {
    const f = await fixtureDeEnvio();
    await f.enviar(f.adulto.autor, f.cotacao.id);
    const [antes] = await db.select().from(jobs).where(eq(jobs.payerUserId, f.adulto.conta.id));
    await db.execute(
      sql`create function recreio.recusar_aumento_aplicacao_fixture() returns trigger language plpgsql as $$ begin if NEW.event_type='recreio.plan_change_applied' then raise exception 'fixture upgrade application audit failure'; end if; return NEW; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_aumento_aplicacao_fixture before insert on audit.events for each row execute function recreio.recusar_aumento_aplicacao_fixture()`,
    );
    try {
      await f.processar();
      expect(f.falhas).toHaveLength(1);
      expect(
        (await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id)))[0]
          ?.revision,
      ).toBe(1);
      expect(
        (await db.select().from(changes).where(eq(changes.id, f.cotacao.id)))[0]?.appliedAt,
      ).toBeNull();
      const [depois] = await db.select().from(jobs).where(eq(jobs.payerUserId, f.adulto.conta.id));
      expect(depois?.lastConfirmedAt).toEqual(antes?.lastConfirmedAt);
      expect(depois?.reviewRequired).toBe(true);
    } finally {
      await db.execute(sql`drop trigger recusar_aumento_aplicacao_fixture on audit.events`);
      await db.execute(sql`drop function recreio.recusar_aumento_aplicacao_fixture()`);
    }
  });
  it("perfil alterado durante o POST preserva os fatos e exige seleção atual", async () => {
    const f = await fixtureDeEnvio(true),
      perfil = (await f.pedido()).perfis[0];
    if (!perfil) throw new Error("Native player absent");
    f.aposPersistir(async () => {
      await db
        .update(profiles)
        .set({ policyVersion: perfil.versao + 1 })
        .where(eq(profiles.id, perfil.perfilId));
    });
    await f.enviar(f.adulto.autor, f.cotacao.id);
    expect((await f.processar()).conciliadas).toBe(1);
    expect(f.falhas).toEqual([]);
    expect(
      (await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id)))[0],
    ).toMatchObject({ revision: 2, coverageReviewRequired: true });
    expect(
      (await db.select().from(profiles).where(eq(profiles.id, perfil.perfilId)))[0]?.policyVersion,
    ).toBe(perfil.versao + 1);
  });
});
