import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  assertRecreioClosureInventory,
  type RecreioClosureInventory,
  type RecreioClosureInventoryScope,
} from "@informach/billing/providers/stripe-recreio-closure-inventory";
import { RecreioRenewalReviewError } from "@informach/billing/providers/stripe-recreio-renewals";
import { assertAllowed } from "@/lib/errors";
import {
  type CoordenacaoDeEfeitos,
  comCicloFinanceiroDaCoordenacao,
  dadosFinanceirosDaCoordenacaoPrivada,
  reconferirFinanceiroPrivado,
} from "./coordenacao-repository";
import type { RuntimeFinanceiroDoEncerramento } from "./encerramento-financeiro-execucao-service";
import { lerFinanceiroConfirmadoRecuperado } from "./encerramento-financeiro-recuperado-repository";

/** Descriptive current assessment, deliberately not an erasure capability or
 * a terminal recovery receipt. A confirmed row in a restored archive is only
 * history: obtain a new complete provider inventory and re-read its entire
 * local source. Original confirmations and their dates remain byte-identical. */
export async function avaliarFinanceiroConfirmadoRecuperado(
  config: CoordenacaoDeEfeitos,
  obterRuntime: () => RuntimeFinanceiroDoEncerramento,
) {
  const privado = dadosFinanceirosDaCoordenacaoPrivada(config);
  assertAllowed(privado.contaId, "DIREITOS_INTEGRIDADE", "Pagante privado ausente.");
  return comCicloFinanceiroDaCoordenacao(config, privado.contaId, async () => {
    await reconferirFinanceiroPrivado(config);
    const antes = await lerFinanceiroConfirmadoRecuperado(config);
    const deadlineMs = Date.now() + 90000;
    let observacao: RecreioClosureInventory | null = null;
    if (antes.origem.cliente) {
      const runtime = obterRuntime();
      if (runtime.modo !== antes.financeiro.providerMode)
        throw new RecreioRenewalReviewError("namespace_mismatch");
      const scope: RecreioClosureInventoryScope = {
        operationId: antes.op.id,
        customerId: antes.origem.cliente.providerCustomerId,
        payerId: antes.op.requesterUserId,
        purchases: antes.origem.compras.map((p) => ({
          authorizationId: p.id,
          productId: p.produto,
        })),
        contracts: antes.origem.assinaturas.map(({ contrato, comum }) => ({
          subscriptionId: comum.providerSubscriptionId,
          authorizationId: contrato.purchaseId,
          productId: contrato.originProductId,
        })),
        budget: { deadlineMs },
      };
      observacao = await runtime.inventario.inspect(scope);
      assertRecreioClosureInventory(observacao, scope, runtime.modo);
    }
    await reconferirFinanceiroPrivado(config);
    const depois = await lerFinanceiroConfirmadoRecuperado(config);
    assertAllowed(
      Date.now() < deadlineMs && isDeepStrictEqual(antes, depois),
      "DIREITOS_INTEGRIDADE",
      "A origem financeira mudou durante a avaliação atual.",
    );
    if (observacao) {
      if (
        observacao.checkouts.some((c) => !c.settled) ||
        depois.renovacoes.some((r) => r.state !== "confirmed")
      )
        throw new RecreioRenewalReviewError("scope_changed");
      for (const assinatura of observacao.subscriptions) {
        if (assinatura.terminal) continue;
        const origem = depois.origem.assinaturas.find(
          (s) => s.comum.providerSubscriptionId === assinatura.id,
        );
        const renovacao = depois.renovacoes.find(
          (r) => r.subscriptionId === origem?.contrato.subscriptionId,
        );
        if (
          !origem ||
          !assinatura.stopsAt ||
          assinatura.stopsAt.getTime() <= Date.now() ||
          !renovacao ||
          renovacao.state !== "confirmed" ||
          renovacao.providerResult !== "scheduled" ||
          !renovacao.providerStopAt ||
          assinatura.stopsAt > renovacao.providerStopAt ||
          renovacao.purchaseId !== origem.contrato.purchaseId ||
          renovacao.originProductId !== origem.contrato.originProductId ||
          renovacao.providerCustomerId !== depois.origem.cliente?.providerCustomerId ||
          renovacao.providerSubscriptionId !== assinatura.id
        )
          throw new RecreioRenewalReviewError("scope_changed");
      }
    }
    const avaliadaEm = new Date().toISOString();
    const recibo = {
      formato: "recreio-avaliacao-financeira-recuperada-v1" as const,
      execucaoId: privado.execucaoId,
      operacaoId: antes.op.id,
      cercaSha256: privado.cerca,
      planoSha256: antes.op.planSha256,
      modo: antes.financeiro.providerMode,
      origemSha256: antes.origem.sha256,
      observacaoOriginalSha256: antes.financeiro.observationSha256,
      observacaoAtualSha256: observacao?.sha256 ?? null,
      resultado: observacao ? ("provider_inventory" as const) : ("no_customer" as const),
      avaliadaEm,
    };
    dadosFinanceirosDaCoordenacaoPrivada(config);
    return Object.freeze({
      ...recibo,
      sha256: createHash("sha256").update(JSON.stringify(recibo)).digest("hex"),
    });
  });
}
