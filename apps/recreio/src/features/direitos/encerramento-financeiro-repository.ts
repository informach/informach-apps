import "server-only";
import { BillingError } from "@informach/billing";
import { readRecreioAccountClosureSource } from "@informach/billing/recreio-account-closure";
import type { StripeMode } from "@informach/config";
import { and, eq, isNull } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioPurchaseAuthorizations as purchases,
} from "@informach/db/schema";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
} from "@/features/account/autoridade-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { FinanceiroDoEncerramentoSchema } from "./encerramento-contrato";

/** Chamador conserva ciclo financeiro antes da TX. Leitura não conclui que
 * não há assinatura/Checkout no Stripe e não admite cancelamento. Tentativas
 * já iniciadas precisam dos conciliadores próprios antes desta preparação. */
export async function lerFinanceiroDoEncerramentoLocked(
  tx: Transacao,
  autor: AutorNativoRecente,
  modo: StripeMode,
) {
  const nativa = await autorizarContaNativa(tx, autor);
  await nativa.conferirPrazo(autor.login);
  const compras = await tx
    .select({
      id: purchases.id,
      modo: purchases.providerMode,
      iniciadaEm: purchases.requestStartedAt,
      emConferencia: purchases.reviewRequired,
    })
    .from(purchases)
    .where(and(eq(purchases.payerUserId, autor.contaId), isNull(purchases.resolvedAt)))
    .orderBy(purchases.id)
    .limit(257)
    .for("share");
  const trocas = await tx
    .select({
      id: changes.id,
      modo: changes.providerMode,
      iniciadaEm: changes.requestStartedAt,
      emConferencia: changes.reviewRequired,
    })
    .from(changes)
    .where(and(eq(changes.payerUserId, autor.contaId), isNull(changes.resolvedAt)))
    .orderBy(changes.id)
    .limit(257)
    .for("share");
  assertAllowed(
    compras.length <= 256 &&
      trocas.length <= 256 &&
      [...compras, ...trocas].every(
        (p) => p.modo === modo && p.iniciadaEm === null && !p.emConferencia,
      ),
    "COBRANCA_EM_CONFERENCIA",
    "Confira os pagamentos e trocas já enviados antes de preparar o encerramento. Seus dados pessoais continuam disponíveis.",
  );
  const origem = await readRecreioAccountClosureSource(tx, autor.contaId).catch((erro: unknown) => {
    if (erro instanceof BillingError)
      throw new AppError(
        "COBRANCA_EM_CONFERENCIA",
        "A origem financeira exige conferência antes do encerramento.",
      );
    throw erro;
  });
  if (origem.checkout) {
    const [nativaDoCheckout] = await tx
      .select({
        modo: purchases.providerMode,
        iniciadaEm: purchases.requestStartedAt,
        resolucao: purchases.resolution,
        resolvidaEm: purchases.resolvedAt,
        emConferencia: purchases.reviewRequired,
      })
      .from(purchases)
      .where(and(eq(purchases.id, origem.checkout.id), eq(purchases.payerUserId, autor.contaId)))
      .for("share");
    // Um registro financeiro sem a autorização original não se torna "não enviado".
    assertAllowed(
      origem.checkout.requestStarted &&
        nativaDoCheckout &&
        nativaDoCheckout.modo === modo &&
        !nativaDoCheckout.emConferencia &&
        nativaDoCheckout.iniciadaEm !== null &&
        nativaDoCheckout.resolvidaEm !== null &&
        (nativaDoCheckout.resolucao === "checkout_completed" ||
          nativaDoCheckout.resolucao === "expired_unpaid"),
      "COBRANCA_EM_CONFERENCIA",
      "O histórico do pagamento exige conferência antes do encerramento.",
    );
  }
  if (!origem.customer) {
    const [contrato] = await tx
      .select({ assinaturaId: contracts.subscriptionId })
      .from(contracts)
      .where(eq(contracts.payerUserId, autor.contaId))
      .limit(1)
      .for("share");
    assertAllowed(
      !contrato,
      "COBRANCA_EM_CONFERENCIA",
      "O histórico financeiro exige conferência.",
    );
  }
  await nativa.conferirPrazo(autor.login);
  const resultado = FinanceiroDoEncerramentoSchema.safeParse({
    formato: "recreio-encerramento-financeiro-v1",
    modo,
    efeito: "cancelar-renovacoes-e-checkouts-pendentes",
    periodosPagosPreservados: true,
    registrosFinanceirosPreservados: true,
    contratosDeOutrosAdultosPreservados: true,
    clientes: origem.customer
      ? [{ id: origem.customer.id, referenciaStripe: origem.customer.providerCustomerId }]
      : [],
    comprasNaoEnviadas: compras.map((p) => p.id),
    trocasNaoEnviadas: trocas.map((p) => p.id),
  });
  assertAllowed(
    resultado.success,
    "COBRANCA_EM_CONFERENCIA",
    "O escopo financeiro exige conferência.",
  );
  return resultado.data;
}
