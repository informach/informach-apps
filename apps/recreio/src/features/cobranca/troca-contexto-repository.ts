import "server-only";
import type { StripeMode } from "@informach/config";
import { eq } from "@informach/db";
import {
  recreioRenewalCancellations as cancellations,
  recreioBillingContracts as contracts,
} from "@informach/db/schema";
import type { GrupoId } from "@informach/recreio";
import { limiteFinanceiroDaAssinatura } from "@/features/acesso/decisao";
import { lerFatosDoGrupo } from "@/features/acesso/repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

/** Caller holds the payer lifecycle and has admitted the native group/profiles.
 * A courtesy can never replace the actual current paid contract here. */
export async function lerContratoParaTrocaLocked(
  tx: Transacao,
  entrada: {
    grupoId: GrupoId;
    paganteId: string;
    modo: StripeMode;
    revisao: number;
    agora: Date;
  },
) {
  const fatos = await lerFatosDoGrupo(entrada.grupoId, tx);
  const assinatura = fatos?.assinaturaAtiva;
  assertAllowed(
    assinatura &&
      assinatura.cancelaEm === null &&
      limiteFinanceiroDaAssinatura(assinatura, entrada.agora),
    "PLANO",
    "Confirme o pagamento e a situação atual do contrato antes de trocar.",
  );
  const [contrato] = await tx
    .select()
    .from(contracts)
    .where(eq(contracts.subscriptionId, assinatura.id))
    .for("update");
  const [cancelamento] = await tx
    .select({ id: cancellations.id })
    .from(cancellations)
    .where(eq(cancellations.subscriptionId, assinatura.id))
    .for("share");
  assertAllowed(
    !cancelamento,
    "RENOVACAO_CANCELADA",
    "A renovação desta assinatura já teve cancelamento solicitado. Acompanhe esse pedido antes de contratar outro período.",
  );
  assertAllowed(
    contrato &&
      contrato.groupId === entrada.grupoId &&
      contrato.payerUserId === entrada.paganteId &&
      contrato.providerMode === entrada.modo &&
      contrato.revision === entrada.revisao &&
      contrato.currentProductId === assinatura.productId &&
      contrato.currentPriceId === assinatura.financeiro.precoId &&
      !contrato.coverageReviewRequired,
    "CONFLITO",
    "O contrato mudou. Confira a oferta atual novamente.",
  );
  return { contrato, assinatura };
}
