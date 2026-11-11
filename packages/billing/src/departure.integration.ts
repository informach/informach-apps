import { randomUUID } from "node:crypto";
import { type Database, eq } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, expect, it } from "vitest";
import { openCompassoAccount } from "./collection-accounts";
import { inspectBillingDeparture } from "./departure";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Disposable database required");
const connection = postgres(url, { max: 4, prepare: false });
const db: Database = drizzle(connection, { schema });
afterAll(() => connection.end());
async function inspect(actorId: string) {
  const pages = [];
  for await (const page of inspectBillingDeparture(db, actorId, async () => {})) pages.push(page);
  return pages;
}

it("finds all own unsettled operations after leaving a family, preserving independent products", async () => {
  const payer = randomUUID();
  const member = randomUUID();
  await db.insert(schema.users).values(
    [payer, member].map((id) => ({
      id,
      name: "Avaliação sintética",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const family = createFamilyService({ db });
  const group = await family.createGroup(payer, "Família sintética");
  const account = await openCompassoAccount(db, payer, group.id);
  const invitation = await family.createInvitation(payer, group.id, `${member}@example.test`);
  await family.acceptInvitation(member, invitation.token);
  const [personal, shared, independent, foreign] = await db
    .insert(schema.customers)
    .values(
      [
        { app: "cozya", subjectType: "user" as const, subjectId: payer },
        { app: "compasso", subjectType: "billing_account" as const, subjectId: account.id },
        { app: "edi", subjectType: "user" as const, subjectId: payer },
        { app: "cozya", subjectType: "user" as const, subjectId: member },
      ].map((row) => ({
        ...row,
        provider: "stripe" as const,
        providerCustomerId: `cus_${randomUUID()}`,
        email: "private@example.test",
        metadata: { private: "PRIVATE_PROVIDER_PAYLOAD" },
      })),
    )
    .returning();
  if (!personal || !shared || !independent || !foreign) throw new Error("Missing customers");
  const now = new Date();
  const contracts = await db
    .insert(schema.subscriptions)
    .values(
      [
        ...Array.from({ length: 101 }, () => ({
          customerId: personal.id,
          productId: "legacy_active",
          status: "active" as const,
        })),
        { customerId: personal.id, productId: "legacy_closed", status: "canceled" as const },
        {
          customerId: personal.id,
          productId: "legacy_scheduled",
          status: "canceled" as const,
          pendingProductId: "legacy_replacement",
          pendingPriceId: "price_replacement",
        },
        { customerId: shared.id, productId: "compasso_monthly", status: "active" as const },
        {
          customerId: independent.id,
          productId: "INDEPENDENT_PRIVATE_CONTRACT",
          status: "active" as const,
        },
        {
          customerId: foreign.id,
          productId: "OTHER_PAYER_PRIVATE_CONTRACT",
          status: "active" as const,
        },
      ].map((row) => ({
        ...row,
        provider: "stripe" as const,
        providerSubscriptionId: `sub_${randomUUID()}`,
        providerPriceId: "price_fixture",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
        metadata: { private: "PRIVATE_PROVIDER_PAYLOAD" },
      })),
    )
    .returning();
  const sharedContract = contracts.find((row) => row.customerId === shared.id);
  if (!sharedContract) throw new Error("Missing contract");
  await db.insert(schema.checkoutIntents).values({
    customerId: personal.id,
    userId: payer,
    productId: "legacy_checkout",
    requestStarted: true,
    request: {
      priceId: "price_fixture",
      successUrl: "https://private.example/success",
      cancelUrl: "https://private.example/cancel",
      expiresAt: Math.floor(now.getTime() / 1000) - 1,
    },
  });
  await db.insert(schema.creditPurchaseIntents).values({
    customerId: shared.id,
    userId: payer,
    requestKey: randomUUID(),
    productId: "compasso_credits",
    priceId: "price_fixture",
    amountCents: 1490,
    credits: 100,
    currency: "BRL",
    requestStarted: true,
    request: {
      successUrl: "https://private.example/success",
      cancelUrl: "https://private.example/cancel",
      expiresAt: Math.floor(now.getTime() / 1000) - 1,
    },
  });
  await db.insert(schema.collectionPlanChanges).values({
    subscriptionId: sharedContract.id,
    actorId: payer,
    requestKey: randomUUID(),
    fromPriceId: "price_month",
    toPriceId: "price_year",
    toProductId: "compasso_annual",
    effectiveAt: sharedContract.currentPeriodEnd,
    status: "scheduled",
  });
  await db.insert(schema.creditReservations).values(
    [
      {
        app: "compasso",
        consumerApp: "cozya",
        ownerType: "family" as const,
        ownerId: group.id,
        actorUserId: payer,
      },
      { app: "cozya", ownerType: "user" as const, ownerId: payer },
      {
        app: "compasso",
        consumerApp: "cozya",
        ownerType: "family" as const,
        ownerId: group.id,
        actorUserId: member,
      },
      { app: "edi", ownerType: "user" as const, ownerId: payer },
    ].map((row) => ({
      ...row,
      estimatedAmount: 1,
      feature: "fixture",
      expiresAt: new Date(now.getTime() - 1000),
      metadata: { prompt: "PRIVATE_PROMPT" },
    })),
  );
  await family.transferAdministration(payer, group.id, member);
  await family.revokeMember(member, group.id, payer);
  const pages = await inspect(payer);
  const open = pages.flatMap((page) =>
    page.kind === "billing.open_contracts" ? page.records : [],
  );
  expect(open).toHaveLength(103);
  expect(open.some((row) => row.pendingProductId === "legacy_replacement")).toBe(true);
  expect(
    pages.find((page) => page.kind === "billing.subscription_checkouts")?.records,
  ).toHaveLength(1);
  expect(
    pages.find((page) => page.kind === "billing.pending_credit_purchases")?.records,
  ).toHaveLength(1);
  expect(pages.find((page) => page.kind === "billing.scheduled_changes")?.records).toHaveLength(1);
  expect(
    pages.find((page) => page.kind === "billing.active_ai_reservations")?.records,
  ).toHaveLength(2);
  expect(pages.find((page) => page.kind === "billing.independent_products")?.records).toEqual([
    { id: independent.id, app: "edi" },
  ]);
  const text = JSON.stringify(pages);
  for (const privateValue of [
    "PRIVATE_PROVIDER_PAYLOAD",
    "PRIVATE_PROMPT",
    "INDEPENDENT_PRIVATE_CONTRACT",
    "OTHER_PAYER_PRIVATE_CONTRACT",
    "private@example.test",
    "private.example",
  ])
    expect(text).not.toContain(privateValue);
  expect(
    (
      await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, sharedContract.id))
    )[0]?.status,
  ).toBe("active");
  await db.update(schema.users).set({ banned: true }).where(eq(schema.users.id, payer));
  await expect(inspect(payer)).rejects.toThrow("Billing account is unavailable");
});
