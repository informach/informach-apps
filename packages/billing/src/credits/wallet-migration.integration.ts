import { randomUUID } from "node:crypto";
import { PRODUCTS } from "@informach/config";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createFakeProvider } from "../__tests__/_fake-provider";
import type { BillingEmailDeps } from "../billing-emails";
import { hasPendingCompassoReview } from "../collection-jobs";
import { handleStripeEvent, retryLegacyFinancialEvents } from "../webhooks";
import { handlePaymentIntentSucceeded } from "../webhooks/payment";
import { getBalance } from "./balance";
import { setGrantFundingState } from "./funding";
import { grantBonusCredits, refundCredits } from "./grant";
import { refreshLegacyCreditPayment, settleLegacyCreditPayment } from "./legacy-payments";
import { lockCreditOwner } from "./locks";
import { forwardPendingLegacyCreditEntries } from "./migration-forwarding";
import { consumeCredits, releaseReservation, reserveCredits } from "./reservations";
import { authorizeCompassoSpend } from "./shared";
import {
  listLegacyCreditWallets,
  migrateLegacyWallet,
  prepareLegacyWalletMigration,
  previewLegacyWalletMigration,
} from "./wallet-migration";

const url = process.env.DATABASE_URL;
if (
  !url ||
  (process.env.COMPASSO_ISOLATED_DATABASE !== "1" && process.env.CI !== "true") ||
  !["127.0.0.1", "localhost", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Credit migration integration requires an isolated local database");
const connection = postgres(url, { max: 8, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
afterAll(async () => {
  await connection.end();
});

async function fixture() {
  const actorId = `credit-migration-${randomUUID()}`;
  await db
    .insert(schema.users)
    .values({ id: actorId, name: "Adult", email: `${actorId}@example.test`, emailVerified: true });
  const group = await family.createGroup(actorId, "Credit migration");
  const input = { sourceApp: "cozya" as const, groupId: group.id };
  const owner = { type: "user" as const, id: actorId };
  const destination = { type: "family" as const, id: group.id };
  const sourceDeps = { db, app: "cozya" };
  const familyDeps = { db, walletScope: "compasso", authorizeSpend: authorizeCompassoSpend };
  async function preview() {
    const value = await previewLegacyWalletMigration(db, actorId, input);
    if (value.status !== "ready") throw new Error("Expected an unmigrated fixture");
    return value;
  }
  async function migrate() {
    return migrateLegacyWallet(db, actorId, { ...input, revision: (await preview()).revision });
  }
  async function balance() {
    return (await getBalance({ db, app: "compasso" }, destination)).available;
  }
  return { actorId, input, owner, destination, sourceDeps, familyDeps, preview, migrate, balance };
}

describe("Legacy wallet migration and delayed financial events", () => {
  it("preflights only the actor's funding, validates destination before provider access and hides other wallets", async () => {
    const f = await fixture();
    const other = await fixture();
    await grantBonusCredits(other.sourceDeps, { owner: other.owner, amount: 99, reason: "promo" });
    const providerCustomerId = `cus_${randomUUID()}`;
    const providerPaymentId = `pi_${randomUUID()}`;
    const [customer] = await db
      .insert(schema.customers)
      .values({
        provider: "stripe",
        providerCustomerId,
        subjectType: "user",
        subjectId: f.actorId,
        app: "cozya",
        email: `${f.actorId}@example.test`,
      })
      .returning();
    if (!customer) throw new Error("Missing fixture customer");
    const [payment] = await db
      .insert(schema.oneTimePayments)
      .values({
        provider: "stripe",
        providerPaymentId,
        customerId: customer.id,
        productId: "legacy_pack",
        amountCents: 1000,
        currency: "BRL",
        status: "paid",
        creditAmount: 10,
      })
      .returning();
    if (!payment) throw new Error("Missing fixture payment");
    await db.insert(schema.creditLedger).values({
      ownerType: "user",
      ownerId: f.actorId,
      app: "cozya",
      entryType: "purchase",
      amount: 10,
      paymentId: payment.id,
    });
    const readCreditPayment = vi.fn(async () => ({
      paymentId: providerPaymentId,
      customerId: providerCustomerId,
      amountCents: 1000,
      currency: "BRL",
      paidAt: new Date(),
      amountRefundedCents: 500,
      disputed: false,
      observedAt: new Date(),
    }));
    const deps = {
      db,
      products: PRODUCTS,
      providerClient: { ...createFakeProvider().provider, readCreditPayment },
    };
    await expect(
      prepareLegacyWalletMigration(deps, f.actorId, { ...f.input, groupId: other.input.groupId }),
    ).rejects.toThrow();
    expect(readCreditPayment).not.toHaveBeenCalled();
    await expect(f.preview()).rejects.toThrow("pending financial events");
    const preview = await prepareLegacyWalletMigration(deps, f.actorId, f.input);
    expect(preview).toMatchObject({ status: "ready", sourceAmount: 5, amount: 75 });
    expect(readCreditPayment).toHaveBeenCalledExactlyOnceWith(
      providerCustomerId,
      providerPaymentId,
    );
    expect(await listLegacyCreditWallets(db, f.actorId)).toEqual([
      { sourceApp: "cozya", receipt: null },
    ]);
    await f.migrate();
    expect(await f.balance()).toBe(75);
    expect((await listLegacyCreditWallets(db, f.actorId))[0]?.receipt?.groupId).toBe(
      f.input.groupId,
    );
  });

  it("refuses purchase records without an identifiable payment even if expired", async () => {
    const f = await fixture();
    await db.insert(schema.creditLedger).values({
      ownerType: "user",
      ownerId: f.actorId,
      app: "cozya",
      entryType: "purchase",
      amount: 1,
      createdAt: new Date("2020-01-01Z"),
      expiresAt: new Date("2021-01-01Z"),
    });
    await expect(f.preview()).rejects.toThrow("pending financial events");
  });
  it("holds both migration and new family spending while a signed adverse event awaits provider confirmation", async () => {
    const f = await fixture();
    const customerId = `cus_${randomUUID()}`;
    const paymentId = `pi_${randomUUID()}`;
    const [customer] = await db
      .insert(schema.customers)
      .values({
        provider: "stripe",
        providerCustomerId: customerId,
        subjectType: "user",
        subjectId: f.actorId,
        app: "cozya",
        email: `${f.actorId}@example.test`,
      })
      .returning();
    if (!customer) throw new Error("Missing customer fixture");
    const [payment] = await db
      .insert(schema.oneTimePayments)
      .values({
        provider: "stripe",
        providerPaymentId: paymentId,
        customerId: customer.id,
        productId: "old_pack",
        amountCents: 1000,
        currency: "BRL",
        creditAmount: 10,
        status: "paid",
        paidAt: new Date(),
      })
      .returning();
    if (!payment) throw new Error("Missing payment fixture");
    await db.insert(schema.creditLedger).values({
      ownerType: "user",
      ownerId: f.actorId,
      app: "cozya",
      entryType: "purchase",
      amount: 10,
      paymentId: payment.id,
    });
    const [prior] = await db
      .insert(schema.webhookEvents)
      .values({
        provider: "stripe",
        providerEventId: `prior-${randomUUID()}`,
        app: "cozya",
        eventType: "charge.refunded",
        payload: { data: { object: { payment_intent: paymentId } } },
      })
      .returning();
    if (!prior) throw new Error("Missing event fixture");
    await expect(f.preview()).rejects.toThrow("pending financial events");
    await db
      .update(schema.webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(schema.webhookEvents.id, prior.id));
    await db.transaction(async (tx) => {
      await lockCreditOwner(tx, f.owner);
      await settleLegacyCreditPayment(tx, "cozya", payment.id, {
        paymentId,
        customerId,
        amountCents: 1000,
        currency: "BRL",
        paidAt: new Date(),
        amountRefundedCents: 0,
        disputed: false,
        observedAt: new Date(),
      });
    });
    await f.migrate();

    let confirmProvider = () => {};
    const providerWaiting = new Promise<void>((resolve) => {
      confirmProvider = resolve;
    });
    let reading = false;
    let providerFails = true;
    const providerClient = {
      ...createFakeProvider().provider,
      readCreditPayment: async () => {
        reading = true;
        await providerWaiting;
        if (providerFails) {
          providerFails = false;
          throw new Error("Provider temporarily unavailable");
        }
        return {
          paymentId,
          customerId,
          amountCents: 1000,
          currency: "BRL",
          paidAt: new Date(),
          amountRefundedCents: 0,
          disputed: true,
          observedAt: new Date(),
        };
      },
    };
    const webhookDeps = {
      db,
      provider: "stripe" as const,
      providerClient,
      app: "cozya",
      webhookScope: "cozya",
      products: PRODUCTS.filter((product) => product.app === "cozya"),
    };
    const eventId = `evt_${randomUUID()}`;
    const processing = handleStripeEvent(webhookDeps, {
      id: eventId,
      type: "charge.dispute.created",
      payload: { id: eventId, data: { object: { payment_intent: paymentId } } },
    });
    try {
      await vi.waitFor(() => expect(reading).toBe(true));
      expect(await hasPendingCompassoReview(db, f.input.groupId)).toBe(true);
      await expect(
        reserveCredits(f.familyDeps, {
          owner: f.destination,
          actorUserId: f.actorId,
          app: "cozya",
          feature: "text",
          estimatedAmount: 1,
        }),
      ).rejects.toThrow("conferência");
    } finally {
      confirmProvider();
      await expect(processing).rejects.toThrow("Provider temporarily unavailable");
    }
    expect(await hasPendingCompassoReview(db, f.input.groupId)).toBe(true);
    await retryLegacyFinancialEvents(webhookDeps);
    expect(await hasPendingCompassoReview(db, f.input.groupId)).toBe(false);
    expect(await f.balance()).toBe(0);
  });
  it("blocks older spending writers in PostgreSQL and recovers their late funding without reapplying old refunds", async () => {
    const f = await fixture();
    const grant = await grantBonusCredits(f.sourceDeps, {
      owner: f.owner,
      amount: 10,
      reason: "promo",
    });
    await refundCredits(f.sourceDeps, {
      owner: f.owner,
      originalLedgerEntryId: grant.ledgerEntryId,
      amount: 3,
      stripeEventId: `old-refund-${randomUUID()}`,
      reason: "before cut",
    });
    await f.migrate();
    await expect(
      db.insert(schema.creditReservations).values({
        ownerType: "user",
        ownerId: f.actorId,
        app: "cozya",
        feature: "old writer",
        estimatedAmount: 1,
        expiresAt: new Date(Date.now() + 60000),
      }),
    ).rejects.toMatchObject({ cause: { code: "23514", constraint_name: "credit_wallet_closed" } });
    await expect(
      db.insert(schema.creditLedger).values({
        ownerType: "user",
        ownerId: f.actorId,
        app: "cozya",
        entryType: "consumption",
        amount: -1,
      }),
    ).rejects.toMatchObject({ cause: { code: "23514", constraint_name: "credit_wallet_closed" } });
    await db.insert(schema.creditLedger).values({
      ownerType: "user",
      ownerId: f.actorId,
      app: "cozya",
      entryType: "promo_grant",
      amount: 2,
    });
    expect(await hasPendingCompassoReview(db, f.input.groupId)).toBe(true);
    await forwardPendingLegacyCreditEntries(db, "cozya");
    await forwardPendingLegacyCreditEntries(db, "cozya");
    expect(await f.balance()).toBe(135);
    expect(await hasPendingCompassoReview(db, f.input.groupId)).toBe(false);
  });
  it("does not lose a scheduled grant which is not spendable yet", async () => {
    const f = await fixture();
    await grantBonusCredits(f.sourceDeps, {
      owner: f.owner,
      amount: 10,
      reason: "promo",
      effectiveAt: new Date("2099-01-01Z"),
    });
    await expect(f.preview()).rejects.toThrow("future-effective financial entries");
    expect(await f.balance()).toBe(0);
  });
  it("atomically preserves usable lots, exact expiry and expired refund provenance, closing the original wallet", async () => {
    const f = await fixture();
    const [expired] = await db
      .insert(schema.creditLedger)
      .values({
        ownerType: "user",
        ownerId: f.actorId,
        app: "cozya",
        entryType: "promo_grant",
        amount: 10,
        createdAt: new Date("2020-01-01Z"),
        expiresAt: new Date("2021-01-01Z"),
      })
      .returning();
    const [current] = await db
      .insert(schema.creditLedger)
      .values({
        ownerType: "user",
        ownerId: f.actorId,
        app: "cozya",
        entryType: "promo_grant",
        amount: 10,
        expiresAt: sql`'2099-01-01 00:00:00.123456+00'::timestamptz`,
      })
      .returning();
    if (!expired || !current) throw new Error("Fixture failed");
    await consumeCredits({ db }, { owner: f.owner, app: "cozya", amount: 3, feature: "legacy" });
    const before = await f.preview();
    expect(before.sourceAmount).toBe(7);
    expect(before.amount).toBe(105);
    await f.migrate();
    expect(await f.balance()).toBe(105);
    expect((await getBalance(f.sourceDeps, f.owner)).available).toBe(0);
    expect(
      await consumeCredits({ db }, { owner: f.owner, app: "cozya", amount: 1, feature: "legacy" }),
    ).toMatchObject({ ok: false });
    const [expiry] = await db.execute<{ same: boolean }>(sql`
      select src.expires_at = dst.expires_at as same from billing.credit_wallet_migration_entries m
      join billing.credit_ledger src on src.id = m.source_entry_id
      join billing.credit_ledger dst on dst.id = m.destination_entry_id
      where src.id = ${current.id}::uuid
    `);
    expect(expiry?.same).toBe(true);
    await refundCredits(f.sourceDeps, {
      owner: f.owner,
      originalLedgerEntryId: expired.id,
      amount: 10,
      stripeEventId: `refund-${randomUUID()}`,
      reason: "reversal of expired unused grant",
    });
    expect(await f.balance()).toBe(105);
    await refundCredits(f.sourceDeps, {
      owner: f.owner,
      originalLedgerEntryId: current.id,
      amount: 10,
      stripeEventId: `refund-${randomUUID()}`,
      reason: "refund includes historical usage",
    });
    expect(await f.balance()).toBe(-45);
  });

  it("deduplicates concurrent cutovers and refuses another destination or an obsolete preview", async () => {
    const f = await fixture();
    await grantBonusCredits(f.sourceDeps, { owner: f.owner, amount: 2, reason: "promo" });
    const stale = await f.preview();
    await grantBonusCredits(f.sourceDeps, { owner: f.owner, amount: 1, reason: "promo" });
    await expect(
      migrateLegacyWallet(db, f.actorId, { ...f.input, revision: stale.revision }),
    ).rejects.toThrow("updated credit migration preview");
    const accepted = { ...f.input, revision: (await f.preview()).revision };
    const receipts = await Promise.all([
      migrateLegacyWallet(db, f.actorId, accepted),
      migrateLegacyWallet(db, f.actorId, accepted),
    ]);
    expect(receipts[0]?.id).toBe(receipts[1]?.id);
    expect(await f.balance()).toBe(45);
    const other = await family.createGroup(f.actorId, "Another family");
    await expect(
      migrateLegacyWallet(db, f.actorId, { ...accepted, groupId: other.id }),
    ).rejects.toThrow("another destination");
  });

  it("keeps unresolved reservations blocking even after their timeout, then serializes spending against cutover", async () => {
    const f = await fixture();
    await grantBonusCredits(f.sourceDeps, { owner: f.owner, amount: 10, reason: "promo" });
    const reservation = await reserveCredits(
      { db },
      { owner: f.owner, app: "cozya", estimatedAmount: 2, feature: "legacy" },
    );
    await db
      .update(schema.creditReservations)
      .set({ expiresAt: new Date("2020-01-01Z") })
      .where(eq(schema.creditReservations.id, reservation.id));
    await expect(f.preview()).rejects.toThrow("Resolve all legacy reservations");
    await releaseReservation({ db }, { reservationId: reservation.id, reason: "timeout" });
    const accepted = { ...f.input, revision: (await f.preview()).revision };
    const outcomes = await Promise.allSettled([
      migrateLegacyWallet(db, f.actorId, accepted),
      reserveCredits(
        { db },
        { owner: f.owner, app: "cozya", estimatedAmount: 2, feature: "legacy" },
      ),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  });

  it("forwards late grants, refunds and funding suspension without reviving or duplicating credits", async () => {
    const f = await fixture();
    await f.migrate();
    const input = {
      owner: f.owner,
      amount: 10,
      reason: "promo" as const,
      stripeEventId: `invoice-${randomUUID()}`,
    };
    const grant = await grantBonusCredits(f.sourceDeps, input);
    await grantBonusCredits(f.sourceDeps, input);
    expect(await f.balance()).toBe(150);
    const spend = await consumeCredits(f.familyDeps, {
      owner: f.destination,
      actorUserId: f.actorId,
      app: "cozya",
      amount: 30,
      feature: "text",
    });
    expect(spend.ok).toBe(true);
    const observed = new Date();
    async function funding(blocked: boolean, time: Date) {
      await db.transaction(async (tx) => {
        await lockCreditOwner(tx, f.owner);
        const [source] = await tx
          .select()
          .from(schema.creditLedger)
          .where(eq(schema.creditLedger.id, grant.ledgerEntryId));
        if (!source) throw new Error("Missing fixture grant");
        await setGrantFundingState(tx, source, blocked, time, { reason: "test" });
      });
    }
    await funding(true, observed);
    await funding(true, observed);
    expect(await f.balance()).toBe(0);
    await funding(false, new Date(observed.getTime() + 1));
    expect(await f.balance()).toBe(120);
    const refund = {
      owner: f.owner,
      originalLedgerEntryId: grant.ledgerEntryId,
      amount: 10,
      stripeEventId: `refund-${randomUUID()}`,
      reason: "test",
    };
    await refundCredits(f.sourceDeps, refund);
    await refundCredits(f.sourceDeps, refund);
    expect(await f.balance()).toBe(-30);
    await expect(
      refundCredits(f.sourceDeps, {
        ...refund,
        stripeEventId: `refund-${randomUUID()}`,
        amount: 1,
      }),
    ).rejects.toThrow("exceeds the original");
  });

  it("routes an already-started legacy purchase through the existing payment webhook", async () => {
    const f = await fixture();
    const customerId = `cus_${randomUUID()}`;
    await db.insert(schema.customers).values({
      provider: "stripe",
      providerCustomerId: customerId,
      subjectType: "user",
      subjectId: f.actorId,
      app: "cozya",
      email: `${f.actorId}@example.test`,
    });
    const product = PRODUCTS.find((item) => item.app === "cozya" && item.kind === "credit_pack");
    if (!product?.creditAmount) throw new Error("Historical catalog is required during migration");
    const intent = {
      id: `pi_${randomUUID()}`,
      customer: customerId,
      amount: 4990,
      currency: "brl",
      metadata: {
        subject_type: "user",
        subject_id: f.actorId,
        product_id: product.id,
        credit_amount: String(product.creditAmount),
      },
    };
    await f.migrate();
    const paymentFacts = {
      paymentId: intent.id,
      customerId,
      amountCents: intent.amount,
      currency: "BRL",
      paidAt: new Date(),
      amountRefundedCents: 0,
      disputed: false,
      observedAt: new Date(),
    };
    const receiptEmail = {
      appName: "Cozya",
      manageBillingUrl: "https://example.test/account",
      buildUnsubscribeUrl: () => "https://example.test/unsubscribe",
      sendEmail: vi.fn<NonNullable<BillingEmailDeps["sendEmail"]>>(async () => ({
        ok: true,
        status: "sent",
        deliveryId: randomUUID(),
      })),
      renderTemplate: vi.fn<NonNullable<BillingEmailDeps["renderTemplate"]>>(async () => ({
        html: "<p>Receipt</p>",
        text: "Receipt",
        subject: "Receipt",
      })),
    } satisfies BillingEmailDeps;
    const deps = {
      db,
      app: "cozya",
      provider: "stripe" as const,
      products: PRODUCTS,
      providerClient: { readCreditPayment: async () => ({ ...paymentFacts }) },
      emails: receiptEmail,
    };
    const eventId = `evt_${randomUUID()}`;
    await handlePaymentIntentSucceeded(deps, intent, eventId);
    await handlePaymentIntentSucceeded(deps, intent, eventId);
    await handlePaymentIntentSucceeded(deps, intent, `evt_${randomUUID()}`);
    expect(await f.balance()).toBe(product.creditAmount * 15);
    expect(receiptEmail.renderTemplate).toHaveBeenCalledExactlyOnceWith(
      "billing.credits-purchased",
      expect.objectContaining({
        appName: "Compasso",
        creditAmount: product.creditAmount * 15,
        balanceAfter: undefined,
        conversion: { sourceName: "Cozya", sourceCredits: product.creditAmount },
      }),
    );
    expect(receiptEmail.sendEmail).toHaveBeenCalledTimes(1);
    const rows = await db
      .select()
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.ownerId, f.input.groupId),
          eq(schema.creditLedger.app, "compasso"),
        ),
      );
    expect(rows).toHaveLength(1);
    paymentFacts.disputed = true;
    paymentFacts.observedAt = new Date(paymentFacts.observedAt.getTime() + 1);
    await refreshLegacyCreditPayment(deps, intent.id);
    expect(await f.balance()).toBe(0);
    paymentFacts.disputed = false;
    paymentFacts.amountRefundedCents = intent.amount / 2;
    paymentFacts.observedAt = new Date(paymentFacts.observedAt.getTime() + 1);
    await refreshLegacyCreditPayment(deps, intent.id);
    expect(await f.balance()).toBe(
      (product.creditAmount - Math.ceil(product.creditAmount / 2)) * 15,
    );
    paymentFacts.amountRefundedCents = intent.amount;
    paymentFacts.observedAt = new Date(paymentFacts.observedAt.getTime() + 1);
    await refreshLegacyCreditPayment(deps, intent.id);
    await refreshLegacyCreditPayment(deps, intent.id);
    expect(await f.balance()).toBe(0);
  });

  it("requires current membership, rejects suspended funds and keeps Edi outside the migration", async () => {
    const f = await fixture();
    const other = await fixture();
    await expect(
      previewLegacyWalletMigration(db, f.actorId, { ...f.input, groupId: other.input.groupId }),
    ).rejects.toThrow();
    await expect(
      previewLegacyWalletMigration(db, f.actorId, { ...f.input, sourceApp: "edi" as "cozya" }),
    ).rejects.toThrow("not part of");
    const grant = await grantBonusCredits(f.sourceDeps, {
      owner: f.owner,
      amount: 2,
      reason: "promo",
    });
    await db.transaction(async (tx) => {
      await lockCreditOwner(tx, f.owner);
      const [source] = await tx
        .select()
        .from(schema.creditLedger)
        .where(eq(schema.creditLedger.id, grant.ledgerEntryId));
      if (!source) throw new Error("Fixture failed");
      await setGrantFundingState(tx, source, true, new Date(), {});
    });
    await expect(f.preview()).rejects.toThrow("suspended funding");
    expect(await f.balance()).toBe(0);
  });
});
