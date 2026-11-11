import { randomUUID } from "node:crypto";
import { PRODUCTS } from "@informach/config";
import { db, eq, sql } from "@informach/db";
import {
  creditFundingStates,
  creditLedger,
  customers,
  legacyContractObservations,
  subscriptionPaymentPeriods,
  subscriptions,
  users,
} from "@informach/db/schema";
import { afterAll, expect, it } from "vitest";
import { refreshLegacySubscriptionGrants } from "./legacy-subscriptions";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Disposable database required");

let fixtureUserId: string | undefined;
afterAll(async () => {
  if (!fixtureUserId) return;
  const actorId = fixtureUserId;
  await db
    .delete(creditFundingStates)
    .where(
      sql`${creditFundingStates.grantEntryId} in (select l.id from billing.credit_ledger l where l.owner_type = 'user' and l.owner_id = ${actorId})`,
    );
  await db.delete(creditLedger).where(eq(creditLedger.ownerId, actorId));
  await db
    .delete(legacyContractObservations)
    .where(
      sql`${legacyContractObservations.subscriptionId} in (select s.id from billing.subscriptions s join billing.customers c on c.id = s.customer_id where c.subject_type = 'user' and c.subject_id = ${actorId})`,
    );
  await db
    .delete(subscriptionPaymentPeriods)
    .where(
      sql`${subscriptionPaymentPeriods.subscriptionId} in (select s.id from billing.subscriptions s join billing.customers c on c.id = s.customer_id where c.subject_type = 'user' and c.subject_id = ${actorId})`,
    );
  await db
    .delete(subscriptions)
    .where(
      sql`${subscriptions.customerId} in (select c.id from billing.customers c where c.subject_type = 'user' and c.subject_id = ${actorId})`,
    );
  await db.delete(customers).where(eq(customers.subjectId, actorId));
  await db.delete(users).where(eq(users.id, actorId));
});

it("advances beyond a full failing batch without turning failed attempts into payment evidence", async () => {
  const userId = randomUUID();
  fixtureUserId = userId;
  await db.insert(users).values({
    id: userId,
    name: "Reconciliation queue",
    email: `${userId}@example.test`,
    emailVerified: true,
  });
  const [customer] = await db
    .insert(customers)
    .values({
      app: "agenda-da-turma",
      provider: "stripe",
      providerCustomerId: `cus_${randomUUID()}`,
      subjectType: "user",
      subjectId: userId,
      email: `${userId}@example.test`,
    })
    .returning();
  if (!customer) throw new Error("Missing customer fixture");
  const product = PRODUCTS.find(
    (product) =>
      product.app === "agenda-da-turma" &&
      product.kind === "subscription" &&
      product.stripePriceId.dev,
  );
  if (!product) throw new Error("Missing historical catalog");
  const start = new Date(Date.now() - 60_000);
  const end = new Date(Date.now() + 30 * 86400000);
  const failedIds = Array.from({ length: 50 }, () => `00000000${randomUUID().slice(8)}`);
  const healthyId = `ffffffff${randomUUID().slice(8)}`;
  await db.insert(subscriptions).values(
    [...failedIds, healthyId].map((id) => ({
      id,
      customerId: customer.id,
      provider: "stripe" as const,
      providerSubscriptionId: `sub_${id}`,
      providerPriceId: product.stripePriceId.dev,
      productId: product.id,
      status: "active" as const,
      currentPeriodStart: start,
      currentPeriodEnd: end,
    })),
  );
  const invoiceId = `in_${randomUUID()}`;
  await db.insert(creditLedger).values({
    app: "agenda-da-turma",
    ownerType: "user",
    ownerId: userId,
    entryType: "bonus_grant",
    amount: 10,
    expiresAt: end,
    metadata: { invoiceId },
  });
  const visited = new Set<string>();
  const deps = {
    db,
    app: "agenda-da-turma",
    products: PRODUCTS,
    providerClient: {
      async readSubscriptionPaymentFacts(id: string) {
        visited.add(id);
        if (id !== `sub_${healthyId}`) throw new Error("Fixture provider unavailable");
        return {
          customerId: customer.providerCustomerId,
          subscriptionId: id,
          priceId: product.stripePriceId.dev,
          status: "active" as const,
          start,
          end,
          trialEnd: null,
          canceledAt: null,
          cancelAtPeriodEnd: false,
          observedAt: new Date(),
          periods: [
            {
              invoiceId,
              lineId: `il_${healthyId}`,
              priceId: product.stripePriceId.dev,
              start,
              end,
              paidAt: start,
              fullyRefunded: false,
              disputed: false,
            },
          ],
        };
      },
    },
  };
  // Other isolated suites can leave candidates. Bound traversal by their actual
  // count; repeated failures must not consume every next batch indefinitely.
  const [total] = await db.select({ count: sql<number>`count(*)::integer` }).from(subscriptions);
  const batches = Math.ceil((total?.count ?? 51) / 50) + 1;
  for (let index = 0; index < batches && !visited.has(`sub_${healthyId}`); index++) {
    try {
      await refreshLegacySubscriptionGrants(deps);
    } catch (error) {
      if (!(error instanceof AggregateError)) throw error;
    }
  }
  expect(visited.has(`sub_${healthyId}`)).toBe(true);
  expect(
    await db
      .select()
      .from(subscriptionPaymentPeriods)
      .where(eq(subscriptionPaymentPeriods.subscriptionId, healthyId)),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(subscriptionPaymentPeriods)
      .where(eq(subscriptionPaymentPeriods.subscriptionId, failedIds[0] ?? "")),
  ).toEqual([]);
  expect(
    (await db.select().from(creditLedger).where(eq(creditLedger.ownerId, userId)))[0]
      ?.fundingPeriodId,
  ).not.toBeNull();
});
