import { randomUUID } from "node:crypto";
import { PRODUCTS } from "@informach/config";
import { and, type Database, eq } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { openCompassoAccount } from "../collection-accounts";
import { getBalance } from "./balance";
import { monthlyCreditWindow } from "./calendar";
import { createCompassoWallet } from "./compasso-wallet";
import { grantCalendarSubscriptionCredits } from "./subscription-grants";

const url = process.env.DATABASE_URL;
if (!url || (process.env.COMPASSO_ISOLATED_DATABASE !== "1" && process.env.CI !== "true"))
  throw new Error("Compasso wallet integration requires an isolated database");
if (!["127.0.0.1", "localhost", "postgres"].includes(new URL(url).hostname))
  throw new Error("Compasso wallet integration cannot use a remote database");
const connection = postgres(url, { max: 8, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
const products = PRODUCTS.filter((p) => p.id === "compasso_annual").map((p) => ({
  ...p,
  stripePriceId: { dev: "price_compasso_wallet_test", prod: "" },
}));
const wallet = createCompassoWallet({ db, products });
afterAll(async () => {
  await connection.end();
});

async function fixture() {
  const actorId = `first-use-${randomUUID()}`;
  await db.insert(schema.users).values({
    id: actorId,
    name: "Test adult",
    email: `${actorId}@example.test`,
    emailVerified: true,
  });
  const group = await family.createGroup(actorId, "Monthly wallet");
  const account = await openCompassoAccount(db, actorId, group.id);
  const [customer] = await db
    .insert(schema.customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_test_${randomUUID()}`,
      subjectType: "billing_account",
      subjectId: account.id,
      app: "compasso",
      email: `${actorId}@example.test`,
    })
    .returning();
  if (!customer) throw new Error("Missing customer fixture");
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - 2);
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  const [subscription] = await db
    .insert(schema.subscriptions)
    .values({
      customerId: customer.id,
      provider: "stripe",
      providerSubscriptionId: `sub_test_${randomUUID()}`,
      productId: "compasso_annual",
      providerPriceId: products[0]?.stripePriceId.dev ?? "",
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
    })
    .returning();
  if (!subscription) throw new Error("Missing subscription fixture");
  const subscriptionId = subscription.id;
  async function paid() {
    await db.insert(schema.subscriptionPaymentPeriods).values({
      subscriptionId,
      provider: "stripe",
      providerInvoiceId: `in_test_${randomUUID()}`,
      providerLineId: "line_test",
      providerPriceId: products[0]?.stripePriceId.dev ?? "",
      periodStart: start,
      periodEnd: end,
      paidAt: start,
    });
  }
  return { context: { actorId, groupId: group.id }, subscription, start, end, paid };
}

describe("first use of the monthly Compasso allowance", () => {
  it("renews only the current month and deduplicates concurrent display, spending and cron", async () => {
    const f = await fixture();
    await f.paid();
    const grantDeps = { db, app: "compasso", products };
    await grantCalendarSubscriptionCredits(grantDeps, {
      subscriptionId: f.subscription.id,
      now: f.start,
    });
    expect(
      (await getBalance({ db, app: "compasso" }, { type: "family", id: f.context.groupId }))
        .available,
    ).toBe(0);
    const results = await Promise.all([
      wallet.reserve(f.context, { app: "cozya", feature: "recipe.test", estimatedAmount: 1 }),
      wallet.reserve(f.context, { app: "cozya", feature: "recipe.test", estimatedAmount: 1 }),
      wallet.getBalance(f.context),
      grantCalendarSubscriptionCredits(grantDeps, { subscriptionId: f.subscription.id }),
    ]);
    expect(results[0].id).not.toBe(results[1].id);
    expect(await wallet.getBalance(f.context)).toMatchObject({
      total: 200,
      reserved: 2,
      available: 198,
    });
    const grants = await db
      .select()
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.ownerId, f.context.groupId),
          eq(schema.creditLedger.entryType, "bonus_grant"),
        ),
      );
    expect(grants).toHaveLength(2);
    expect(grants.map((entry) => entry.amount)).toEqual([200, 200]);
    const current = grants.find((entry) => entry.expiresAt && entry.expiresAt > new Date());
    expect(current?.expiresAt).toEqual(monthlyCreditWindow(f.start, f.end, new Date())?.endsAt);
  });

  it("does not infer a paid month from an active subscription and denies a different family's actor", async () => {
    const f = await fixture();
    const other = await fixture();
    expect((await wallet.getBalance(f.context)).available).toBe(0);
    await expect(
      wallet.reserve(f.context, { app: "cozya", feature: "recipe.test", estimatedAmount: 1 }),
    ).rejects.toThrow();
    await f.paid();
    await expect(
      wallet.getBalance({ ...f.context, actorId: other.context.actorId }),
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(schema.creditLedger)
        .where(eq(schema.creditLedger.ownerId, f.context.groupId)),
    ).toHaveLength(0);
    expect((await wallet.getBalance(f.context)).available).toBe(200);
  });
});
