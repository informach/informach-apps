import { randomUUID } from "node:crypto";
import { PRODUCTS } from "@informach/config";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { assertAccountPayer, openCompassoAccount, resolveCreditOwner } from "./collection-accounts";
import { getCompassoAccess, startCompassoTrial } from "./compasso";
import {
  getCompassoPayerAccount,
  getCompassoWalletHistory,
  listCompassoPayerAccounts,
} from "./compasso-account";
import { getBalance } from "./credits/balance";
import { grantCalendarSubscriptionCredits } from "./credits/subscription-grants";

const url = process.env.DATABASE_URL;
if (!url || (process.env.COMPASSO_ISOLATED_DATABASE !== "1" && process.env.CI !== "true"))
  throw new Error("Compasso integration requires an isolated database");
if (!["127.0.0.1", "localhost", "postgres"].includes(new URL(url).hostname))
  throw new Error("Compasso integration cannot use a remote database");
const connection = postgres(url, { max: 6, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
afterAll(async () => {
  await connection.end();
});
async function actor() {
  const id = `commercial-${randomUUID()}`;
  await db
    .insert(schema.users)
    .values({ id, name: "Test adult", email: `${id}@example.test`, emailVerified: true });
  return id;
}

describe("Compasso commercial boundary", () => {
  it("keeps payer contract access after departure but closes family history, and paginates without exposing private ledger metadata", async () => {
    const payer = await actor();
    const other = await actor();
    const group = await family.createGroup(payer, "Private ledger");
    const account = await openCompassoAccount(db, payer, group.id);
    await db.insert(schema.creditLedger).values(
      Array.from({ length: 23 }, (_, index) => ({
        ownerType: "family" as const,
        ownerId: group.id,
        app: "compasso",
        entryType: "adjustment" as const,
        amount: 1,
        actorUserId: payer,
        metadata: { privateDetail: `secret-${index}`, feature: "sensitive-personal-context" },
        createdAt: new Date("2026-11-01T12:00:00.000Z"),
      })),
    );
    const first = await getCompassoWalletHistory(db, payer, group.id);
    expect(first.entries).toHaveLength(20);
    expect(first.nextCursor).toBeTypeOf("number");
    const second = await getCompassoWalletHistory(
      db,
      payer,
      group.id,
      first.nextCursor ?? undefined,
    );
    expect(second.entries).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.entries, ...second.entries].map((e) => e.id)).size).toBe(23);
    expect(JSON.stringify(first)).not.toMatch(
      /secret-|privateDetail|actorUserId|sensitive-personal-context/,
    );
    await expect(getCompassoPayerAccount(db, other, account.id)).rejects.toThrow();
    await expect(getCompassoWalletHistory(db, other, group.id)).rejects.toThrow();
    const invite = await family.createInvitation(payer, group.id, `${other}@example.test`);
    await family.acceptInvitation(other, invite.token);
    await family.transferAdministration(payer, group.id, other);
    expect((await openCompassoAccount(db, payer, group.id)).id).toBe(account.id);
    await family.revokeMember(other, group.id, payer);
    expect(await listCompassoPayerAccounts(db, payer)).toMatchObject({
      accounts: [{ id: account.id }],
    });
    expect(await getCompassoPayerAccount(db, payer, account.id)).toMatchObject({
      account: { id: account.id },
      customerReady: false,
    });
    await expect(getCompassoWalletHistory(db, payer, group.id)).rejects.toThrow();
    await db
      .update(schema.users)
      .set({ banned: true, banExpiresAt: null })
      .where(eq(schema.users.id, payer));
    expect((await listCompassoPayerAccounts(db, payer)).accounts).toHaveLength(0);
    await expect(getCompassoPayerAccount(db, payer, account.id)).rejects.toThrow();
  });
  it("keeps payer authority and wallet identity separate from family administration", async () => {
    const payer = await actor();
    const other = await actor();
    const group = await family.createGroup(payer, "Commercial test");
    const [a, b] = await Promise.all([
      openCompassoAccount(db, payer, group.id),
      openCompassoAccount(db, payer, group.id),
    ]);
    expect(a?.id).toBe(b?.id);
    if (!a) throw new Error("Missing account fixture");
    const invite = await family.createInvitation(payer, group.id, `${other}@example.test`);
    await family.acceptInvitation(other, invite.token);
    await family.transferAdministration(payer, group.id, other);
    await expect(assertAccountPayer(db, other, a.id)).rejects.toThrow();
    await expect(openCompassoAccount(db, other, group.id)).rejects.toThrow("already has a payer");
    await family.revokeMember(other, group.id, payer);
    await expect(assertAccountPayer(db, payer, a.id)).resolves.toMatchObject({
      account: { payerUserId: payer },
    });
    expect(await resolveCreditOwner(db, "compasso", { type: "billing_account", id: a.id })).toEqual(
      { type: "family", id: group.id },
    );
    await expect(
      resolveCreditOwner(db, "edi", { type: "billing_account", id: a.id }),
    ).rejects.toThrow();
  });

  it("starts one cardless trial per email and group under concurrent requests", async () => {
    const owner = await actor();
    const first = await family.createGroup(owner, "First");
    const second = await family.createGroup(owner, "Second");
    const config = { db, trialHashSecret: "isolated-test-secret-not-used-in-production-2026" };
    const results = await Promise.allSettled([
      startCompassoTrial(config, owner, first.id),
      startCompassoTrial(config, owner, second.id),
    ]);
    const winners = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    expect(winners).toHaveLength(1);
    const trial = winners[0];
    if (!trial) throw new Error("Missing trial fixture");
    expect(trial.endsAt.getTime() - trial.startsAt.getTime()).toBe(14 * 86_400_000);
    await startCompassoTrial(config, owner, trial.groupId);
    expect(
      await getBalance({ db, app: "compasso" }, { type: "family", id: trial.groupId }),
    ).toMatchObject({ total: 20, reserved: 0, available: 20 });
    expect(await getCompassoAccess(db, owner, trial.groupId)).toMatchObject({
      active: true,
      source: "trial",
    });
    const grants = await db
      .select()
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.ownerId, trial.groupId),
          eq(schema.creditLedger.app, "compasso"),
        ),
      );
    expect(grants).toHaveLength(1);
    const accounts = await db
      .select()
      .from(schema.collectionAccounts)
      .where(eq(schema.collectionAccounts.groupId, trial.groupId));
    expect(accounts).toHaveLength(0);
    await db
      .update(schema.collectionTrials)
      .set({ startsAt: new Date("2020-01-01"), endsAt: new Date("2020-01-15") })
      .where(eq(schema.collectionTrials.groupId, trial.groupId));
    expect(await getCompassoAccess(db, owner, trial.groupId)).toEqual({
      active: false,
      source: "none",
      endsAt: null,
      canStartTrial: false,
    });
  });

  it("does not restart the trial after a verified email change in a different family", async () => {
    const owner = await actor();
    const first = await family.createGroup(owner, "Original trial");
    const second = await family.createGroup(owner, "Second household");
    const config = { db, trialHashSecret: "isolated-test-secret-not-used-in-production-2026" };
    await startCompassoTrial(config, owner, first.id);
    await db
      .update(schema.users)
      .set({ email: `${randomUUID()}@example.test` })
      .where(eq(schema.users.id, owner));
    await expect(startCompassoTrial(config, owner, second.id)).rejects.toThrow();
    expect(await getCompassoAccess(db, owner, second.id)).toMatchObject({
      active: false,
      canStartTrial: false,
    });
    expect(
      await getBalance({ db, app: "compasso" }, { type: "family", id: second.id }),
    ).toMatchObject({ total: 0 });
    expect(
      await getBalance({ db, app: "compasso" }, { type: "family", id: first.id }),
    ).toMatchObject({ total: 20 });
  });

  it("requires a paid period and revokes entitlement when that period is disputed", async () => {
    const owner = await actor();
    const stranger = await actor();
    const group = await family.createGroup(owner, "Paid access");
    const account = await openCompassoAccount(db, owner, group.id);
    const [customer] = await db
      .insert(schema.customers)
      .values({
        provider: "stripe",
        providerCustomerId: `cus_test_${randomUUID()}`,
        subjectType: "billing_account",
        subjectId: account.id,
        app: "compasso",
        email: `${owner}@example.test`,
      })
      .returning();
    if (!customer) throw new Error("Missing customer fixture");
    const start = new Date(Date.now() - 60_000);
    const end = new Date(Date.now() + 30 * 86_400_000);
    const [subscription] = await db
      .insert(schema.subscriptions)
      .values({
        customerId: customer.id,
        provider: "stripe",
        providerSubscriptionId: `sub_test_${randomUUID()}`,
        productId: "compasso_monthly",
        providerPriceId: "price_compasso_test",
        status: "active",
        currentPeriodStart: start,
        currentPeriodEnd: end,
      })
      .returning();
    if (!subscription) throw new Error("Missing subscription fixture");
    expect((await getCompassoAccess(db, owner, group.id)).active).toBe(false);
    // A paid subscription can enter a provider trial while its next renewal is
    // postponed. The trial status alone must never grant access or credits.
    await db
      .update(schema.subscriptions)
      .set({ status: "trialing" })
      .where(eq(schema.subscriptions.id, subscription.id));
    expect((await getCompassoAccess(db, owner, group.id)).active).toBe(false);
    expect(
      await grantCalendarSubscriptionCredits(
        { db, app: "compasso", products: [] },
        { subscriptionId: subscription.id },
      ),
    ).toEqual({ granted: false, amount: 0 });
    const [fact] = await db
      .insert(schema.subscriptionPaymentPeriods)
      .values({
        subscriptionId: subscription.id,
        provider: "stripe",
        providerInvoiceId: `in_test_${randomUUID()}`,
        providerLineId: "line_test",
        providerPriceId: "price_compasso_test",
        periodStart: start,
        periodEnd: end,
        paidAt: start,
      })
      .returning();
    if (!fact) throw new Error("Missing payment fixture");
    expect(await getCompassoAccess(db, owner, group.id)).toMatchObject({
      active: true,
      source: "paid",
    });
    const laterEnd = new Date(end.getTime() + 86_400_000);
    const [laterFact] = await db
      .insert(schema.subscriptionPaymentPeriods)
      .values({
        subscriptionId: subscription.id,
        provider: "stripe",
        providerInvoiceId: `in_test_${randomUUID()}`,
        providerLineId: "line_test_later",
        providerPriceId: "price_compasso_test",
        periodStart: start,
        periodEnd: laterEnd,
        paidAt: start,
      })
      .returning();
    if (!laterFact) throw new Error("Missing later payment fixture");
    expect((await getCompassoAccess(db, owner, group.id)).endsAt).toEqual(laterEnd);
    await db
      .update(schema.subscriptionPaymentPeriods)
      .set({ disputed: true })
      .where(eq(schema.subscriptionPaymentPeriods.id, laterFact.id));
    expect((await getCompassoAccess(db, owner, group.id)).endsAt).toEqual(end);
    const calendarDeps = {
      db,
      app: "compasso",
      products: PRODUCTS.filter((p) => p.id === "compasso_monthly").map((p) => ({
        ...p,
        stripePriceId: { dev: "price_compasso_test", prod: "" },
      })),
    };
    const grants = await Promise.all([
      grantCalendarSubscriptionCredits(calendarDeps, {
        subscriptionId: subscription.id,
        invoiceId: fact.providerInvoiceId,
      }),
      grantCalendarSubscriptionCredits(calendarDeps, { subscriptionId: subscription.id }),
    ]);
    expect(grants.filter((g) => g.granted)).toHaveLength(1);
    expect(
      (await getBalance({ db, app: "compasso" }, { type: "family", id: group.id })).available,
    ).toBe(200);
    await expect(
      grantCalendarSubscriptionCredits(calendarDeps, {
        subscriptionId: subscription.id,
        invoiceId: "in_unreconciled",
      }),
    ).rejects.toThrow("reconciled");
    await expect(getCompassoAccess(db, stranger, group.id)).rejects.toThrow();
    await db
      .update(schema.subscriptionPaymentPeriods)
      .set({ disputed: true })
      .where(eq(schema.subscriptionPaymentPeriods.id, fact.id));
    expect((await getCompassoAccess(db, owner, group.id)).active).toBe(false);
    expect(
      await grantCalendarSubscriptionCredits(calendarDeps, { subscriptionId: subscription.id }),
    ).toEqual({ granted: false, amount: 0 });
  });
});
