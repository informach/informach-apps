import "server-only";
import { and, db, eq } from "@informach/db";
import { cozyaAiOperations, creditLedger, creditReservations } from "@informach/db/schema";
import { billing } from "@/features/billing/service";

/** Reconcile a finished failure or abandoned request, including an ambiguous billing commit.
 * Row locking serializes recovery; the ledger event makes compensation independently idempotent.
 * An hour exceeds all model deadlines, including the audio + search + parse pipeline.
 */
export async function recoverInterruptedAiOperation(id: string, userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [operation] = await tx
      .select()
      .from(cozyaAiOperations)
      .where(and(eq(cozyaAiOperations.id, id), eq(cozyaAiOperations.userId, userId)))
      .for("update");
    if (
      !operation ||
      operation.createdAt.getTime() > now.getTime() - 3_600_000 ||
      (operation.statusCode !== null && operation.statusCode < 500) ||
      (operation.response as { code?: string } | null)?.code === "OPERATION_INTERRUPTED"
    )
      return { operation, compensated: false };
    const [reservation] = await tx
      .select()
      .from(creditReservations)
      .where(
        and(
          eq(creditReservations.id, id),
          eq(creditReservations.app, "cozya"),
          eq(creditReservations.ownerId, userId),
        ),
      );
    if (reservation?.status === "active")
      await billing.releaseReservation({ reservationId: id, reason: "timeout" });
    const [debit] = await tx
      .select({ amount: creditLedger.amount })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.reservationId, id),
          eq(creditLedger.app, "cozya"),
          eq(creditLedger.ownerId, userId),
          eq(creditLedger.entryType, "consumption"),
        ),
      )
      .limit(1);
    let compensated = false;
    if (debit) {
      const grant = await billing.grantBonusCredits({
        owner: { type: "user", id: userId },
        amount: Math.abs(debit.amount),
        reason: "compensation",
        stripeEventId: `cozya_operation_recovery_${id}`,
        expiresAt: new Date(now.getTime() + 30 * 86_400_000),
        metadata: { operationId: id, reason: "preview_unavailable" },
      });
      compensated = !grant.alreadyProcessed;
    }
    const [recovered] = await tx
      .update(cozyaAiOperations)
      .set({
        statusCode: 502,
        response: { code: "OPERATION_INTERRUPTED", creditRestored: Boolean(debit) },
      })
      .where(eq(cozyaAiOperations.id, id))
      .returning();
    return { operation: recovered, compensated };
  });
}
