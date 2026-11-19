import "server-only";
import { eq } from "@informach/db";
import { recreioBillingContracts as contracts } from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

type ContratoOriginal = Pick<
  typeof contracts.$inferInsert,
  | "subscriptionId"
  | "purchaseId"
  | "groupId"
  | "payerUserId"
  | "providerMode"
  | "originProductId"
  | "originPriceId"
>;

/** Called after a complete, scoped financial observation under the payer lock.
 * Initializes revision one only; never overwrites an existing current offer.
 */
export async function garantirContratoOriginalLocked(tx: Transacao, entrada: ContratoOriginal) {
  await tx
    .insert(contracts)
    .values({
      ...entrada,
      currentProductId: entrada.originProductId,
      currentPriceId: entrada.originPriceId,
    })
    .onConflictDoNothing({ target: contracts.subscriptionId });
  const [atual] = await tx
    .select()
    .from(contracts)
    .where(eq(contracts.subscriptionId, entrada.subscriptionId))
    .for("update");
  assertAllowed(
    atual &&
      atual.purchaseId === entrada.purchaseId &&
      atual.groupId === entrada.groupId &&
      atual.payerUserId === entrada.payerUserId &&
      atual.providerMode === entrada.providerMode &&
      atual.originProductId === entrada.originProductId &&
      atual.originPriceId === entrada.originPriceId &&
      atual.revision === 1 &&
      atual.currentPlanChangeId === null &&
      atual.currentProductId === entrada.originProductId &&
      atual.currentPriceId === entrada.originPriceId,
    "ORIGEM_FINANCEIRA",
    "A oferta atual do contrato exige conferência.",
  );
  return atual;
}

/** Complete financial observations must match the single current authority.
 * Only an initial offer can bootstrap revision one. A historical receipt or a
 * provider price alone can never replace the current applied-change reference.
 * Caller keeps this check in the same transaction as the financial snapshot. */
export async function conferirOfertaAtualLocked(
  tx: Transacao,
  entrada: Omit<ContratoOriginal, "originPriceId"> & {
    observedProductId: string;
    observedPriceId: string;
  },
) {
  const [atual] = await tx
    .select()
    .from(contracts)
    .where(eq(contracts.subscriptionId, entrada.subscriptionId))
    .for("update");
  if (!atual) {
    assertAllowed(
      entrada.observedProductId === entrada.originProductId,
      "ORIGEM_FINANCEIRA",
      "A oferta diferente da compra exige um recibo atual aplicado.",
    );
    return garantirContratoOriginalLocked(tx, {
      subscriptionId: entrada.subscriptionId,
      purchaseId: entrada.purchaseId,
      groupId: entrada.groupId,
      payerUserId: entrada.payerUserId,
      providerMode: entrada.providerMode,
      originProductId: entrada.originProductId,
      originPriceId: entrada.observedPriceId,
    });
  }
  assertAllowed(
    atual.purchaseId === entrada.purchaseId &&
      atual.groupId === entrada.groupId &&
      atual.payerUserId === entrada.payerUserId &&
      atual.providerMode === entrada.providerMode &&
      atual.originProductId === entrada.originProductId &&
      atual.currentProductId === entrada.observedProductId &&
      atual.currentPriceId === entrada.observedPriceId,
    "ORIGEM_FINANCEIRA",
    "A observação financeira não corresponde à oferta atual admitida.",
  );
  return atual;
}
