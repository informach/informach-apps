import "server-only";
import {
  cancelsAtPeriodEnd,
  type createStripePaymentFactReader,
  type InvoiceCaptureFact,
  type PaymentReadBudget,
} from "@informach/billing/payment-facts";
import type { StripeMode } from "@informach/config";
import type Stripe from "stripe";
import {
  comprovarFinanciamento,
  FinanciamentoInconclusivo,
  type MovimentoDoFinanciamento,
} from "./financiamento-regras";

const id = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
function conferir(value: unknown, motivo: string): asserts value {
  if (!value) throw new FinanciamentoInconclusivo(motivo);
}

export const VERSAO_DO_FINANCIAMENTO = "financiamento-2026-11-18-v1";
type LeituraDoFinanciamento = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createStripePaymentFactReader>["readWithFunding"]>>
>;
type FinanciamentoCalculado = {
  versao: typeof VERSAO_DO_FINANCIAMENTO;
  saldoAtual: number;
  ultimaMovimentacaoId: string | null;
  periodos: ReturnType<typeof comprovarFinanciamento>;
};
const CONFERIDA = Symbol("recreio.customer-funding.observed");
export type ConferenciaFinanceiraDoCliente = {
  readonly [CONFERIDA]: true;
  readonly modo: StripeMode;
  readonly clienteId: string;
  readonly paganteId: string;
  readonly leituras: readonly LeituraDoFinanciamento[];
  readonly financiamento: FinanciamentoCalculado;
};
export function conferirMarcaFinanceira(entrada: ConferenciaFinanceiraDoCliente) {
  conferir(entrada[CONFERIDA] === true, "conferencia_financeira_nao_admitida");
}

/** Private server composition. Produces financial evidence, never identity,
 * acceptance, a game grant or a mutable replacement for the historical period. */
