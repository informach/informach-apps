import { randomUUID } from "node:crypto";
import { createStripeRecreioUpgrades } from "@informach/billing/providers/stripe-recreio-upgrades";
import { db, eq } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import {
  criarAceiteDeTroca,
  criarEncerramentoDeTroca,
} from "@/features/cobranca/troca-aceite-service";
import {
  criarPreparacaoDeAumento,
  criarPreparacaoDeReducao,
} from "@/features/cobranca/troca-cotacao-service";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";

type Pagamento = ReturnType<Awaited<ReturnType<typeof fixtureDePagamento>>["concluirCheckout"]>;
const CASOS = [
  ["individual_monthly", "family_monthly", "upgrade"],
  ["individual_monthly", "family_annual", "upgrade"],
  ["individual_annual", "family_monthly", "upgrade"],
  ["individual_annual", "family_annual", "upgrade"],
  ["family_monthly", "individual_monthly", "downgrade"],
  ["family_monthly", "individual_annual", "downgrade"],
  ["family_annual", "individual_monthly", "downgrade"],
  ["family_annual", "individual_annual", "downgrade"],
  ["individual_monthly", "individual_annual", "upgrade"],
  ["family_monthly", "family_annual", "upgrade"],
  ["individual_annual", "individual_monthly", "downgrade"],
  ["family_annual", "family_monthly", "downgrade"],
] as const;

/** Full native quote/accept/close for all twelve directions, with SDK/PG and
 * fixture HTTP. Execution/settlement has separate gates; no provider API claim. */
describe("matriz nativa das doze cotações e consentimentos", () => {
  it.each(CASOS)("%s → %s: %s sem antecipar a oferta ou enviar a troca", async (de, para, tipo) => {
    let pagamento: Pagamento | undefined;
    let previa = 0;
    const destinoId = `recreio_${para}`;
    const f: Awaited<ReturnType<typeof fixtureDePagamento>> = await fixtureDePagamento(
      false,
      `recreio_${de}`,
      async (request) => {
        if (
          request.method !== "POST" ||
          new URL(request.url).pathname !== "/v1/invoices/create_preview"
        )
          return null;
        const pago = pagamento,
          oferta = f.products.find((p) => p.id === destinoId),
          item = pago?.assinatura.items.data[0];
        if (!pago || !oferta?.listPrice || !item) throw new Error("Closed matrix origin absent");
        previa++;
        const corpo = new URLSearchParams(await request.text());
        expect(corpo.get("subscription")).toBe(pago.assinatura.id);
        expect(corpo.get("subscription_details[items][0][price]")).toBe(oferta.stripePriceId.dev);
        const total = oferta.listPrice.amountCents - pago.fatura.amount_paid;
        const linha = (id: string, amount: number, price: string) => ({
          id,
          amount,
          currency: "brl",
          quantity: 1,
          parent: { subscription_item_details: { subscription: pago.assinatura.id } },
          pricing: { price_details: { price } },
        });
        return Response.json({
          id: "upcoming_matrix",
          object: "invoice",
          livemode: false,
          customer: f.providerCustomerId,
          currency: "brl",
          amount_due: Math.max(0, total),
          total,
          starting_balance: 0,
          parent: { subscription_details: { subscription: pago.assinatura.id } },
          lines: {
            has_more: false,
            data: [
              linha("il_matrix_credit", -pago.fatura.amount_paid, item.price.id),
              linha("il_matrix_target", oferta.listPrice.amountCents, oferta.stripePriceId.dev),
            ],
          },
        });
      },
    );
    await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
    pagamento = f.concluirCheckout();
    const processar = criarProcessadorDeConciliacao({
      modo: "dev",
      obterRuntime: () => f.runtimeFinanceiro,
      relatarFalha: () => {},
    });
    expect((await processar()).conciliadas).toBe(1);
    const [contrato] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.purchaseId, f.recibo.id));
    if (!contrato) throw new Error("Native matrix current offer absent");
    const runtime = {
      modo: "dev" as const,
      produtos: f.products,
      conferirCatalogo: f.runtime.conferirCatalogo,
      aumentos: createStripeRecreioUpgrades({ secretKey: "unused", mode: "dev", client: f.stripe }),
    };
    const cotar =
      tipo === "upgrade"
        ? criarPreparacaoDeAumento(() => runtime)
        : criarPreparacaoDeReducao(() => runtime);
    const cotacao = await cotar(f.adulto.autor, {
      pedidoId: randomUUID(),
      grupoId: contrato.groupId,
      produtoDestino: destinoId,
      revisaoContrato: 1,
      perfis: [],
    });
    expect(cotacao).toMatchObject({
      tipo,
      produtoAtual: `recreio_${de}`,
      produtoDestino: destinoId,
      revisaoContrato: 1,
    });
    expect(previa).toBe(tipo === "upgrade" ? 1 : 0);
    const requisicoes = f.requests.length;
    const aceitar = criarAceiteDeTroca(() => runtime);
    const aceite = {
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
    };
    expect(await aceitar(f.adulto.autor, aceite)).toMatchObject({
      id: cotacao.id,
      estado: "accepted",
      tentativaEm: null,
    });
    expect(await aceitar(f.adulto.autor, aceite)).toMatchObject({
      id: cotacao.id,
      estado: "accepted",
      tentativaEm: null,
    });
    expect(f.requests).toHaveLength(requisicoes);
    const encerrado = await criarEncerramentoDeTroca(() => "dev")(f.adulto.autor, cotacao.id);
    expect(encerrado).toMatchObject({ estado: "canceled", tentativaEm: null });
    expect(
      (
        await db
          .select()
          .from(contracts)
          .where(eq(contracts.subscriptionId, contrato.subscriptionId))
      )[0],
    ).toEqual(contrato);
    expect(
      (await db.select().from(changes).where(eq(changes.id, cotacao.id)))[0]?.requestStartedAt,
    ).toBeNull();
  });
});
