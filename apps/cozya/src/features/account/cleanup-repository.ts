import "server-only";
import { and, type Database, eq, sql } from "@informach/db";
import {
  agentRuns,
  aiOperationReceipts,
  cozyaAiOperations,
  cozyaCookingSessions,
  cozyaMeals,
  cozyaProductEvents,
  cozyaProfiles,
  cozyaRecipes,
  cozyaShoppingLists,
} from "@informach/db/schema";

export type CozyaCleanupTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export class PendingAiCleanupError extends Error {
  constructor() {
    super(
      "Uma operação de IA está em andamento ou aguardando devolução de crédito. Tente apagar novamente após a conclusão.",
    );
    this.name = "PendingAiCleanupError";
  }
}
export const unresolvedCozyaOperation = sql`(${cozyaAiOperations.statusCode} IS NULL OR (${cozyaAiOperations.statusCode} >= 500 AND coalesce(${cozyaAiOperations.response}->>'code', '') <> 'OPERATION_INTERRUPTED'))`;

/** The entry point must first hold active participation or the exact frozen
 * operation. This shared primitive owns the app's cleanup, never billing facts. */
export async function lockSettledCozyaCleanup(tx: CozyaCleanupTransaction, userId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:ai-owner:${userId}`}))`);
  const [pending] = await tx.execute<{ pending: boolean }>(sql`select (
    exists (select 1 from ${cozyaAiOperations} where ${cozyaAiOperations.userId} = ${userId} and ${unresolvedCozyaOperation})
    or exists (select 1 from ${aiOperationReceipts} where ${aiOperationReceipts.app} = 'cozya' and ${aiOperationReceipts.actorUserId} = ${userId}
      and ${aiOperationReceipts.phase} = 'processing' and ${aiOperationReceipts.leaseUntil} > clock_timestamp())
    or exists (select 1 from billing.credit_reservations where status = 'active' and (
      (app = 'cozya' and owner_type = 'user' and owner_id = ${userId})
      or (app = 'compasso' and consumer_app = 'cozya' and actor_user_id = ${userId})))
  ) as pending`);
  if (!pending || pending.pending) throw new PendingAiCleanupError();
}

/** Must follow lockSettledCozyaCleanup and participation authorization in this tx.
 * Keeping HTTP tombstones prevents a delayed retry purchasing the same result. */
export async function clearCozyaAiCaches(tx: CozyaCleanupTransaction, userId: string) {
  await tx
    .delete(aiOperationReceipts)
    .where(and(eq(aiOperationReceipts.app, "cozya"), eq(aiOperationReceipts.actorUserId, userId)));
  await tx
    .update(cozyaAiOperations)
    .set({ response: null, statusCode: 410 })
    .where(eq(cozyaAiOperations.userId, userId));
}

/** Both local clearing and durable closure use this exact content selection. */
export async function clearCozyaPrivateContent(tx: CozyaCleanupTransaction, userId: string) {
  await tx.delete(cozyaMeals).where(eq(cozyaMeals.userId, userId));
  await tx.delete(cozyaShoppingLists).where(eq(cozyaShoppingLists.userId, userId));
  await tx.delete(cozyaCookingSessions).where(eq(cozyaCookingSessions.userId, userId));
  await tx.delete(cozyaRecipes).where(eq(cozyaRecipes.userId, userId));
  await clearCozyaAiCaches(tx, userId);
  await tx.delete(cozyaProductEvents).where(eq(cozyaProductEvents.userId, userId));
  // Local clearing preserves the previous trial; closure may remove this row
  // afterwards, while the independent anti-abuse claim remains untouched.
  await tx
    .update(cozyaProfiles)
    .set({ preferences: "", householdSize: 2, updatedAt: new Date() })
    .where(eq(cozyaProfiles.userId, userId));
  await tx
    .delete(agentRuns)
    .where(
      and(
        eq(agentRuns.app, "cozya"),
        sql`(${agentRuns.metadata}->>'userId' = ${userId} OR ${agentRuns.id} IN (SELECT id FROM billing.credit_reservations WHERE (app = 'cozya' AND owner_type = 'user' AND owner_id = ${userId}) OR (app = 'compasso' AND consumer_app = 'cozya' AND actor_user_id = ${userId})) OR ${agentRuns.metadata}->>'reservationId' IN (SELECT id::text FROM billing.credit_reservations WHERE (app = 'cozya' AND owner_type = 'user' AND owner_id = ${userId}) OR (app = 'compasso' AND consumer_app = 'cozya' AND actor_user_id = ${userId})))`,
      ),
    );
}
