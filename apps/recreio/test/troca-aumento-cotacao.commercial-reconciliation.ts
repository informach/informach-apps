import { randomUUID } from "node:crypto";
import { createStripeRecreioUpgrades } from "@informach/billing/providers/stripe-recreio-upgrades";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioDeviceSessions as devices,
  recreioProfiles as profiles,
  recreioPurchaseAuthorizations as purchases,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { criarAceiteDeTroca } from "@/features/cobranca/troca-aceite-service";
import { criarPreparacaoDeAumento } from "@/features/cobranca/troca-cotacao-service";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";
import { adultoDoTeste } from "./teste-apoio";

type Financeiro = ReturnType<Awaited<ReturnType<typeof fixtureDePagamento>>["concluirCheckout"]>;

/** Native identity, receipt, PostgreSQL, audit and SDK are real. HTTP payment
 * and preview facts are closed fixtures, not a Stripe settlement claim. */
async function fixture(comJogador = false) {
  let financeiro: Financeiro | undefined;
  let depoisDaPrevia: (() => Promise<void>) | undefined;
  let totalIncorreto = false;
  const previas: URLSearchParams[] = [];
  const f = await fixtureDePagamento(comJogador, "recreio_individual_monthly", async (request) => {
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
    const resposta = {
      id: "upcoming_in_native",
      object: "invoice",
      livemode: false,
      customer: financeiro.assinatura.customer,
      currency: "brl",
      amount_due: 6800,
      total: totalIncorreto ? 6801 : 6800,
      starting_balance: 0,
      parent: { subscription_details: { subscription: financeiro.assinatura.id } },
      lines: {
        has_more: false,
        data: [
          line("il_native_credit", -5990, item.price.id),
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
  const runtime = {
    modo: "dev" as const,
    produtos: f.products,
    conferirCatalogo: f.runtime.conferirCatalogo,
    aumentos: createStripeRecreioUpgrades({ secretKey: "unused", mode: "dev", client: f.stripe }),
  };
  const cotar = criarPreparacaoDeAumento(() => runtime);
  async function pedido() {
    const atuais = await db.select().from(profiles).where(eq(profiles.groupId, origem.groupId));
    return {
      pedidoId: randomUUID(),
      grupoId: origem.groupId,
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