export function criarConferenciaDeFinanciamento(config: {
  modo: StripeMode;
  cliente: Stripe;
  leitor: Pick<ReturnType<typeof createStripePaymentFactReader>, "readWithFunding">;
}) {
  function options(budget: PaymentReadBudget): Stripe.RequestOptions {
    const restante = budget.deadlineMs - Date.now();
    conferir(Number.isFinite(restante) && restante > 0, "prazo_da_leitura");
    return { timeout: Math.max(1, Math.min(10_000, restante)), maxNetworkRetries: 0 };
  }
  async function saldoDoCliente(clienteId: string, budget: PaymentReadBudget) {
    const cliente = await config.cliente.customers.retrieve(clienteId, {}, options(budget));
    conferir(!cliente.deleted && cliente.id === clienteId, "cliente_ausente_ou_divergente");
    conferir(
      cliente.livemode === (config.modo === "prod") && Number.isSafeInteger(cliente.balance),
      "modo_ou_saldo_do_cliente",
    );
    conferir(
      !Object.entries(cliente.invoice_credit_balance ?? {}).some(
        ([moeda, valor]) => moeda !== "brl" && valor !== 0,
      ),
      "saldo_em_outra_moeda",
    );
    // The native catalog and every ledger entry are BRL. Do not mix the
    // separately defined multi-currency/cash balances into invoice money.
    return cliente.balance;
  }
  function movimento(
    remoto: Stripe.CustomerBalanceTransaction,
    clienteId: string,
  ): MovimentoDoFinanciamento {
    const faturaId = id(remoto.invoice);
    conferir(
      remoto.livemode === (config.modo === "prod") &&
        id(remoto.customer) === clienteId &&
        remoto.currency === "brl" &&
        typeof remoto.id === "string" &&
        remoto.id.length > 0 &&
        faturaId &&
        Number.isSafeInteger(remoto.amount) &&
        Number.isSafeInteger(remoto.ending_balance),
      "movimento_fora_do_escopo",
    );
    return {
      id: remoto.id,
      tipo: remoto.type,
      faturaId,
      valor: remoto.amount,
      saldoFinal: remoto.ending_balance,
    };
  }
  async function calcularCliente(
    clienteId: string,
    leituras: readonly LeituraDoFinanciamento[],
    budget: PaymentReadBudget,
  ): Promise<FinanciamentoCalculado> {
    const entrada = { clienteId };
    const saldoInicial = await saldoDoCliente(entrada.clienteId, budget);
    const recentes: MovimentoDoFinanciamento[] = [];
    const vistos = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const pagina = await config.cliente.customers.listBalanceTransactions(
        entrada.clienteId,
        { limit: 100, ...(cursor ? { starting_after: cursor } : {}) },
        options(budget),
      );
      conferir(
        typeof pagina.has_more === "boolean" && Array.isArray(pagina.data),
        "ledger_incompleto",
      );
      for (const remoto of pagina.data) {
        const atual = movimento(remoto, entrada.clienteId);
        conferir(recentes.length < 600 && !vistos.has(atual.id), "ledger_repetido_ou_excessivo");
        vistos.add(atual.id);
        recentes.push(atual);
      }
      if (!pagina.has_more) break;
      const proximo = pagina.data.at(-1)?.id;
      conferir(proximo && proximo !== cursor, "cursor_do_ledger_invalido");
      cursor = proximo;
    }
    const saldoFinal = await saldoDoCliente(entrada.clienteId, budget);
    const topo = await config.cliente.customers.listBalanceTransactions(
      entrada.clienteId,
      { limit: 1 },
      options(budget),
    );
    conferir(
      typeof topo.has_more === "boolean" &&
        Array.isArray(topo.data) &&
        topo.data.length <= 1 &&
        (!topo.has_more || topo.data.length === 1),
      "fronteira_do_ledger_incompleta",
    );
    const primeiro = topo.data[0] ? movimento(topo.data[0], entrada.clienteId) : null;
    conferir(
      saldoInicial === saldoFinal &&
        JSON.stringify(primeiro) === JSON.stringify(recentes[0] ?? null),
      "saldo_alterado_durante_a_leitura",
    );
    for (const lida of leituras) {
      const contrato = await config.cliente.subscriptions.retrieve(
        lida.snapshot.subscriptionId,
        {},
        options(budget),
      );
      const item = contrato.items.data[0],
        origem = lida.snapshot.origin;
      conferir(
        contrato.id === lida.snapshot.subscriptionId &&
          contrato.livemode === (config.modo === "prod") &&
          id(contrato.customer) === entrada.clienteId &&
          !contrato.items.has_more &&
          contrato.items.data.length === 1 &&
          item?.quantity === 1 &&
          item.price.id === lida.snapshot.priceId &&
          item.current_period_start * 1000 === lida.snapshot.start.getTime() &&
          item.current_period_end * 1000 === lida.snapshot.end.getTime() &&
          contrato.status === lida.snapshot.status &&
          cancelsAtPeriodEnd(contrato, item.current_period_end) ===
            lida.snapshot.cancelAtPeriodEnd &&
          (contrato.trial_end === null ? null : contrato.trial_end * 1000) ===
            (lida.snapshot.trialEnd?.getTime() ?? null) &&
          (contrato.canceled_at === null ? null : contrato.canceled_at * 1000) ===
            (lida.snapshot.canceledAt?.getTime() ?? null) &&
          origem?.authorizationId &&
          contrato.metadata.checkout_intent_id === origem.authorizationId &&
          contrato.metadata.subject_type === origem.subjectType &&
          contrato.metadata.subject_id === origem.subjectId &&
          contrato.metadata.product_id === origem.productId,
        "contrato_alterado_durante_a_leitura",
      );
    }
    const capturas = new Map<string, InvoiceCaptureFact>();
    for (const lida of leituras)
      for (const captura of lida.funding.captures) {
        const anterior = capturas.get(captura.id);
        conferir(
          !anterior || JSON.stringify(anterior) === JSON.stringify(captura),
          "captura_alterada_durante_a_leitura",
        );
        capturas.set(captura.id, captura);
      }
    options(budget);
    const periodos = comprovarFinanciamento({
      saldoAtual: saldoFinal,
      movimentos: [...recentes].reverse(),
      capturas: [...capturas.values()].map((c) => ({
        id: c.id,
        valorCapturado: c.amountCapturedCents,
        valorEstornado: c.amountRefundedCents,
        contestada: c.disputed,
      })),
      faturas: leituras
        .flatMap((lida) => lida.funding.invoices)
        .map((f) => ({
          id: f.id,
          pagaEm: f.paidAt,
          total: f.totalCents,
          valorPago: f.amountPaidCents,
          saldoInicial: f.startingBalanceCents,
          saldoFinal: f.endingBalanceCents,
          capturas: f.captures.map((c) => ({ id: c.chargeId, valor: c.amountCents })),
          linhas: f.lines.map((l) => ({
            id: l.id,
            precoId: l.priceId,
            valor: l.amountCents,
            inicio: l.start,
            fim: l.end,
            ...(l.creditedItems
              ? {
                  creditada: {
                    faturaId: l.creditedItems.invoiceId,
                    linhas: l.creditedItems.lineIds,
                  },
                }
              : {}),
          })),
        })),
    });
    options(budget);
    return {
      versao: VERSAO_DO_FINANCIAMENTO,
      saldoAtual: saldoFinal,
      ultimaMovimentacaoId: primeiro?.id ?? null,
      periodos,
    };
  }
  function conferirEscopo(lida: LeituraDoFinanciamento, clienteId: string, assinaturaId: string) {
    conferir(
      lida.snapshot.customerId === clienteId &&
        lida.snapshot.subscriptionId === assinaturaId &&
        lida.funding.customerId === clienteId &&
        lida.funding.subscriptionId === assinaturaId &&
        lida.funding.currency === "BRL",
      "fatos_fora_do_escopo",
    );
  }
  return {
    async conferir(
      entrada: { clienteId: string; assinaturaId: string; precosAceitos: ReadonlySet<string> },
      budget: PaymentReadBudget,
    ) {
      options(budget);
      const lida = await config.leitor.readWithFunding(
        entrada.assinaturaId,
        entrada.precosAceitos,
        budget,
      );
      if (!lida) return null;
      conferirEscopo(lida, entrada.clienteId, entrada.assinaturaId);
      return {
        snapshot: lida.snapshot,
        fatos: lida.funding,
        financiamento: await calcularCliente(entrada.clienteId, [lida], budget),
      };
    },
    async conferirCliente(
      entrada: {
        clienteId: string;
        paganteId: string;
        assinaturaIds: readonly string[];
        precosAceitos: ReadonlySet<string>;
      },
      budget: PaymentReadBudget,
    ): Promise<ConferenciaFinanceiraDoCliente> {
      options(budget);
      conferir(
        entrada.clienteId.startsWith("cus_") &&
          entrada.paganteId.length > 0 &&
          entrada.assinaturaIds.length <= 600 &&
          new Set(entrada.assinaturaIds).size === entrada.assinaturaIds.length &&
          entrada.assinaturaIds.every((id) => id.startsWith("sub_")),
        "inventario_de_contratos_invalido",
      );
      const leituras: LeituraDoFinanciamento[] = [];
      let faturas = 0,
        linhas = 0;
      for (const assinaturaId of entrada.assinaturaIds) {
        const lida = await config.leitor.readWithFunding(
          assinaturaId,
          entrada.precosAceitos,
          budget,
        );
        conferir(lida, "contrato_fora_do_catalogo");
        conferirEscopo(lida, entrada.clienteId, assinaturaId);
        conferir(
          lida.snapshot.origin?.subjectType === "user" &&
            lida.snapshot.origin.subjectId === entrada.paganteId &&
            lida.snapshot.origin.authorizationId &&
            lida.snapshot.origin.productId,
          "origem_comercial_de_outro_pagante",
        );
        faturas += lida.funding.invoices.length;
        linhas += lida.funding.invoices.reduce((n, f) => n + f.lines.length, 0);
        conferir(faturas <= 600 && linhas <= 2400, "inventario_financeiro_excessivo");
        leituras.push(lida);
      }
      return {
        [CONFERIDA]: true,
        modo: config.modo,
        clienteId: entrada.clienteId,
        paganteId: entrada.paganteId,
        leituras,
        financiamento: await calcularCliente(entrada.clienteId, leituras, budget),
      };
    },
  };
}
