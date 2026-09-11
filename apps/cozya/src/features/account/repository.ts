import "server-only";
import { and, db, eq, inArray, ne, sql } from "@informach/db";
import {
  agentRuns,
  cozyaAiOperations,
  cozyaCookingSessions,
  cozyaMeals,
  cozyaProductEvents,
  cozyaProfiles,
  cozyaRecipes,
  cozyaShoppingItems,
  cozyaShoppingLists,
  customers,
  subscriptions,
} from "@informach/db/schema";
import { recoverInterruptedAiOperation } from "@/features/ai/recovery";

export class PendingAiCleanupError extends Error {
  constructor() {
    super(
      "Uma operação de IA está em andamento ou aguardando devolução de crédito. Tente apagar novamente após a conclusão.",
    );
    this.name = "PendingAiCleanupError";
  }
}

const unresolvedOperation = sql`(${cozyaAiOperations.statusCode} IS NULL OR (${cozyaAiOperations.statusCode} >= 500 AND coalesce(${cozyaAiOperations.response}->>'code', '') <> 'OPERATION_INTERRUPTED'))`;

export async function saveCulinaryProfile(
  userId: string,
  input: { householdSize: number; preferences: string },
) {
  await db
    .insert(cozyaProfiles)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: cozyaProfiles.userId, set: { ...input, updatedAt: new Date() } });
}

export async function exportCozyaData(userId: string) {
  const [recipes, profile, meals, shoppingLists, cooking, events, aiPreviews] = await Promise.all([
    db.select().from(cozyaRecipes).where(eq(cozyaRecipes.userId, userId)),
    db.select().from(cozyaProfiles).where(eq(cozyaProfiles.userId, userId)),
    db.select().from(cozyaMeals).where(eq(cozyaMeals.userId, userId)),
    db.select().from(cozyaShoppingLists).where(eq(cozyaShoppingLists.userId, userId)),
    db.select().from(cozyaCookingSessions).where(eq(cozyaCookingSessions.userId, userId)),
    db
      .select({ name: cozyaProductEvents.name, occurredAt: cozyaProductEvents.occurredAt })
      .from(cozyaProductEvents)
      .where(eq(cozyaProductEvents.userId, userId)),
    db
      .select({
        id: cozyaAiOperations.id,
        response: cozyaAiOperations.response,
        createdAt: cozyaAiOperations.createdAt,
        expiresAt: cozyaAiOperations.expiresAt,
      })
      .from(cozyaAiOperations)
      .where(
        and(eq(cozyaAiOperations.userId, userId), sql`${cozyaAiOperations.expiresAt} > now()`),
      ),
  ]);
  const ids = shoppingLists.map((list) => list.id);
  const shoppingItems = ids.length
    ? await db.select().from(cozyaShoppingItems).where(inArray(cozyaShoppingItems.listId, ids))
    : [];
  return {
    version: 1,
    exportedAt: new Date(),
    recipes,
    profile: profile[0] ?? null,
    meals,
    shoppingLists,
    shoppingItems,
    cooking,
    events,
    aiPreviews,
  };
}

export async function clearCozyaData(userId: string) {
  const unresolved = await db
    .select({ id: cozyaAiOperations.id })
    .from(cozyaAiOperations)
    .where(and(eq(cozyaAiOperations.userId, userId), unresolvedOperation))
    .limit(100);
  for (const operation of unresolved) await recoverInterruptedAiOperation(operation.id, userId);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:ai-owner:${userId}`}))`);
    const [pending] = await tx
      .select({ id: cozyaAiOperations.id })
      .from(cozyaAiOperations)
      .where(and(eq(cozyaAiOperations.userId, userId), unresolvedOperation))
      .limit(1);
    if (pending) throw new PendingAiCleanupError();
    await tx.delete(cozyaMeals).where(eq(cozyaMeals.userId, userId));
    await tx.delete(cozyaShoppingLists).where(eq(cozyaShoppingLists.userId, userId));
    await tx.delete(cozyaRecipes).where(eq(cozyaRecipes.userId, userId));
    await tx.delete(cozyaAiOperations).where(eq(cozyaAiOperations.userId, userId));
    await tx.delete(cozyaProductEvents).where(eq(cozyaProductEvents.userId, userId));
    // Clearing app data never restarts a trial or regrants promotional credits.
    await tx
      .update(cozyaProfiles)
      .set({ preferences: "", householdSize: 2, updatedAt: new Date() })
      .where(eq(cozyaProfiles.userId, userId));
    await tx
      .delete(agentRuns)
      .where(
        and(
          eq(agentRuns.app, "cozya"),
          sql`(${agentRuns.metadata}->>'userId' = ${userId} OR ${agentRuns.id} IN (SELECT id FROM billing.credit_reservations WHERE app = 'cozya' AND owner_type = 'user' AND owner_id = ${userId}) OR ${agentRuns.metadata}->>'reservationId' IN (SELECT id::text FROM billing.credit_reservations WHERE app = 'cozya' AND owner_type = 'user' AND owner_id = ${userId}))`,
        ),
      );
  });
}

export async function hasOtherAppSubscriptions(userId: string) {
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(
      and(
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, userId),
        ne(customers.app, "cozya"),
        inArray(subscriptions.status, [
          "active",
          "trialing",
          "past_due",
          "unpaid",
          "incomplete",
          "paused",
        ]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
