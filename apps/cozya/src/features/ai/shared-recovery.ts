import "server-only";
import { lockWebParticipation } from "@informach/auth/web-participation";
import { and, db, eq, sql } from "@informach/db";
import {
  aiOperationReceipts,
  cozyaAiOperations,
  creditLedger,
  creditReservations,
} from "@informach/db/schema";
import { z } from "zod";
import { recipeResponse, validateRecipeOutput } from "./recipe-output";

/** Reconciles settled facts only: no model invocation, grant or new reservation. */
export function recoverSharedCozyaOperation(id: string, userId: string, now: Date) {
  return db.transaction(async (tx) => {
    const participation = await lockWebParticipation(tx, userId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:ai-owner:${userId}`}))`);
    const [operation] = await tx
      .select()
      .from(cozyaAiOperations)
      .where(and(eq(cozyaAiOperations.id, id), eq(cozyaAiOperations.userId, userId)))
      .for("update");
    const unchanged = { operation, compensated: false };
    if (!operation?.familyGroupId || (operation.statusCode !== null && operation.statusCode < 500))
      return unchanged;
    const [receipt] = await tx
      .select()
      .from(aiOperationReceipts)
      .where(
        and(
          eq(aiOperationReceipts.app, "cozya"),
          eq(aiOperationReceipts.actorUserId, userId),
          eq(aiOperationReceipts.groupId, operation.familyGroupId),
          eq(aiOperationReceipts.scopeKey, id),
        ),
      )
      .for("update");
    if (receipt?.phase === "processing" && receipt.leaseUntil > now) return unchanged;
    const [hold] = receipt
      ? await tx.select().from(creditReservations).where(eq(creditReservations.id, receipt.runId))
      : [];
    if (hold?.status === "active") return unchanged;
    const [debit] = receipt
      ? await tx
          .select({ amount: creditLedger.amount })
          .from(creditLedger)
          .where(
            and(
              eq(creditLedger.reservationId, receipt.runId),
              eq(creditLedger.app, "compasso"),
              eq(creditLedger.consumerApp, "cozya"),
              eq(creditLedger.actorUserId, userId),
              eq(creditLedger.ownerType, "family"),
              eq(creditLedger.ownerId, operation.familyGroupId),
              eq(creditLedger.entryType, "consumption"),
            ),
          )
      : [];
    if (
      hold?.status === "committed" &&
      (!debit || !receipt?.result || debit.amount !== -(receipt.actualCredits ?? 0))
    )
      return unchanged;
    // An admitted request may not have reached the receipt yet. Do not race that
    // window; one hour exceeds all bounded provider stages and the receipt lease.
    if (!receipt && operation.createdAt.getTime() > now.getTime() - 3600000) return unchanged;
    let statusCode = 502;
    let response: unknown = { code: "OPERATION_INTERRUPTED", charged: false };
    if (
      receipt &&
      debit &&
      receipt.result !== null &&
      debit.amount === -(receipt.actualCredits ?? 0)
    ) {
      if (
        receipt.expiresAt <= now ||
        operation.expiresAt <= now ||
        participation.state !== "active" ||
        operation.webParticipationRevision !== participation.revision ||
        receipt.webParticipationRevision !== participation.revision
      ) {
        statusCode = 410;
        response = null;
      } else {
        statusCode = 200;
        response =
          receipt.feature === "cozya.recipe.transcribe_audio"
            ? z.object({ text: z.string().min(1).max(16000) }).parse(receipt.result)
            : recipeResponse(
                validateRecipeOutput(receipt.result),
                receipt.feature === "cozya.recipe.extract_from_text"
                  ? "text"
                  : receipt.feature === "cozya.recipe.extract_from_photo"
                    ? "image"
                    : receipt.feature === "cozya.recipe.parse_voice"
                      ? "voice"
                      : "prompt",
              );
      }
    }
    const [recovered] = await tx
      .update(cozyaAiOperations)
      .set({ statusCode, response })
      .where(eq(cozyaAiOperations.id, id))
      .returning();
    return { operation: recovered, compensated: false };
  });
}
