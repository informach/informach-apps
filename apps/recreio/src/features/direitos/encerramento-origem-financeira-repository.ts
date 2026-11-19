import "server-only";
import { createHash } from "node:crypto";
import { BillingError } from "@informach/billing";
import { RecreioRenewalReviewError } from "@informach/billing/providers/stripe-recreio-renewals";
import {
  readRecreioAccountClosureSource,
  readRecreioOwnedSubscriptions,
} from "@informach/billing/recreio-account-closure";
import { eq } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioPurchaseAuthorizations as purchases,
} from "@informach/db/schema";
import type { Transacao } from "@/lib/repository";
import type { PlanoDeEncerramento } from "./preparacao-contrato";

function reject(code: ConstructorParameters<typeof RecreioRenewalReviewError>[0]): never {
  throw new RecreioRenewalReviewError(code);
}
/** Technical read under the payer lifecycle and original operation lock.
 * Caller already verified ledger/intent/plan/participation. No browser actor,
 * provider I/O or conclusion. The complete source is compared again after I/O. */
export async function lerOrigemFinanceiraDoEncerramentoLocked(
  tx: Transacao,
  plano: PlanoDeEncerramento,
) {
  try {
    const origem = await readRecreioAccountClosureSource(tx, plano.contaId);
    const esperado = plano.financeiro.clientes[0];
    if (
      (origem.customer?.id ?? null) !== (esperado?.id ?? null) ||
      (origem.customer?.providerCustomerId ?? null) !== (esperado?.referenciaStripe ?? null)
    )
      reject("scope_changed");
    const aceites = await tx
      .select({
        id: purchases.id,
        modo: purchases.providerMode,
        produto: purchases.productId,
        iniciadaEm: purchases.requestStartedAt,
        resolvidaEm: purchases.resolvedAt,
        resolucao: purchases.resolution,
      })
      .from(purchases)
      .where(eq(purchases.payerUserId, plano.contaId))
      .orderBy(purchases.id)
      .limit(601)
      .for("share");
    if (aceites.length > 600 || aceites.some((p) => p.resolvidaEm === null || p.resolucao === null))
      reject("scope_changed");
    if (aceites.some((p) => p.iniciadaEm !== null && p.modo !== plano.financeiro.modo))
      reject("namespace_mismatch");
    const porAceite = new Map(aceites.map((p) => [p.id, p]));
    if (
      plano.financeiro.comprasNaoEnviadas.some((id) => {
        const p = porAceite.get(id);
        return !p || p.iniciadaEm !== null || p.resolucao !== "not_started";
      })
    )
      reject("scope_changed");
    const trocas = await tx
      .select({
        id: changes.id,
        modo: changes.providerMode,
        iniciadaEm: changes.requestStartedAt,
        resolvidaEm: changes.resolvedAt,
        estado: changes.status,
      })
      .from(changes)
      .where(eq(changes.payerUserId, plano.contaId))
      .orderBy(changes.id)
      .limit(601)
      .for("share");
    if (trocas.length > 600 || trocas.some((p) => p.resolvidaEm === null)) reject("scope_changed");
    const porTroca = new Map(trocas.map((p) => [p.id, p]));
    if (
      plano.financeiro.trocasNaoEnviadas.some((id) => {
        const p = porTroca.get(id);
        return !p || p.iniciadaEm !== null || p.estado !== "canceled";
      })
    )
      reject("scope_changed");
    const nativos = await tx
      .select({
        subscriptionId: contracts.subscriptionId,
        purchaseId: contracts.purchaseId,
        groupId: contracts.groupId,
        payerUserId: contracts.payerUserId,
        providerMode: contracts.providerMode,
        originProductId: contracts.originProductId,
        revision: contracts.revision,
        currentProductId: contracts.currentProductId,
        currentPriceId: contracts.currentPriceId,
      })
      .from(contracts)
      .where(eq(contracts.payerUserId, plano.contaId))
      .orderBy(contracts.subscriptionId)
      .limit(601)
      .for("update");
    if (nativos.length > 600) reject("invalid_evidence");
    if (nativos.some((p) => p.providerMode !== plano.financeiro.modo)) reject("namespace_mismatch");
    const compartilhados = await readRecreioOwnedSubscriptions(tx, plano.contaId);
    if (compartilhados.length !== nativos.length) reject("foreign_contract");
    const porAssinatura = new Map(compartilhados.map((p) => [p.id, p]));
    const assinaturas = nativos.map((contrato) => {
      const comum = porAssinatura.get(contrato.subscriptionId),
        aceite = porAceite.get(contrato.purchaseId);
      if (
        !origem.customer ||
        !comum ||
        comum.customerId !== origem.customer.id ||
        comum.providerCustomerId !== origem.customer.providerCustomerId ||
        !aceite ||
        aceite.modo !== contrato.providerMode ||
        aceite.produto !== contrato.originProductId ||
        aceite.iniciadaEm === null ||
        aceite.resolucao !== "checkout_completed"
      )
        reject("foreign_contract");
      if (!(comum.periodEnd instanceof Date) || !Number.isFinite(comum.periodEnd.getTime()))
        reject("invalid_evidence");
      return { contrato, comum };
    });
    if (!origem.customer && (nativos.length || aceites.some((p) => p.iniciadaEm !== null)))
      reject("invalid_evidence");
    // A managed Checkout is retained financial identity, not inferred absence.
    if (origem.checkout) {
      const aceite = porAceite.get(origem.checkout.id);
      if (
        !origem.checkout.requestStarted ||
        !aceite ||
        aceite.iniciadaEm === null ||
        (aceite.resolucao !== "checkout_completed" && aceite.resolucao !== "expired_unpaid")
      )
        reject("scope_changed");
    }
    const fonte = {
      contaId: plano.contaId,
      cliente: origem.customer,
      checkout: origem.checkout,
      compras: aceites,
      trocas,
      assinaturas,
    };
    return {
      ...fonte,
      sha256: createHash("sha256")
        .update(
          JSON.stringify({
            formato: "recreio-origem-financeira-v1",
            financeiro: plano.financeiro,
            ...fonte,
          }),
        )
        .digest("hex"),
    };
  } catch (error) {
    if (error instanceof BillingError && !(error instanceof RecreioRenewalReviewError))
      reject("invalid_evidence");
    throw error;
  }
}
