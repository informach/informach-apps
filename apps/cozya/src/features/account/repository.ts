import "server-only";
import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { and, db, eq, inArray, ne, sql } from "@informach/db";
import {
  checkoutIntents,
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
import { availableCozyaAiOutputs } from "@/features/ai/previews";
import { recoverInterruptedAiOperation } from "@/features/ai/recovery";
import {
  clearCozyaPrivateContent,
  lockSettledCozyaCleanup,
  unresolvedCozyaOperation,
} from "./cleanup-repository";
import { activeCozyaUserCondition, withActiveCozyaUser } from "./participation-repository";

export { PendingAiCleanupError } from "./cleanup-repository";

export async function saveCulinaryProfile(
  userId: string,
  input: { householdSize: number; preferences: string },
) {
  await withActiveCozyaUser(userId, (tx) =>
    tx
      .insert(cozyaProfiles)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: cozyaProfiles.userId,
        set: { ...input, updatedAt: new Date() },
      }),
  );
}

export async function exportCozyaData(userId: string) {
  await db.transaction((tx) => lockActiveWebParticipation(tx, userId));
  const [recipes, profile, meals, shoppingLists, cooking, events, aiPreviews] = await Promise.all([
    db.select().from(cozyaRecipes).where(activeCozyaUserCondition(cozyaRecipes.userId, userId)),
    db.select().from(cozyaProfiles).where(activeCozyaUserCondition(cozyaProfiles.userId, userId)),
    db.select().from(cozyaMeals).where(activeCozyaUserCondition(cozyaMeals.userId, userId)),
    db
      .select()
      .from(cozyaShoppingLists)
      .where(activeCozyaUserCondition(cozyaShoppingLists.userId, userId)),
    db
      .select()
      .from(cozyaCookingSessions)
      .where(activeCozyaUserCondition(cozyaCookingSessions.userId, userId)),
    db
      .select({ name: cozyaProductEvents.name, occurredAt: cozyaProductEvents.occurredAt })
      .from(cozyaProductEvents)
      .where(activeCozyaUserCondition(cozyaProductEvents.userId, userId)),
    availableCozyaAiOutputs(userId).then((rows) =>
      rows.map(({ id, response, createdAt, expiresAt }) => ({
        id,
        response,
        createdAt,
        expiresAt,
      })),
    ),
  ]);
  const ids = shoppingLists.map((list) => list.id);
  const shoppingItems = ids.length
    ? await db
        .select()
        .from(cozyaShoppingItems)
        .where(
          and(
            inArray(cozyaShoppingItems.listId, ids),
            sql`exists (select 1 from ${cozyaShoppingLists} where ${cozyaShoppingLists.id} = ${cozyaShoppingItems.listId} and ${activeCozyaUserCondition(cozyaShoppingLists.userId, userId)})`,
          ),
        )
    : [];
  await db.transaction((tx) => lockActiveWebParticipation(tx, userId));
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

/** Recovery is bounded and separate from the short content transaction. */
export async function recoverCozyaCleanupOperations(userId: string) {
  const unresolved = await db
    .select({ id: cozyaAiOperations.id })
    .from(cozyaAiOperations)
    .where(and(eq(cozyaAiOperations.userId, userId), unresolvedCozyaOperation))
    .limit(100);
  for (const operation of unresolved) await recoverInterruptedAiOperation(operation.id, userId);
}

export async function clearCozyaData(userId: string) {
  await recoverCozyaCleanupOperations(userId);
  await db.transaction(async (tx) => {
    await lockActiveWebParticipation(tx, userId);
    await lockSettledCozyaCleanup(tx, userId);
    await clearCozyaPrivateContent(tx, userId);
  });
}

export async function hasOtherAppSubscriptions(userId: string) {
  const pending = await db
    .select({ id: checkoutIntents.id })
    .from(checkoutIntents)
    .innerJoin(customers, eq(checkoutIntents.customerId, customers.id))
    .where(and(eq(checkoutIntents.userId, userId), ne(customers.app, "cozya")))
    .limit(1);
  if (pending.length) return true;
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
