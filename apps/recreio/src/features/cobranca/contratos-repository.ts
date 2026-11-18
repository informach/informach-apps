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
