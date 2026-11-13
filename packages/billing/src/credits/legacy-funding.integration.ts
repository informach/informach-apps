import { randomUUID } from "node:crypto";
import { PRODUCTS } from "@informach/config";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createFakeProvider } from "../__tests__/_fake-provider";
import { openCompassoAccount } from "../collection-accounts";
import { hasPendingCompassoReview } from "../collection-jobs";
import { getCompassoAccess } from "../compasso";
import {
  acceptLegacyContract,
  confirmLegacyContractAcceptance,
  confirmRecentLegacyContractAcceptance,
  prepareLegacyContractAcceptance,
  previewLegacyContractAcceptance,
  reconcileLegacyCancellation,
} from "../legacy-contract-acceptance";
import { runLegacyContractMaintenance } from "../legacy-contract-jobs";
import {
  activeLegacyFutureIntent,
  cancelUnsettledLegacyFutureIntent,
  cancelUnsettledLegacyFutureSetup,
  confirmLegacyFutureSetup,
  createLegacyFutureIntent,
  openLegacyFutureSetup,
  prepareLegacyFutureIntent,
  previewLegacyFutureIntent,
  requestLegacyFutureCancellation,
  scheduleLegacyFutureIntent,
} from "../legacy-future-intent";
import { runLegacyFutureRecovery } from "../legacy-future-jobs";
import { settleLegacyFutureIntent } from "../legacy-future-settlement";
import { readLegacyFutureTerms } from "../legacy-future-terms";
import { persistPaymentPeriods, type SubscriptionPaymentSnapshot } from "../payment-facts";
import { handleStripeEvent, retryLegacyFinancialEvents } from "../webhooks";
import { getBalance } from "./balance";
import { withLegacyFinancialEventLock } from "./legacy-payments";
import { hasPendingLegacyCreditReview } from "./legacy-review";
import { refreshCompassoLegacySubscriptionFunding } from "./legacy-subscriptions";
import { lockCreditOwner } from "./locks";
import { forwardPendingLegacyCreditEntries } from "./migration-forwarding";
import { consumeCredits } from "./reservations";
import { authorizeCompassoSpend } from "./shared";
import { migrateLegacyWallet, previewLegacyWalletMigration } from "./wallet-migration";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Legacy funding requires an isolated database");
const connection = postgres(url, { max: 8, prepare: false });
const db: Database = drizzle(connection, { schema });
afterAll(async () => {
  await connection.end();
});

async function fixture() {
  const userId = `legacy-funding-${randomUUID()}`;
  const email = `${userId}@example.test`;
  await db
    .insert(schema.users)
    .values({ id: userId, name: "Legacy payer", email, emailVerified: true });
  const group = await createFamilyService({ db }).createGroup(userId, "Legacy funding");
  const [customer] = await db
    .insert(schema.customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_${randomUUID()}`,
      subjectType: "user",
      subjectId: userId,
      email,
      app: "cozya",
    })
    .returning();
  if (!customer) throw new Error("Missing fixture customer");
  const start = new Date(Date.now() - 60_000);
  const end = new Date(Date.now() + 364 * 86_400_000);
  const [sub] = await db
    .insert(schema.subscriptions)
    .values({
      customerId: customer.id,
      provider: "stripe",
      providerSubscriptionId: `sub_${randomUUID()}`,
      providerPriceId: "price_legacy",
      productId: "cozya_annual",
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
    })
    .returning();
  if (!sub) throw new Error("Missing fixture subscription");
  const invoiceId = `in_${randomUUID()}`;
  const snapshot: SubscriptionPaymentSnapshot = {
    customerId: customer.providerCustomerId,
    subscriptionId: sub.providerSubscriptionId,
    priceId: sub.providerPriceId,
    status: "active",
    start,
    end,
    trialEnd: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    observedAt: new Date(),
    periods: [
      {
        invoiceId,
        lineId: `il_${randomUUID()}`,
        priceId: sub.providerPriceId,
        start,
        end,
        paidAt: start,
        fullyRefunded: false,
        disputed: false,
      },
    ],
  };
  const owner = { type: "user" as const, id: userId };
  async function grant(metadata: Record<string, unknown>, amount = 10) {
    const [entry] = await db
      .insert(schema.creditLedger)
      .values({
        ownerType: "user",
        ownerId: userId,
        app: "cozya",
        entryType: "bonus_grant",
        amount,
        metadata,
        expiresAt: end,
      })
      .returning();
    if (!entry) throw new Error("Missing fixture grant");
    return entry;
  }
  async function migrate() {
    const input = { sourceApp: "cozya" as const, groupId: group.id };
    const preview = await previewLegacyWalletMigration(db, userId, input);
    if (preview.status !== "ready") throw new Error("Already migrated fixture");
    return migrateLegacyWallet(db, userId, { ...input, revision: preview.revision });
  }
  const balance = async () =>
    (await getBalance({ db, app: "compasso" }, { type: "family", id: group.id })).available;
  const observation = (
    offset: number,
    flags: { disputed?: boolean; fullyRefunded?: boolean },
  ): SubscriptionPaymentSnapshot => ({
    ...snapshot,
    observedAt: new Date(snapshot.observedAt.getTime() + offset),
    periods: snapshot.periods.map((period) => ({ ...period, ...flags })),
  });
  return { userId, group, sub, snapshot, owner, grant, migrate, balance, observation, invoiceId };
}

describe("Historical subscription funding after wallet conversion", () => {
  it("lets the verified payer cancel an existing future schedule after leaving the family", async () => {
    const f = await fixture();
    const other = `former-family-${randomUUID()}`;
    await db.insert(schema.users).values({
      id: other,
      name: "Other adult",
      email: `${other}@example.test`,
      emailVerified: true,
    });
    const family = createFamilyService({ db });
    const account = await openCompassoAccount(db, f.userId, f.group.id);
    const invitation = await family.createInvitation(f.userId, f.group.id, `${other}@example.test`);
    await family.acceptInvitation(other, invitation.token);
    await family.transferAdministration(f.userId, f.group.id, other);
    await family.revokeMember(other, f.group.id, f.userId);
    await db.insert(schema.customers).values({
      app: "compasso",
      provider: "stripe",
      providerCustomerId: `cus_${randomUUID()}`,
      subjectType: "billing_account",
      subjectId: account.id,
      email: `${f.userId}@example.test`,
    });
    const sessionId = `session-${randomUUID()}`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: f.userId,
      token: `token-${randomUUID()}`,
      originApp: "conta",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const start = new Date(Math.floor((Date.now() + 86400_000) / 1000) * 1000);
    const [intent] = await db
      .insert(schema.legacyFutureIntents)
      .values({
        accountId: account.id,
        payerUserId: f.userId,
        requestKey: randomUUID(),
        productId: "compasso_monthly",
        providerPriceId: "price_fixture",
        amountCents: 4990,
        interval: "month",
        paidThrough: start,
        startsAt: start,
        termsRevision: "a".repeat(64),
        setupExpiresAt: new Date(Date.now() + 3600_000),
        state: "scheduled",
        setupSessionId: "cs_former",
        paymentMethodId: "pm_former",
        scheduleId: "sched_former",
      })
      .returning();
    if (!intent) throw new Error("Missing future schedule");
    expect(await activeLegacyFutureIntent(db, f.userId, account.id)).toMatchObject({
      id: intent.id,
      state: "scheduled",
    });
    await expect(activeLegacyFutureIntent(db, other, account.id)).rejects.toThrow();
    const futureProvider = {
      findSchedule: vi.fn(async () => ({ id: "sched_former", status: "not_started" as const })),
      cancelSchedule: vi.fn(async () => ({ id: "sched_former", status: "canceled" as const })),
      findSetupSession: vi.fn(async () => null),
      expireSetup: vi.fn(async () => ({ id: "cs_former", status: "expired" as const })),
    };
    await expect(
      requestLegacyFutureCancellation(
        { db, mode: "dev", publicUrl: "https://conta.example.test", futureProvider },
        f.userId,
        sessionId,
        { intentId: intent.id },
      ),
    ).resolves.toMatchObject({ state: "canceled" });
    expect(futureProvider.cancelSchedule).toHaveBeenCalledOnce();
  });
  it("blocks legacy access and spending on conflicting provider evidence until a newer valid observation", async () => {
    const f = await fixture();
    await db
      .insert(schema.familyMigrationSources)
      .values({ app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id });
    await db.insert(schema.creditWalletMigrations).values({
      sourceApp: "cozya",
      sourceUserId: f.userId,
      groupId: f.group.id,
      policyId: "fixture",
      multiplier: 1,
    });
    const product = PRODUCTS.find(
      (entry) => entry.app === "cozya" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing legacy catalog");
    let missing = false;
    let observedAt = Date.now() - 1000;
    const deps = {
      db,
      app: "cozya",
      products: [{ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } }],
      providerClient: {
        readSubscriptionPaymentFacts: async () => ({
          ...f.snapshot,
          status: missing ? ("canceled" as const) : f.snapshot.status,
          periods: missing ? [] : f.snapshot.periods,
          observedAt: new Date(++observedAt),
        }),
      },
    };
    const input = { groupId: f.group.id, subscriptionId: f.sub.id };
    const preview = await prepareLegacyContractAcceptance(deps, f.userId, input);
    await confirmLegacyContractAcceptance(deps, f.userId, { ...input, revision: preview.revision });
    expect((await getCompassoAccess(db, f.userId, f.group.id)).active).toBe(true);
    missing = true;
    await expect(
      refreshCompassoLegacySubscriptionFunding(deps, f.sub.providerSubscriptionId),
    ).rejects.toThrow("requires reconciliation");
    expect(
      await hasPendingLegacyCreditReview(db, { sourceApp: "cozya", sourceUserId: f.userId }),
    ).toBe(true);
    expect(await hasPendingLegacyCreditReview(db, { groupId: f.group.id })).toBe(true);
    await expect(
      consumeCredits(
        { db, walletScope: "compasso", authorizeSpend: authorizeCompassoSpend },
        {
          owner: { type: "family", id: f.group.id },
          actorUserId: f.userId,
          app: "cozya",
          feature: "evidence-review",
          amount: 1,
        },
      ),
    ).rejects.toThrow();
    const [detectedReview] = await db
      .select()
      .from(schema.legacyPaymentEvidenceReviews)
      .where(eq(schema.legacyPaymentEvidenceReviews.subscriptionId, f.sub.id));
    expect(detectedReview?.resolvedAt).toBeNull();
    const [unchangedObservation] = await db
      .select()
      .from(schema.legacyContractObservations)
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    expect(unchangedObservation?.status).toBe("active");
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
    });
    missing = false;
    await refreshCompassoLegacySubscriptionFunding(deps, f.sub.providerSubscriptionId);
    expect(
      await hasPendingLegacyCreditReview(db, { sourceApp: "cozya", sourceUserId: f.userId }),
    ).toBe(false);
    expect(await hasPendingLegacyCreditReview(db, { groupId: f.group.id })).toBe(false);
    const [resolvedReview] = await db
      .select()
      .from(schema.legacyPaymentEvidenceReviews)
      .where(eq(schema.legacyPaymentEvidenceReviews.subscriptionId, f.sub.id));
    expect(resolvedReview?.resolvedAt).toBeInstanceOf(Date);
    expect((await getCompassoAccess(db, f.userId, f.group.id)).active).toBe(true);
  });
  it("keeps coverage in review until a failed lifecycle event is reconciled", async () => {
    const f = await fixture();
    await db
      .insert(schema.familyMigrationSources)
      .values({ app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id });
    const product = PRODUCTS.find(
      (entry) => entry.app === "cozya" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing Cozya catalog");
    let canceled = true;
    let offline = false;
    let observedAt = Date.now() - 1000;
    const provider = {
      ...createFakeProvider().provider,
      readSubscriptionPaymentFacts: async () => {
        if (offline) throw new Error("Provider unavailable");
        return { ...f.snapshot, cancelAtPeriodEnd: canceled, observedAt: new Date(++observedAt) };
      },
    };
    const products = [{ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } }];
    const deps = { db, products, providerClient: provider };
    const input = { groupId: f.group.id, subscriptionId: f.sub.id };
    const preview = await prepareLegacyContractAcceptance(deps, f.userId, input);
    const receipt = await confirmLegacyContractAcceptance(deps, f.userId, {
      ...input,
      revision: preview.revision,
    });
    await reconcileLegacyCancellation(deps, f.userId, receipt.id);
    expect((await getCompassoAccess(db, f.userId, f.group.id)).active).toBe(true);
    const eventId = `evt_${randomUUID()}`;
    const webhook = {
      db,
      app: "cozya",
      provider: "stripe" as const,
      providerClient: provider,
      products,
    };
    offline = true;
    await expect(
      handleStripeEvent(webhook, {
        id: eventId,
        type: "invoice.created",
        payload: { id: eventId, data: { object: { customer: f.snapshot.customerId } } },
      }),
    ).rejects.toThrow("funding is incomplete");
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
    });
    offline = false;
    canceled = false;
    await retryLegacyFinancialEvents(webhook);
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
    });
  });
  it("never records a legacy acceptance that bypasses the committed family payer", async () => {
    const f = await fixture();
    const other = await fixture();
    const family = createFamilyService({ db });
    const invitation = await family.createInvitation(
      f.userId,
      f.group.id,
      `${other.userId}@example.test`,
    );
    await family.acceptInvitation(other.userId, invitation.token);
    await db.insert(schema.familyMigrationSources).values([
      { app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id },
      { app: "cozya", sourceOwnerId: other.userId, groupId: f.group.id },
    ]);
    const account = await openCompassoAccount(db, f.userId, f.group.id);
    const [customer] = await db
      .insert(schema.customers)
      .values({
        app: "compasso",
        provider: "stripe",
        providerCustomerId: `cus_${randomUUID()}`,
        subjectType: "billing_account",
        subjectId: account.id,
        email: `${f.userId}@example.test`,
      })
      .returning();
    if (!customer) throw new Error("Missing family customer");
    const [current] = await db
      .insert(schema.subscriptions)
      .values({
        customerId: customer.id,
        provider: "stripe",
        providerSubscriptionId: `sub_${randomUUID()}`,
        productId: "compasso_monthly",
        providerPriceId: "price_compasso",
        status: "active",
        currentPeriodStart: f.snapshot.start,
        currentPeriodEnd: f.snapshot.end,
      })
      .returning();
    if (!current) throw new Error("Missing current subscription");
    await persistPaymentPeriods(db, f.sub.id, f.snapshot);
    await db.insert(schema.legacyContractObservations).values({
      subscriptionId: f.sub.id,
      status: "active",
      providerPriceId: f.snapshot.priceId,
      periodStart: f.snapshot.start,
      periodEnd: f.snapshot.end,
      cancelAtPeriodEnd: false,
      observedAt: f.snapshot.observedAt,
    });
    const input = { groupId: f.group.id, subscriptionId: f.sub.id };
    const preview = await previewLegacyContractAcceptance(db, f.userId, input);
    // The payer already pays Compasso: the contract can only enter through the
    // coordination the adult was shown (legacy-coordination.integration.ts).
    expect(preview.coordination).toBe("payer_decides");
    await expect(
      acceptLegacyContract(db, f.userId, { ...input, revision: preview.revision }),
    ).rejects.toThrow("Review the updated contract preview");
    // The other adult is no longer locked out by the payer's account, but an
    // acceptance still needs that adult's own reconciled paid period.
    await expect(
      acceptLegacyContract(db, other.userId, {
        groupId: f.group.id,
        subscriptionId: other.sub.id,
        revision: "unused",
        coordination: "payer_decides",
      }),
    ).rejects.toThrow("Historical paid period requires reconciliation");
    expect(
      await db
        .select({ id: schema.legacyBillingCoordinations.id })
        .from(schema.legacyBillingCoordinations)
        .where(eq(schema.legacyBillingCoordinations.accountId, account.id)),
    ).toEqual([]);
  });
  it("fails closed when an acceptance points at another subscription's paid period", async () => {
    const f = await fixture();
    const other = await fixture();
    await db
      .insert(schema.familyMigrationSources)
      .values({ app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id });
    await persistPaymentPeriods(db, other.sub.id, other.snapshot);
    const [period] = await db
      .select()
      .from(schema.subscriptionPaymentPeriods)
      .where(eq(schema.subscriptionPaymentPeriods.subscriptionId, other.sub.id));
    if (!period) throw new Error("Missing other payment period");
    const [receipt] = await db
      .insert(schema.legacyContractAcceptances)
      .values({
        groupId: f.group.id,
        payerUserId: f.userId,
        subscriptionId: f.sub.id,
        policyVersion: "compasso-legacy-2026-11-10-v1",
      })
      .returning();
    if (!receipt) throw new Error("Missing receipt");
    await db
      .insert(schema.legacyContractAcceptancePeriods)
      .values({ acceptanceId: receipt.id, paymentPeriodId: period.id });
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
      canStartTrial: false,
    });
  });
  it("requires the payer's recent central session to record consent", async () => {
    const f = await fixture();
    await db
      .insert(schema.familyMigrationSources)
      .values({ app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id });
    const sessionId = `session-${randomUUID()}`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: f.userId,
      token: `token-${randomUUID()}`,
      originApp: "conta",
      createdAt: new Date(Date.now() - 20 * 60_000),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const product = PRODUCTS.find(
      (entry) => entry.app === "cozya" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing Cozya catalog");
    let observedAt = Date.now() - 1000;
    const deps = {
      db,
      products: [{ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } }],
      providerClient: {
        readSubscriptionPaymentFacts: async () => ({
          ...f.snapshot,
          observedAt: new Date(++observedAt),
        }),
      },
    };
    const input = { groupId: f.group.id, subscriptionId: f.sub.id };
    const preview = await prepareLegacyContractAcceptance(deps, f.userId, input);
    await expect(
      confirmRecentLegacyContractAcceptance(deps, f.userId, sessionId, {
        ...input,
        revision: preview.revision,
      }),
    ).rejects.toThrow("Recent central authentication");
    await db
      .update(schema.sessions)
      .set({ createdAt: new Date() })
      .where(eq(schema.sessions.id, sessionId));
    const receipt = await confirmRecentLegacyContractAcceptance(deps, f.userId, sessionId, {
      ...input,
      revision: preview.revision,
    });
    expect(receipt.payerUserId).toBe(f.userId);
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
    await expect(
      confirmRecentLegacyContractAcceptance(deps, f.userId, sessionId, {
        ...input,
        revision: preview.revision,
      }),
    ).rejects.toThrow("Recent central authentication");
  });
  it("resumes cancellation and refreshes coverage without treating a provider failure as evidence", async () => {
    const f = await fixture();
    await db
      .insert(schema.familyMigrationSources)
      .values({ app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id });
    const product = PRODUCTS.find(
      (entry) => entry.app === "cozya" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing Cozya catalog");
    let canceled = false;
    let offline = false;
    let observedAt = Date.now() - 1000;
    const provider = {
      readSubscriptionPaymentFacts: async () => {
        if (offline) throw new Error("Provider unavailable");
        return { ...f.snapshot, cancelAtPeriodEnd: canceled, observedAt: new Date(++observedAt) };
      },
      cancelSubscription: async () => {
        canceled = true;
        return {
          id: f.sub.providerSubscriptionId,
          status: "active" as const,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: f.snapshot.end,
        };
      },
    };
    const onError = vi.fn();
    const deps = {
      db,
      products: [{ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } }],
      providerClient: provider,
      onError,
    };
    const input = { groupId: f.group.id, subscriptionId: f.sub.id };
    const preview = await prepareLegacyContractAcceptance(deps, f.userId, input);
    await confirmLegacyContractAcceptance(deps, f.userId, { ...input, revision: preview.revision });
    expect(await runLegacyContractMaintenance(deps, { actorId: f.userId })).toEqual({
      checked: 1,
      failed: 0,
    });
    expect((await getCompassoAccess(db, f.userId, f.group.id)).active).toBe(true);
    const account = await openCompassoAccount(db, f.userId, f.group.id);
    const terms = await db.transaction((tx) => readLegacyFutureTerms(tx, f.userId, account.id));
    expect(terms.paidThrough).toEqual(f.snapshot.end);
    const compassoMonthly = PRODUCTS.find((entry) => entry.id === "compasso_monthly");
    if (!compassoMonthly) throw new Error("Missing Compasso monthly catalog");
    const historicalRead = vi.fn(provider.readSubscriptionPaymentFacts);
    const preflightDeps = {
      db,
      products: [
        ...deps.products,
        { ...compassoMonthly, stripePriceId: { dev: "price_compasso_fixture", prod: "" } },
      ],
      mode: "dev" as const,
      providerClient: { readSubscriptionPaymentFacts: historicalRead },
    };
    const choiceForPreflight = { accountId: account.id, productId: "compasso_monthly" as const };
    await expect(
      prepareLegacyFutureIntent(preflightDeps, `other-${randomUUID()}`, choiceForPreflight),
    ).rejects.toThrow();
    expect(historicalRead).not.toHaveBeenCalled();
    const prepared = await prepareLegacyFutureIntent(preflightDeps, f.userId, choiceForPreflight);
    expect(prepared.paidThrough).toEqual(f.snapshot.end);
    expect(historicalRead).toHaveBeenCalledOnce();
    expect(terms.startsAt.getTime()).toBeGreaterThanOrEqual(f.snapshot.end.getTime());
    expect(terms.startsAt.getTime() - f.snapshot.end.getTime()).toBeLessThan(1000);
    const laterEnd = new Date(f.snapshot.end.getTime() + 30 * 86400_000);
    const [second] = await db
      .insert(schema.subscriptions)
      .values({
        customerId: f.sub.customerId,
        provider: "stripe",
        providerSubscriptionId: `sub_${randomUUID()}`,
        productId: f.sub.productId,
        providerPriceId: f.snapshot.priceId,
        status: "canceled",
        currentPeriodStart: f.snapshot.start,
        currentPeriodEnd: laterEnd,
      })
      .returning();
    if (!second) throw new Error("Missing second contract");
    const [secondPeriod] = await db
      .insert(schema.subscriptionPaymentPeriods)
      .values({
        subscriptionId: second.id,
        provider: "stripe",
        providerInvoiceId: `in_${randomUUID()}`,
        providerLineId: "il_second",
        providerPriceId: f.snapshot.priceId,
        periodStart: f.snapshot.start,
        periodEnd: laterEnd,
        paidAt: f.snapshot.start,
        reconciledAt: f.snapshot.observedAt,
      })
      .returning();
    if (!secondPeriod) throw new Error("Missing second paid period");
    const [secondAcceptance] = await db
      .insert(schema.legacyContractAcceptances)
      .values({
        groupId: f.group.id,
        payerUserId: f.userId,
        subscriptionId: second.id,
        policyVersion: "compasso-legacy-2026-11-10-v1",
        cancellationConfirmedAt: new Date(),
      })
      .returning();
    if (!secondAcceptance) throw new Error("Missing second acceptance");
    await db
      .insert(schema.legacyContractAcceptancePeriods)
      .values({ acceptanceId: secondAcceptance.id, paymentPeriodId: secondPeriod.id });
    await db.insert(schema.legacyContractObservations).values({
      subscriptionId: second.id,
      status: "canceled",
      providerPriceId: f.snapshot.priceId,
      periodStart: f.snapshot.start,
      periodEnd: laterEnd,
      cancelAtPeriodEnd: false,
      observedAt: f.snapshot.observedAt,
    });
    const extended = await db.transaction((tx) => readLegacyFutureTerms(tx, f.userId, account.id));
    expect(extended.paidThrough).toEqual(laterEnd);
    expect(extended.revision).not.toBe(terms.revision);
    const readAll = vi.fn(async (providerId: string) => {
      if (providerId === f.sub.providerSubscriptionId)
        return provider.readSubscriptionPaymentFacts();
      if (providerId !== second.providerSubscriptionId) throw new Error("Unexpected contract");
      return {
        ...f.snapshot,
        subscriptionId: providerId,
        end: laterEnd,
        status: "canceled" as const,
        observedAt: new Date(++observedAt),
        periods: f.snapshot.periods.map((period) => ({
          ...period,
          invoiceId: secondPeriod.providerInvoiceId,
          lineId: secondPeriod.providerLineId,
          end: laterEnd,
        })),
      };
    });
    expect(
      (
        await prepareLegacyFutureIntent(
          { ...preflightDeps, providerClient: { readSubscriptionPaymentFacts: readAll } },
          f.userId,
          choiceForPreflight,
        )
      ).paidThrough,
    ).toEqual(laterEnd);
    expect(readAll).toHaveBeenCalledTimes(2);
    const [pendingEvent] = await db
      .insert(schema.webhookEvents)
      .values({
        provider: "stripe",
        providerEventId: `evt_${randomUUID()}`,
        app: "cozya",
        providerCustomerId: f.snapshot.customerId,
        eventType: "invoice.paid",
        payload: {},
      })
      .returning();
    if (!pendingEvent) throw new Error("Missing pending event");
    await expect(
      db.transaction((tx) => readLegacyFutureTerms(tx, f.userId, account.id)),
    ).rejects.toThrow("event requires reconciliation");
    await db
      .update(schema.webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(schema.webhookEvents.id, pendingEvent.id));
    await db
      .update(schema.subscriptionPaymentPeriods)
      .set({ fullyRefunded: true })
      .where(eq(schema.subscriptionPaymentPeriods.id, secondPeriod.id));
    await db
      .update(schema.legacyContractObservations)
      .set({ cancelAtPeriodEnd: false })
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    await expect(
      db.transaction((tx) => readLegacyFutureTerms(tx, f.userId, account.id)),
    ).rejects.toThrow("cancellation confirmation");
    await db
      .update(schema.legacyContractObservations)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    const monthly = PRODUCTS.find((entry) => entry.id === "compasso_monthly");
    if (!monthly) throw new Error("Missing Compasso catalog");
    const sessionId = `session-${randomUUID()}`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: f.userId,
      token: `token-${randomUUID()}`,
      originApp: "conta",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const futureDeps = {
      db,
      products: [{ ...monthly, stripePriceId: { dev: "price_compasso_fixture", prod: "" } }],
      mode: "dev" as const,
    };
    const choice = { accountId: account.id, productId: "compasso_monthly" as const };
    const futurePreview = await previewLegacyFutureIntent(futureDeps, f.userId, choice);
    const requestKey = randomUUID();
    await expect(
      createLegacyFutureIntent(futureDeps, f.userId, sessionId, {
        ...choice,
        revision: "a".repeat(64),
        requestKey,
      }),
    ).rejects.toThrow("updated future contract terms");
    const intent = await createLegacyFutureIntent(futureDeps, f.userId, sessionId, {
      ...choice,
      revision: futurePreview.revision,
      requestKey,
    });
    expect(
      (
        await createLegacyFutureIntent(futureDeps, f.userId, sessionId, {
          ...choice,
          revision: futurePreview.revision,
          requestKey,
        })
      ).id,
    ).toBe(intent.id);
    await expect(
      createLegacyFutureIntent(futureDeps, f.userId, sessionId, {
        ...choice,
        revision: futurePreview.revision,
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("already being prepared");
    const futureProvider = {
      setup: vi.fn(async () => ({
        id: "cs_future_fixture",
        status: "open" as const,
        url: "https://checkout.stripe.com/fixture",
      })),
      expireSetup: vi.fn(async () => ({ id: "cs_future_fixture", status: "expired" as const })),
    };
    const setupDeps = {
      ...futureDeps,
      providerClient: createFakeProvider().provider,
      futureProvider,
      publicUrl: "https://conta.example.test",
      verifyCatalog: async () => {},
    };
    futureProvider.setup.mockImplementationOnce(async () => {
      const [admitted] = await db
        .select()
        .from(schema.legacyFutureIntents)
        .where(eq(schema.legacyFutureIntents.id, intent.id));
      expect(admitted?.setupProtocolVersion).toBe(1);
      expect(admitted?.setupAttemptedAt).toBeInstanceOf(Date);
      return {
        id: "cs_future_fixture",
        status: "open",
        url: "https://checkout.stripe.com/fixture",
      };
    });
    await expect(
      openLegacyFutureSetup(setupDeps, f.userId, sessionId, { intentId: intent.id }),
    ).resolves.toMatchObject({ status: "open", url: "https://checkout.stripe.com/fixture" });
    expect(futureProvider.setup).toHaveBeenCalledWith(
      expect.objectContaining({
        successUrl: `https://conta.example.test/?pagamento=${account.id}#compasso`,
        cancelUrl: `https://conta.example.test/?pagamento=${account.id}#compasso`,
      }),
    );
    const readSetup = vi.fn(async () => ({ status: "open" as const, paymentMethodId: null }));
    await expect(
      confirmLegacyFutureSetup(
        { ...futureDeps, publicUrl: setupDeps.publicUrl, futureProvider: { readSetup } },
        f.userId,
        sessionId,
        { intentId: intent.id },
      ),
    ).resolves.toMatchObject({ state: "setup_pending" });
    futureProvider.setup.mockImplementationOnce(async () => {
      await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
      return {
        id: "cs_future_fixture",
        status: "open",
        url: "https://checkout.stripe.com/fixture",
      };
    });
    await expect(
      openLegacyFutureSetup(setupDeps, f.userId, sessionId, { intentId: intent.id }),
    ).rejects.toThrow("Recent central authentication");
    expect(futureProvider.expireSetup).toHaveBeenCalledOnce();
    const [review] = await db
      .select()
      .from(schema.legacyFutureIntents)
      .where(eq(schema.legacyFutureIntents.id, intent.id));
    expect(review).toMatchObject({ state: "review", setupSessionId: "cs_future_fixture" });
    await db
      .update(schema.legacyFutureIntents)
      .set({ state: "canceled" })
      .where(eq(schema.legacyFutureIntents.id, intent.id));
    const nextSession = `session-${randomUUID()}`;
    await db.insert(schema.sessions).values({
      id: nextSession,
      userId: f.userId,
      token: `token-${randomUUID()}`,
      originApp: "conta",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const nextIntent = await createLegacyFutureIntent(futureDeps, f.userId, nextSession, {
      ...choice,
      revision: futurePreview.revision,
      requestKey: randomUUID(),
    });
    const nextProvider = {
      ...futureProvider,
      setup: vi.fn(async () => ({
        id: "cs_future_second",
        status: "open" as const,
        url: "https://checkout.stripe.com/fixture",
      })),
    };
    await openLegacyFutureSetup(
      { ...setupDeps, futureProvider: nextProvider },
      f.userId,
      nextSession,
      { intentId: nextIntent.id },
    );
    const completed = vi.fn(async () => ({
      status: "complete" as const,
      paymentMethodId: "pm_fixture",
    }));
    await expect(
      confirmLegacyFutureSetup(
        { ...futureDeps, publicUrl: setupDeps.publicUrl, futureProvider: { readSetup: completed } },
        f.userId,
        nextSession,
        { intentId: nextIntent.id },
      ),
    ).resolves.toMatchObject({ state: "setup_ready" });
    await expect(
      confirmLegacyFutureSetup(
        { ...futureDeps, publicUrl: setupDeps.publicUrl, futureProvider: { readSetup: completed } },
        f.userId,
        nextSession,
        { intentId: nextIntent.id },
      ),
    ).resolves.toMatchObject({ state: "setup_ready" });
    expect(completed).toHaveBeenCalledOnce();
    const [ready] = await db
      .select()
      .from(schema.legacyFutureIntents)
      .where(eq(schema.legacyFutureIntents.id, nextIntent.id));
    expect(ready).toMatchObject({ state: "setup_ready", paymentMethodId: "pm_fixture" });
    const scheduleRead = vi.fn(async (providerId: string) => {
      if (providerId === f.sub.providerSubscriptionId)
        return provider.readSubscriptionPaymentFacts();
      if (providerId !== second.providerSubscriptionId) throw new Error("Unexpected contract");
      return {
        ...f.snapshot,
        subscriptionId: providerId,
        end: laterEnd,
        status: "canceled" as const,
        observedAt: new Date(++observedAt),
        periods: f.snapshot.periods.map((period) => ({
          ...period,
          invoiceId: secondPeriod.providerInvoiceId,
          lineId: secondPeriod.providerLineId,
          end: laterEnd,
          fullyRefunded: true,
        })),
      };
    });
    let scheduleCreated = false;
    const scheduleProvider = {
      findSchedule: vi.fn(async () =>
        scheduleCreated ? { id: "sched_fixture", status: "not_started" as const } : null,
      ),
      schedule: vi.fn(async () => {
        const [admitted] = await db
          .select()
          .from(schema.legacyFutureIntents)
          .where(eq(schema.legacyFutureIntents.id, nextIntent.id));
        expect(admitted?.scheduleProtocolVersion).toBe(1);
        expect(admitted?.scheduleAttemptedAt).toBeInstanceOf(Date);
        scheduleCreated = true;
        throw new Error("Lost provider response");
      }),
      cancelSchedule: vi.fn(async () => ({ id: "sched_fixture", status: "canceled" as const })),
    };
    const scheduleDeps = {
      ...preflightDeps,
      providerClient: { readSubscriptionPaymentFacts: scheduleRead },
      futureProvider: scheduleProvider,
      verifyCatalog: async () => {},
    };
    await expect(
      scheduleLegacyFutureIntent(scheduleDeps, f.userId, nextSession, { intentId: nextIntent.id }),
    ).rejects.toThrow("Lost provider response");
    await expect(
      scheduleLegacyFutureIntent(scheduleDeps, f.userId, nextSession, { intentId: nextIntent.id }),
    ).resolves.toMatchObject({ state: "scheduled" });
    expect(scheduleProvider.schedule).toHaveBeenCalledOnce();
    const boundary = new Date(Math.floor((Date.now() - 60_000) / 1000) * 1000);
    await db
      .update(schema.legacyFutureIntents)
      .set({ startsAt: boundary, paidThrough: boundary })
      .where(eq(schema.legacyFutureIntents.id, nextIntent.id));
    const settlementProvider = {
      readSchedule: vi.fn(async () => ({
        id: "sched_fixture",
        status: "active" as const,
        subscriptionId: "sub_compasso_fixture",
      })),
    };
    await expect(
      settleLegacyFutureIntent(
        { db, futureProvider: settlementProvider },
        { intentId: nextIntent.id },
      ),
    ).resolves.toMatchObject({ state: "waiting" });
    const [compassoCustomer] = await db
      .select()
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.subjectType, "billing_account"),
          eq(schema.customers.subjectId, account.id),
          eq(schema.customers.app, "compasso"),
        ),
      );
    if (!compassoCustomer) throw new Error("Missing Compasso customer");
    const [nativeSub] = await db
      .insert(schema.subscriptions)
      .values({
        customerId: compassoCustomer.id,
        provider: "stripe",
        providerSubscriptionId: "sub_compasso_fixture",
        productId: "compasso_monthly",
        providerPriceId: "price_compasso_fixture",
        status: "active",
        currentPeriodStart: boundary,
        currentPeriodEnd: new Date(boundary.getTime() + 30 * 86400_000),
      })
      .returning();
    if (!nativeSub) throw new Error("Missing native subscription");
    await db.insert(schema.subscriptionPaymentPeriods).values({
      subscriptionId: nativeSub.id,
      provider: "stripe",
      providerInvoiceId: "in_native_fixture",
      providerLineId: "il_native_fixture",
      providerPriceId: "price_compasso_fixture",
      periodStart: boundary,
      periodEnd: new Date(boundary.getTime() + 30 * 86400_000),
      paidAt: boundary,
      disputed: true,
    });
    await expect(
      settleLegacyFutureIntent(
        { db, futureProvider: settlementProvider },
        { intentId: nextIntent.id },
      ),
    ).resolves.toMatchObject({ state: "waiting" });
    await db
      .update(schema.subscriptionPaymentPeriods)
      .set({ disputed: false })
      .where(eq(schema.subscriptionPaymentPeriods.subscriptionId, nativeSub.id));
    await expect(
      settleLegacyFutureIntent(
        { db, futureProvider: settlementProvider },
        { intentId: nextIntent.id },
      ),
    ).resolves.toMatchObject({ state: "applied" });
    await db
      .delete(schema.subscriptionPaymentPeriods)
      .where(eq(schema.subscriptionPaymentPeriods.subscriptionId, nativeSub.id));
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.id, nativeSub.id));
    await db
      .delete(schema.collectionBillingJobs)
      .where(eq(schema.collectionBillingJobs.customerId, compassoCustomer.id));
    await db
      .update(schema.legacyFutureIntents)
      .set({ state: "canceled" })
      .where(eq(schema.legacyFutureIntents.id, nextIntent.id));
    const thirdIntent = await createLegacyFutureIntent(futureDeps, f.userId, nextSession, {
      ...choice,
      revision: futurePreview.revision,
      requestKey: randomUUID(),
    });
    const thirdProvider = {
      ...futureProvider,
      setup: vi.fn(async () => ({
        id: "cs_future_third",
        status: "open" as const,
        url: "https://checkout.stripe.com/fixture",
      })),
    };
    await openLegacyFutureSetup(
      { ...setupDeps, futureProvider: thirdProvider },
      f.userId,
      nextSession,
      { intentId: thirdIntent.id },
    );
    const changedDuringRead = vi.fn(async () => {
      await db
        .update(schema.legacyContractObservations)
        .set({ cancelAtPeriodEnd: false })
        .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
      return { status: "complete" as const, paymentMethodId: "pm_fixture" };
    });
    await expect(
      confirmLegacyFutureSetup(
        {
          ...futureDeps,
          publicUrl: setupDeps.publicUrl,
          futureProvider: { readSetup: changedDuringRead },
        },
        f.userId,
        nextSession,
        { intentId: thirdIntent.id },
      ),
    ).resolves.toMatchObject({ state: "review" });
    const [changedIntent] = await db
      .select()
      .from(schema.legacyFutureIntents)
      .where(eq(schema.legacyFutureIntents.id, thirdIntent.id));
    expect(changedIntent).toMatchObject({ state: "review", paymentMethodId: null });
    const reviewProvider = {
      findSchedule: vi.fn(async () => null),
      cancelSchedule: vi.fn(async () => ({ id: "unused", status: "canceled" as const })),
      findSetupSession: vi.fn(async () => null),
      expireSetup: vi.fn(async () => ({ id: "cs_future_third", status: "complete" as const })),
    };
    await expect(
      requestLegacyFutureCancellation(
        { db, mode: "dev", publicUrl: setupDeps.publicUrl, futureProvider: reviewProvider },
        f.userId,
        nextSession,
        { intentId: thirdIntent.id },
      ),
    ).resolves.toMatchObject({ state: "canceled" });
    await db
      .update(schema.legacyContractObservations)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    const fourthIntent = await createLegacyFutureIntent(futureDeps, f.userId, nextSession, {
      ...choice,
      revision: futurePreview.revision,
      requestKey: randomUUID(),
    });
    const fourthProvider = {
      ...futureProvider,
      setup: vi.fn(async () => ({
        id: "cs_future_fourth",
        status: "open" as const,
        url: "https://checkout.stripe.com/fixture",
      })),
    };
    await openLegacyFutureSetup(
      { ...setupDeps, futureProvider: fourthProvider },
      f.userId,
      nextSession,
      { intentId: fourthIntent.id },
    );
    await confirmLegacyFutureSetup(
      { ...futureDeps, publicUrl: setupDeps.publicUrl, futureProvider: { readSetup: completed } },
      f.userId,
      nextSession,
      { intentId: fourthIntent.id },
    );
    const cancelChanged = vi.fn(async () => ({ id: "sched_changed", status: "canceled" as const }));
    const changedScheduleProvider = {
      findSchedule: vi.fn(async () => null),
      cancelSchedule: cancelChanged,
      schedule: vi.fn(async () => {
        await db
          .update(schema.legacyContractObservations)
          .set({ cancelAtPeriodEnd: false })
          .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
        return { id: "sched_changed", status: "not_started" as const };
      }),
    };
    await expect(
      scheduleLegacyFutureIntent(
        { ...scheduleDeps, futureProvider: changedScheduleProvider },
        f.userId,
        nextSession,
        { intentId: fourthIntent.id },
      ),
    ).rejects.toThrow();
    expect(cancelChanged).toHaveBeenCalledOnce();
    const [scheduleReview] = await db
      .select()
      .from(schema.legacyFutureIntents)
      .where(eq(schema.legacyFutureIntents.id, fourthIntent.id));
    expect(scheduleReview).toMatchObject({ state: "review", scheduleId: "sched_changed" });
    await db
      .update(schema.legacyFutureIntents)
      .set({ state: "canceled" })
      .where(eq(schema.legacyFutureIntents.id, fourthIntent.id));
    await db
      .update(schema.legacyContractObservations)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    const cancelIntent = await createLegacyFutureIntent(futureDeps, f.userId, nextSession, {
      ...choice,
      revision: futurePreview.revision,
      requestKey: randomUUID(),
    });
    const cancelSetupProvider = {
      ...futureProvider,
      setup: vi.fn(async () => ({
        id: "cs_future_cancel",
        status: "open" as const,
        url: "https://checkout.stripe.com/fixture",
      })),
    };
    await openLegacyFutureSetup(
      { ...setupDeps, futureProvider: cancelSetupProvider },
      f.userId,
      nextSession,
      { intentId: cancelIntent.id },
    );
    await confirmLegacyFutureSetup(
      { ...futureDeps, publicUrl: setupDeps.publicUrl, futureProvider: { readSetup: completed } },
      f.userId,
      nextSession,
      { intentId: cancelIntent.id },
    );
    let canceledByUser = false;
    const userCancelProvider = {
      findSetupSession: vi.fn(async () => null),
      expireSetup: futureProvider.expireSetup,
      findSchedule: vi.fn(async () => ({
        id: "sched_user_cancel",
        status: canceledByUser ? ("canceled" as const) : ("not_started" as const),
      })),
      schedule: vi.fn(async () => ({ id: "sched_user_cancel", status: "not_started" as const })),
      cancelSchedule: vi.fn(async () => {
        canceledByUser = true;
        return { id: "sched_user_cancel", status: "canceled" as const };
      }),
    };
    await scheduleLegacyFutureIntent(
      { ...scheduleDeps, futureProvider: userCancelProvider },
      f.userId,
      nextSession,
      { intentId: cancelIntent.id },
    );
    await expect(
      requestLegacyFutureCancellation(
        { db, mode: "dev", publicUrl: setupDeps.publicUrl, futureProvider: userCancelProvider },
        `other-${randomUUID()}`,
        nextSession,
        { intentId: cancelIntent.id },
      ),
    ).rejects.toThrow();
    expect(userCancelProvider.cancelSchedule).not.toHaveBeenCalled();
    await expect(
      requestLegacyFutureCancellation(
        { db, mode: "dev", publicUrl: setupDeps.publicUrl, futureProvider: userCancelProvider },
        f.userId,
        nextSession,
        { intentId: cancelIntent.id },
      ),
    ).resolves.toMatchObject({ state: "canceled" });
    await expect(
      requestLegacyFutureCancellation(
        { db, mode: "dev", publicUrl: setupDeps.publicUrl, futureProvider: userCancelProvider },
        f.userId,
        nextSession,
        { intentId: cancelIntent.id },
      ),
    ).resolves.toMatchObject({ state: "canceled" });
    expect(userCancelProvider.cancelSchedule).toHaveBeenCalledOnce();
    const setupCancelIntent = await createLegacyFutureIntent(futureDeps, f.userId, nextSession, {
      ...choice,
      revision: futurePreview.revision,
      requestKey: randomUUID(),
    });
    const setupCancelOpening = {
      ...futureProvider,
      setup: vi.fn(async () => ({
        id: "cs_future_setup_cancel",
        status: "open" as const,
        url: "https://checkout.stripe.com/fixture",
      })),
    };
    await openLegacyFutureSetup(
      { ...setupDeps, futureProvider: setupCancelOpening },
      f.userId,
      nextSession,
      { intentId: setupCancelIntent.id },
    );
    const expireSetup = vi.fn(async () => ({
      id: "cs_future_setup_cancel",
      status: "expired" as const,
    }));
    expireSetup.mockRejectedValueOnce(new Error("Setup provider unavailable"));
    const pendingSetupProvider = {
      ...userCancelProvider,
      expireSetup,
      findSetupSession: vi.fn(async () => ({
        id: "cs_future_setup_cancel",
        status: "open" as const,
      })),
      readSchedule: vi.fn(async () => ({
        id: "unused",
        status: "active" as const,
        subscriptionId: null,
      })),
    };
    await expect(
      requestLegacyFutureCancellation(
        { db, mode: "dev", publicUrl: setupDeps.publicUrl, futureProvider: pendingSetupProvider },
        f.userId,
        nextSession,
        { intentId: setupCancelIntent.id },
      ),
    ).rejects.toThrow("Setup provider unavailable");
    await db
      .update(schema.legacyFutureIntents)
      .set({ setupSessionId: null, updatedAt: new Date(Date.now() - 4 * 60_000) })
      .where(eq(schema.legacyFutureIntents.id, setupCancelIntent.id));
    const setupErrors = vi.fn();
    await expect(
      runLegacyFutureRecovery(
        {
          db,
          mode: "dev",
          publicUrl: setupDeps.publicUrl,
          futureProvider: pendingSetupProvider,
          onError: setupErrors,
        },
        { actorId: f.userId },
      ),
    ).resolves.toEqual({ checked: 1, failed: 0 });
    const [setupCanceled] = await db
      .select()
      .from(schema.legacyFutureIntents)
      .where(eq(schema.legacyFutureIntents.id, setupCancelIntent.id));
    expect(setupCanceled?.state).toBe("canceled");
    expect(pendingSetupProvider.findSetupSession).toHaveBeenCalledOnce();
    expect(expireSetup).toHaveBeenCalledTimes(2);
    const neverOpened = await createLegacyFutureIntent(futureDeps, f.userId, nextSession, {
      ...choice,
      revision: futurePreview.revision,
      requestKey: randomUUID(),
    });
    const unopenedProvider = { ...pendingSetupProvider, findSetupSession: vi.fn(async () => null) };
    await expect(
      requestLegacyFutureCancellation(
        { db, mode: "dev", publicUrl: setupDeps.publicUrl, futureProvider: unopenedProvider },
        f.userId,
        nextSession,
        { intentId: neverOpened.id },
      ),
    ).resolves.toMatchObject({ state: "canceled", providerStatus: "not_started" });
    expect(unopenedProvider.findSetupSession).not.toHaveBeenCalled();
    const unopened = await createLegacyFutureIntent(futureDeps, f.userId, nextSession, {
      ...choice,
      revision: futurePreview.revision,
      requestKey: randomUUID(),
    });
    await db
      .update(schema.legacyFutureIntents)
      .set({ setupProtocolVersion: 0 })
      .where(eq(schema.legacyFutureIntents.id, unopened.id));
    await expect(
      requestLegacyFutureCancellation(
        { db, mode: "dev", publicUrl: setupDeps.publicUrl, futureProvider: unopenedProvider },
        f.userId,
        nextSession,
        { intentId: unopened.id },
      ),
    ).resolves.toMatchObject({ state: "review", providerStatus: "not_found" });
    await db
      .update(schema.legacyFutureIntents)
      .set({ scheduleId: "sched_inconsistent" })
      .where(eq(schema.legacyFutureIntents.id, unopened.id));
    await expect(
      cancelUnsettledLegacyFutureSetup(
        { db, mode: "dev", publicUrl: setupDeps.publicUrl, futureProvider: unopenedProvider },
        { intentId: unopened.id },
      ),
    ).rejects.toThrow();
    await db
      .update(schema.legacyFutureIntents)
      .set({
        scheduleId: null,
        setupExpiresAt: new Date(Date.now() - 1000),
        updatedAt: new Date(Date.now() - 4 * 60_000),
      })
      .where(eq(schema.legacyFutureIntents.id, unopened.id));
    await expect(
      runLegacyFutureRecovery(
        {
          db,
          mode: "dev",
          publicUrl: setupDeps.publicUrl,
          futureProvider: unopenedProvider,
          onError: setupErrors,
        },
        { actorId: f.userId },
      ),
    ).resolves.toEqual({ checked: 1, failed: 0 });
    const [unopenedCanceled] = await db
      .select()
      .from(schema.legacyFutureIntents)
      .where(eq(schema.legacyFutureIntents.id, unopened.id));
    expect(unopenedCanceled?.state).toBe("canceled");
    const fifthIntent = await createLegacyFutureIntent(futureDeps, f.userId, nextSession, {
      ...choice,
      revision: futurePreview.revision,
      requestKey: randomUUID(),
    });
    const fifthProvider = {
      ...futureProvider,
      setup: vi.fn(async () => ({
        id: "cs_future_fifth",
        status: "open" as const,
        url: "https://checkout.stripe.com/fixture",
      })),
    };
    await openLegacyFutureSetup(
      { ...setupDeps, futureProvider: fifthProvider },
      f.userId,
      nextSession,
      { intentId: fifthIntent.id },
    );
    await confirmLegacyFutureSetup(
      { ...futureDeps, publicUrl: setupDeps.publicUrl, futureProvider: { readSetup: completed } },
      f.userId,
      nextSession,
      { intentId: fifthIntent.id },
    );
    let recoveryStatus: "not_started" | "canceled" = "not_started";
    let recoveryCreated = false;
    const recoveryProvider = {
      findSetupSession: vi.fn(async () => null),
      expireSetup: futureProvider.expireSetup,
      readSchedule: vi.fn(async () => ({
        id: "sched_recovery",
        status: "active" as const,
        subscriptionId: "sub_recovery",
      })),
      findSchedule: vi.fn(async () =>
        recoveryCreated ? { id: "sched_recovery", status: recoveryStatus } : null,
      ),
      schedule: vi.fn(async () => {
        recoveryCreated = true;
        throw new Error("Lost recovery response");
      }),
      cancelSchedule: vi.fn(async () => {
        recoveryStatus = "canceled";
        return { id: "sched_recovery", status: recoveryStatus };
      }),
    };
    await expect(
      scheduleLegacyFutureIntent(
        { ...scheduleDeps, futureProvider: recoveryProvider },
        f.userId,
        nextSession,
        { intentId: fifthIntent.id },
      ),
    ).rejects.toThrow("Lost recovery response");
    await db.delete(schema.sessions).where(eq(schema.sessions.id, nextSession));
    await db
      .update(schema.legacyFutureIntents)
      .set({ updatedAt: new Date(Date.now() - 4 * 60_000) })
      .where(eq(schema.legacyFutureIntents.id, fifthIntent.id));
    const onFutureError = vi.fn();
    await expect(
      runLegacyFutureRecovery(
        {
          db,
          mode: "dev",
          publicUrl: setupDeps.publicUrl,
          futureProvider: recoveryProvider,
          onError: onFutureError,
        },
        { actorId: f.userId },
      ),
    ).resolves.toEqual({ checked: 1, failed: 0 });
    expect(onFutureError).not.toHaveBeenCalled();
    await expect(
      cancelUnsettledLegacyFutureIntent(
        { db, futureProvider: recoveryProvider },
        { intentId: fifthIntent.id },
      ),
    ).resolves.toMatchObject({ providerStatus: "canceled" });
    expect(recoveryProvider.cancelSchedule).toHaveBeenCalledOnce();
    await db
      .update(schema.legacyFutureIntents)
      .set({
        state: "scheduling",
        scheduleId: null,
        cancelRequestedAt: null,
        updatedAt: new Date(Date.now() - 4 * 60_000),
      })
      .where(eq(schema.legacyFutureIntents.id, fifthIntent.id));
    const missingProvider = { ...recoveryProvider, findSchedule: vi.fn(async () => null) };
    await expect(
      runLegacyFutureRecovery(
        {
          db,
          mode: "dev",
          publicUrl: setupDeps.publicUrl,
          futureProvider: missingProvider,
          onError: onFutureError,
        },
        { actorId: f.userId },
      ),
    ).resolves.toEqual({ checked: 1, failed: 1 });
    expect(onFutureError).toHaveBeenCalledOnce();
    const [missingSchedule] = await db
      .select()
      .from(schema.legacyFutureIntents)
      .where(eq(schema.legacyFutureIntents.id, fifthIntent.id));
    expect(missingSchedule?.state).toBe("review");
    await db
      .update(schema.legacyFutureIntents)
      .set({ state: "canceled" })
      .where(eq(schema.legacyFutureIntents.id, fifthIntent.id));
    const expiredObservation = new Date(Date.now() - 6 * 60_000);
    await db
      .update(schema.legacyContractObservations)
      .set({ observedAt: expiredObservation })
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    offline = true;
    expect(await runLegacyContractMaintenance(deps, { actorId: f.userId })).toEqual({
      checked: 1,
      failed: 1,
    });
    const [old] = await db
      .select()
      .from(schema.legacyContractObservations)
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    expect(old?.observedAt).toEqual(expiredObservation);
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
    });
    expect(onError).toHaveBeenCalledOnce();
    offline = false;
    await db
      .update(schema.legacyContractObservations)
      .set({ refreshAttemptedAt: new Date(Date.now() - 120_000) })
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    expect(await runLegacyContractMaintenance(deps, { actorId: f.userId })).toEqual({
      checked: 1,
      failed: 0,
    });
    expect((await getCompassoAccess(db, f.userId, f.group.id)).active).toBe(true);
    await db
      .delete(schema.legacyContractObservations)
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    expect(await runLegacyContractMaintenance(deps, { actorId: f.userId })).toEqual({
      checked: 1,
      failed: 1,
    });
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
    });
    await refreshCompassoLegacySubscriptionFunding(
      { ...deps, app: "cozya" },
      f.sub.providerSubscriptionId,
    );
    expect((await getCompassoAccess(db, f.userId, f.group.id)).active).toBe(true);
  });
  it("waits for the family transaction before changing paid facts", async () => {
    const f = await fixture();
    await db
      .insert(schema.familyMigrationSources)
      .values({ app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id });
    const product = PRODUCTS.find(
      (entry) => entry.app === "cozya" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing Cozya catalog");
    let ready = () => {};
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await lockFamilyMembership(tx, f.userId, f.group.id);
      ready();
      await proceed;
    });
    await held;
    const reconciliation = refreshCompassoLegacySubscriptionFunding(
      {
        db,
        app: "cozya",
        products: [{ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } }],
        providerClient: { readSubscriptionPaymentFacts: async () => f.snapshot },
      },
      f.sub.providerSubscriptionId,
    );
    try {
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (Date.now() < deadline && !waiting) {
        const [row] = await db.execute<{ waiting: boolean }>(sql`select exists (
          select 1 from pg_stat_activity where datname = current_database()
          and wait_event_type = 'Lock' and query like '%family%groups%for update%'
        ) as waiting`);
        waiting = row?.waiting === true;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      expect(
        await db
          .select()
          .from(schema.subscriptionPaymentPeriods)
          .where(eq(schema.subscriptionPaymentPeriods.subscriptionId, f.sub.id)),
      ).toHaveLength(0);
    } finally {
      release();
      const [, result] = await Promise.all([holder, reconciliation]);
      expect(result).toBe(true);
    }
  });
  it("avoids a family, wallet and subscription lock cycle during event admission", async () => {
    const f = await fixture();
    await db
      .insert(schema.familyMigrationSources)
      .values({ app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id });
    const product = PRODUCTS.find(
      (entry) => entry.app === "cozya" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing Cozya catalog");
    let ready = () => {};
    let advance = () => {};
    const held = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      advance = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await lockFamilyMembership(tx, f.userId, f.group.id);
      ready();
      await proceed;
      await tx.execute(
        sql`select id from billing.subscriptions where id = ${f.sub.id} for update nowait`,
      );
    });
    await held;
    const admission = withLegacyFinancialEventLock(
      { db, app: "cozya" },
      { type: "charge.refunded", payload: {} },
      async () => true,
      f.snapshot.customerId,
    );
    const deadline = Date.now() + 5000;
    async function waitForLock(query: ReturnType<typeof sql>) {
      while (Date.now() < deadline) {
        const [row] = await db.execute<{ waiting: boolean }>(query);
        if (row?.waiting) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("Expected database lock wait was not observed");
    }
    let reconciliation: Promise<boolean> | undefined;
    try {
      await waitForLock(sql`select exists (select 1 from pg_stat_activity where datname = current_database()
        and wait_event_type = 'Lock' and query like '%family%groups%for update%') as waiting`);
      reconciliation = refreshCompassoLegacySubscriptionFunding(
        {
          db,
          app: "cozya",
          products: [{ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } }],
          providerClient: { readSubscriptionPaymentFacts: async () => f.snapshot },
        },
        f.sub.providerSubscriptionId,
      );
      await waitForLock(sql`select exists (select 1 from pg_locks where locktype = 'advisory' and not granted
        and objid::bigint = (hashtext(${`user:${f.userId}`})::bigint & 4294967295)) as waiting`);
    } finally {
      advance();
      await Promise.all([holder, admission, ...(reconciliation ? [reconciliation] : [])]);
    }
  });
  it.each(["missing", "unavailable"])(
    "retains an adverse event for retry when customer is %s",
    async (failure) => {
      const f = await fixture();
      await db
        .insert(schema.familyMigrationSources)
        .values({ app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id });
      const product = PRODUCTS.find(
        (entry) => entry.app === "cozya" && entry.kind === "subscription",
      );
      if (!product) throw new Error("Missing Cozya catalog");
      let resolved = false;
      const provider = {
        ...createFakeProvider().provider,
        readEventCustomerId: async () => {
          if (resolved) return f.snapshot.customerId;
          if (failure === "unavailable") throw new Error("Provider temporarily unavailable");
          return null;
        },
        readSubscriptionPaymentFacts: async () => f.snapshot,
      };
      const eventId = `evt_${randomUUID()}`;
      const deps = {
        db,
        app: "cozya",
        provider: "stripe" as const,
        providerClient: provider,
        products: [{ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } }],
      };
      await expect(
        handleStripeEvent(deps, {
          id: eventId,
          type: "charge.refunded",
          payload: { id: eventId, data: { object: {} } },
        }),
      ).rejects.toThrow(
        failure === "unavailable"
          ? "Provider temporarily unavailable"
          : "customer requires reconciliation",
      );
      const [event] = await db
        .select()
        .from(schema.webhookEvents)
        .where(eq(schema.webhookEvents.providerEventId, eventId));
      expect(event).toMatchObject({ processedAt: null, providerCustomerId: null });
      if (!event) throw new Error("Missing event fixture");
      resolved = true;
      await retryLegacyFinancialEvents(deps);
      const [retried] = await db
        .select()
        .from(schema.webhookEvents)
        .where(eq(schema.webhookEvents.id, event.id));
      expect(retried?.processedAt).toBeInstanceOf(Date);
    },
  );
  it("reconciles an adverse event for a legacy app without an AI wallet", async () => {
    const f = await fixture();
    const [customer] = await db
      .insert(schema.customers)
      .values({
        app: "bora-treinar",
        provider: "stripe",
        providerCustomerId: `cus_${randomUUID()}`,
        subjectType: "user",
        subjectId: f.userId,
        email: `${f.userId}@example.test`,
      })
      .returning();
    if (!customer) throw new Error("Missing Bora customer");
    await db.insert(schema.familyMigrationSources).values({
      app: "bora-treinar",
      sourceOwnerId: f.userId,
      groupId: f.group.id,
    });
    const product = PRODUCTS.find(
      (entry) => entry.app === "bora-treinar" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing Bora catalog");
    const [sub] = await db
      .insert(schema.subscriptions)
      .values({
        customerId: customer.id,
        provider: "stripe",
        providerSubscriptionId: `sub_${randomUUID()}`,
        providerPriceId: "price_bora_event",
        productId: product.id,
        status: "active",
        currentPeriodStart: f.snapshot.start,
        currentPeriodEnd: f.snapshot.end,
      })
      .returning();
    if (!sub) throw new Error("Missing Bora contract");
    const snapshot = {
      ...f.snapshot,
      customerId: customer.providerCustomerId,
      subscriptionId: sub.providerSubscriptionId,
      priceId: sub.providerPriceId,
      periods: f.snapshot.periods.map((period) => ({
        ...period,
        priceId: sub.providerPriceId,
        disputed: true,
      })),
    };
    const provider = {
      ...createFakeProvider().provider,
      readSubscriptionPaymentFacts: async () => snapshot,
    };
    const result = await handleStripeEvent(
      {
        db,
        app: "bora-treinar",
        provider: "stripe",
        providerClient: provider,
        products: [{ ...product, stripePriceId: { dev: sub.providerPriceId, prod: "" } }],
      },
      {
        id: `evt_${randomUUID()}`,
        type: "charge.dispute.created",
        payload: { data: { object: { customer: customer.providerCustomerId } } },
      },
    );
    expect(result.processed).toBe(true);
    const [period] = await db
      .select()
      .from(schema.subscriptionPaymentPeriods)
      .where(eq(schema.subscriptionPaymentPeriods.subscriptionId, sub.id));
    expect(period?.disputed).toBe(true);
  });
  it.each([true, false])(
    "admits an adverse event after the family transaction (identified=%s)",
    async (identified) => {
      const f = await fixture();
      await db.insert(schema.familyMigrationSources).values({
        app: "cozya",
        sourceOwnerId: f.userId,
        groupId: f.group.id,
      });
      let unlock = () => {};
      let ready = () => {};
      const held = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const release = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const holder = db.transaction(async (tx) => {
        await lockFamilyMembership(tx, f.userId, f.group.id);
        ready();
        await release;
      });
      await held;
      let admitted = false;
      const admission = withLegacyFinancialEventLock(
        { db, app: "cozya" },
        { type: "charge.refunded", payload: {} },
        async () => {
          admitted = true;
          return true;
        },
        identified ? f.snapshot.customerId : null,
      );
      try {
        const until = Date.now() + 5000;
        let waiting = false;
        while (Date.now() < until && !waiting) {
          const [row] = await db.execute<{ waiting: boolean }>(sql`select exists (
          select 1 from pg_stat_activity where datname = current_database()
          and wait_event_type = 'Lock' and query like '%family%groups%for update%'
        ) as waiting`);
          waiting = row?.waiting === true;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
        expect(admitted).toBe(false);
      } finally {
        unlock();
        const [, result] = await Promise.all([holder, admission]);
        expect(result).toBe(true);
      }
      expect(admitted).toBe(true);
    },
  );
  it("waits for the source wallet before locking the legacy subscription", async () => {
    const f = await fixture();
    const product = PRODUCTS.find(
      (entry) => entry.app === "cozya" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing Cozya catalog");
    let unlock = () => {};
    let ready = () => {};
    const held = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await lockCreditOwner(tx, f.owner);
      ready();
      await release;
      await tx.execute(
        sql`select id from billing.subscriptions where id = ${f.sub.id} for update nowait`,
      );
    });
    await held;
    const reconciliation = refreshCompassoLegacySubscriptionFunding(
      {
        db,
        app: "cozya",
        products: [{ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } }],
        providerClient: { readSubscriptionPaymentFacts: async () => f.snapshot },
      },
      f.sub.providerSubscriptionId,
    );
    try {
      const until = Date.now() + 5000;
      let waiting = false;
      while (Date.now() < until && !waiting) {
        const [row] = await db.execute<{ waiting: boolean }>(sql`select exists (
          select 1 from pg_locks where locktype = 'advisory' and not granted
          and objid::bigint = (hashtext(${`user:${f.userId}`})::bigint & 4294967295)
        ) as waiting`);
        waiting = row?.waiting === true;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
    } finally {
      unlock();
      const [, result] = await Promise.all([holder, reconciliation]);
      expect(result).toBe(true);
    }
  });
  it("recovers a lost cancellation response without canceling twice", async () => {
    const f = await fixture();
    await db
      .insert(schema.familyMigrationSources)
      .values({ app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id });
    const product = PRODUCTS.find(
      (entry) => entry.app === "cozya" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing Cozya catalog");
    let canceled = false;
    let status: "active" | "past_due" = "active";
    let disputed = false;
    let observedAt = Date.now() - 2000;
    const read = vi.fn(async () => ({
      ...f.snapshot,
      status,
      cancelAtPeriodEnd: canceled,
      periods: f.snapshot.periods.map((period) => ({ ...period, disputed })),
      observedAt: new Date(++observedAt),
    }));
    const cancel = vi.fn(async () => {
      canceled = true;
      throw new Error("Lost response after provider accepted cancellation");
    });
    const deps = {
      db,
      products: [{ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } }],
      providerClient: { readSubscriptionPaymentFacts: read, cancelSubscription: cancel },
    };
    const input = { groupId: f.group.id, subscriptionId: f.sub.id };
    const preview = await prepareLegacyContractAcceptance(deps, f.userId, input);
    const receipt = await confirmLegacyContractAcceptance(deps, f.userId, {
      ...input,
      revision: preview.revision,
    });
    status = "past_due";
    await expect(reconcileLegacyCancellation(deps, f.userId, receipt.id)).rejects.toThrow(
      "contract changed after acceptance",
    );
    expect(cancel).not.toHaveBeenCalled();
    status = "active";
    await expect(reconcileLegacyCancellation(deps, f.userId, receipt.id)).rejects.toThrow(
      "Lost response",
    );
    const results = await Promise.all([
      reconcileLegacyCancellation(deps, f.userId, receipt.id),
      reconcileLegacyCancellation(deps, f.userId, receipt.id),
    ]);
    expect(results.every((result) => result.cancellationConfirmedAt instanceof Date)).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: true,
      source: "legacy",
      endsAt: f.snapshot.end,
    });
    await db
      .update(schema.legacyContractAcceptances)
      .set({ policyVersion: "unknown-policy" })
      .where(eq(schema.legacyContractAcceptances.id, receipt.id));
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
      canStartTrial: false,
    });
    await db
      .update(schema.legacyContractAcceptances)
      .set({ policyVersion: "compasso-legacy-2026-11-10-v1" })
      .where(eq(schema.legacyContractAcceptances.id, receipt.id));
    await db
      .delete(schema.familyMigrationSources)
      .where(
        and(
          eq(schema.familyMigrationSources.app, "cozya"),
          eq(schema.familyMigrationSources.sourceOwnerId, f.userId),
        ),
      );
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
    });
    await db
      .insert(schema.familyMigrationSources)
      .values({ app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id });
    await db
      .update(schema.legacyContractObservations)
      .set({ observedAt: new Date(Date.now() - 6 * 60_000) })
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
    });
    await refreshCompassoLegacySubscriptionFunding(
      { ...deps, app: "cozya" },
      f.sub.providerSubscriptionId,
    );
    expect((await getCompassoAccess(db, f.userId, f.group.id)).active).toBe(true);
    const otherGroup = await createFamilyService({ db }).createGroup(f.userId, "Other coverage");
    expect((await getCompassoAccess(db, f.userId, otherGroup.id)).active).toBe(false);
    const [event] = await db
      .insert(schema.webhookEvents)
      .values({
        provider: "stripe",
        providerEventId: `evt_${randomUUID()}`,
        app: "cozya",
        providerCustomerId: f.snapshot.customerId,
        eventType: "charge.dispute.created",
        payload: {},
      })
      .returning();
    if (!event) throw new Error("Missing dispute event");
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
    });
    disputed = true;
    await refreshCompassoLegacySubscriptionFunding(
      { ...deps, app: "cozya" },
      f.sub.providerSubscriptionId,
    );
    await db
      .update(schema.webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(schema.webhookEvents.id, event.id));
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
    });
  });
  it("grants paid-period coverage after consent before stopping an old renewal", async () => {
    const f = await fixture();
    await db.insert(schema.familyMigrationSources).values({
      app: "cozya",
      sourceOwnerId: f.userId,
      groupId: f.group.id,
    });
    const product = PRODUCTS.find(
      (entry) => entry.app === "cozya" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing Cozya catalog");
    let observationTime = Date.now() - 1000;
    const read = vi.fn(async () => ({
      ...f.snapshot,
      cancelAtPeriodEnd: false,
      observedAt: new Date(++observationTime),
    }));
    const deps = {
      db,
      products: [{ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } }],
      providerClient: { readSubscriptionPaymentFacts: read },
    };
    const input = { groupId: f.group.id, subscriptionId: f.sub.id };
    const preview = await prepareLegacyContractAcceptance(deps, f.userId, input);
    const receipt = await confirmLegacyContractAcceptance(deps, f.userId, {
      ...input,
      revision: preview.revision,
    });
    expect(receipt.payerUserId).toBe(f.userId);
    expect(await getCompassoAccess(db, f.userId, f.group.id)).toMatchObject({
      active: true,
      source: "legacy",
      endsAt: f.snapshot.end,
    });
  });
  it("checks ownership before provider reads and reconciles again before consent", async () => {
    const f = await fixture();
    await db
      .insert(schema.familyMigrationSources)
      .values({ app: "cozya", sourceOwnerId: f.userId, groupId: f.group.id });
    const product = PRODUCTS.find(
      (entry) => entry.app === "cozya" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing Cozya catalog");
    let canceled = true;
    let observationTime = Date.now() - 1000;
    const read = vi.fn(async () => ({
      ...f.snapshot,
      cancelAtPeriodEnd: canceled,
      observedAt: new Date(++observationTime),
    }));
    const deps = {
      db,
      products: [{ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } }],
      providerClient: { readSubscriptionPaymentFacts: read },
    };
    const input = { groupId: f.group.id, subscriptionId: f.sub.id };
    const other = await createFamilyService({ db }).createGroup(f.userId, "Unlinked family");
    await expect(
      prepareLegacyContractAcceptance(deps, f.userId, { ...input, groupId: other.id }),
    ).rejects.toThrow("not available");
    expect(read).not.toHaveBeenCalled();
    const preview = await prepareLegacyContractAcceptance(deps, f.userId, input);
    canceled = false;
    await expect(
      confirmLegacyContractAcceptance(deps, f.userId, { ...input, revision: preview.revision }),
    ).rejects.toThrow("updated contract preview");
    canceled = true;
    const finalPreview = await prepareLegacyContractAcceptance(deps, f.userId, input);
    const receipt = await confirmLegacyContractAcceptance(deps, f.userId, {
      ...input,
      revision: finalPreview.revision,
    });
    expect(receipt).toMatchObject({
      groupId: f.group.id,
      payerUserId: f.userId,
      subscriptionId: f.sub.id,
    });
  });
  it("binds only explicitly accepted, paid periods to the payer's family", async () => {
    const f = await fixture();
    await db.insert(schema.familyMigrationSources).values({
      app: "cozya",
      sourceOwnerId: f.userId,
      groupId: f.group.id,
    });
    await persistPaymentPeriods(db, f.sub.id, f.snapshot);
    await db.insert(schema.legacyContractObservations).values({
      subscriptionId: f.sub.id,
      status: f.snapshot.status,
      providerPriceId: f.snapshot.priceId,
      periodStart: f.snapshot.start,
      periodEnd: f.snapshot.end,
      cancelAtPeriodEnd: false,
      observedAt: f.snapshot.observedAt,
    });
    const input = { groupId: f.group.id, subscriptionId: f.sub.id };
    const initial = await previewLegacyContractAcceptance(db, f.userId, input);
    const [pending] = await db
      .insert(schema.webhookEvents)
      .values({
        provider: "stripe",
        providerEventId: `evt_${randomUUID()}`,
        app: "cozya",
        providerCustomerId: f.snapshot.customerId,
        eventType: "charge.refunded",
        payload: {},
      })
      .returning();
    if (!pending) throw new Error("Missing financial event fixture");
    await expect(previewLegacyContractAcceptance(db, f.userId, input)).rejects.toThrow(
      "financial event requires reconciliation",
    );
    await db
      .update(schema.webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(schema.webhookEvents.id, pending.id));
    await db
      .update(schema.legacyContractObservations)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    await expect(
      acceptLegacyContract(db, f.userId, { ...input, revision: initial.revision }),
    ).rejects.toThrow("updated contract preview");
    const preview = await previewLegacyContractAcceptance(db, f.userId, input);
    const refreshedAt = new Date(Math.max(Date.now(), f.snapshot.observedAt.getTime() + 1));
    await persistPaymentPeriods(db, f.sub.id, { ...f.snapshot, observedAt: refreshedAt });
    await db
      .update(schema.legacyContractObservations)
      .set({ observedAt: refreshedAt })
      .where(eq(schema.legacyContractObservations.subscriptionId, f.sub.id));
    expect((await previewLegacyContractAcceptance(db, f.userId, input)).revision).toBe(
      preview.revision,
    );
    const accepted = await acceptLegacyContract(db, f.userId, {
      ...input,
      revision: preview.revision,
    });
    expect(
      (await acceptLegacyContract(db, f.userId, { ...input, revision: preview.revision })).id,
    ).toBe(accepted.id);
    const periods = await db
      .select()
      .from(schema.legacyContractAcceptancePeriods)
      .where(eq(schema.legacyContractAcceptancePeriods.acceptanceId, accepted.id));
    expect(periods.map((period) => period.paymentPeriodId)).toEqual(
      preview.periods.map((period) => period.id),
    );
    const other = await createFamilyService({ db }).createGroup(f.userId, "Other family");
    await expect(
      previewLegacyContractAcceptance(db, f.userId, { ...input, groupId: other.id }),
    ).rejects.toThrow("not available");
    const acceptedPeriod = periods[0];
    if (!acceptedPeriod) throw new Error("Missing accepted period");
    await db
      .update(schema.subscriptionPaymentPeriods)
      .set({ disputed: true })
      .where(eq(schema.subscriptionPaymentPeriods.id, acceptedPeriod.paymentPeriodId));
    await expect(previewLegacyContractAcceptance(db, f.userId, input)).rejects.toThrow(
      "requires reconciliation",
    );
    expect(
      (await acceptLegacyContract(db, f.userId, { ...input, revision: preview.revision })).id,
    ).toBe(accepted.id);
  });
  it("reconciles a Compasso app without an AI wallet while rejecting unrelated products", async () => {
    const f = await fixture();
    const [customer] = await db
      .insert(schema.customers)
      .values({
        provider: "stripe",
        providerCustomerId: `cus_${randomUUID()}`,
        subjectType: "user",
        subjectId: f.userId,
        email: `${f.userId}@example.test`,
        app: "bora-treinar",
      })
      .returning();
    if (!customer) throw new Error("Missing Bora customer");
    const [sub] = await db
      .insert(schema.subscriptions)
      .values({
        customerId: customer.id,
        provider: "stripe",
        providerSubscriptionId: `sub_${randomUUID()}`,
        providerPriceId: "price_bora_fixture",
        productId: "bora_fixture",
        status: "active",
        currentPeriodStart: f.snapshot.start,
        currentPeriodEnd: f.snapshot.end,
      })
      .returning();
    if (!sub) throw new Error("Missing Bora subscription");
    const product = PRODUCTS.find(
      (entry) => entry.app === "bora-treinar" && entry.kind === "subscription",
    );
    if (!product) throw new Error("Missing Bora catalog");
    const snapshot = {
      ...f.snapshot,
      customerId: customer.providerCustomerId,
      subscriptionId: sub.providerSubscriptionId,
      priceId: sub.providerPriceId,
      periods: f.snapshot.periods.map((period) => ({ ...period, priceId: sub.providerPriceId })),
    };
    const read = vi.fn(async () => snapshot);
    const deps = {
      db,
      app: "bora-treinar",
      products: [{ ...product, stripePriceId: { dev: sub.providerPriceId, prod: "" } }],
      providerClient: { readSubscriptionPaymentFacts: read },
    };
    await expect(
      refreshCompassoLegacySubscriptionFunding(deps, sub.providerSubscriptionId),
    ).resolves.toBe(true);
    const [period] = await db
      .select()
      .from(schema.subscriptionPaymentPeriods)
      .where(eq(schema.subscriptionPaymentPeriods.subscriptionId, sub.id));
    expect(period).toMatchObject({
      periodEnd: snapshot.end,
      disputed: false,
      fullyRefunded: false,
    });
    const newer = {
      ...snapshot,
      cancelAtPeriodEnd: true,
      observedAt: new Date(snapshot.observedAt.getTime() + 1000),
    };
    read.mockResolvedValueOnce(newer);
    await refreshCompassoLegacySubscriptionFunding(deps, sub.providerSubscriptionId);
    read.mockResolvedValueOnce(snapshot);
    await refreshCompassoLegacySubscriptionFunding(deps, sub.providerSubscriptionId);
    const [observation] = await db
      .select()
      .from(schema.legacyContractObservations)
      .where(eq(schema.legacyContractObservations.subscriptionId, sub.id));
    expect(observation).toMatchObject({ cancelAtPeriodEnd: true, observedAt: newer.observedAt });
    read.mockResolvedValueOnce({ ...newer, cancelAtPeriodEnd: false });
    await expect(
      refreshCompassoLegacySubscriptionFunding(deps, sub.providerSubscriptionId),
    ).rejects.toThrow("Conflicting legacy subscription observation");
    read.mockResolvedValueOnce({ ...snapshot, customerId: `cus_${randomUUID()}` });
    await expect(
      refreshCompassoLegacySubscriptionFunding(deps, sub.providerSubscriptionId),
    ).rejects.toThrow("does not belong");
    read.mockResolvedValueOnce({ ...snapshot, priceId: "price_unrelated" });
    await expect(
      refreshCompassoLegacySubscriptionFunding(deps, sub.providerSubscriptionId),
    ).rejects.toThrow("explicit reconciliation");
    await expect(
      refreshCompassoLegacySubscriptionFunding({ ...deps, app: "edi" }, sub.providerSubscriptionId),
    ).rejects.toThrow("outside Compasso");
    expect(read).toHaveBeenCalledTimes(6);
  });
  it("resolves a dispute customer before accepting it, blocks shared spending during an outage and retries the original receipt", async () => {
    const f = await fixture();
    await f.grant({ invoiceId: f.invoiceId });
    await persistPaymentPeriods(db, f.sub.id, f.snapshot);
    await f.migrate();
    let release = () => {};
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reading = false;
    let fail = true;
    const providerClient = {
      ...createFakeProvider().provider,
      readEventCustomerId: async () => f.snapshot.customerId,
      readSubscriptionPaymentFacts: async () => {
        reading = true;
        await waiting;
        if (fail) {
          fail = false;
          throw new Error("Provider unavailable");
        }
        return { ...f.observation(1000, { disputed: true }), observedAt: new Date() };
      },
    };
    const deps = {
      db,
      app: "cozya",
      provider: "stripe" as const,
      webhookScope: "Cozya",
      providerClient,
      products: PRODUCTS.filter(
        (product) => product.app === "cozya" && product.kind === "subscription",
      ).map((product) => ({ ...product, stripePriceId: { dev: f.snapshot.priceId, prod: "" } })),
    };
    const id = `evt_${randomUUID()}`;
    const payload = {
      id,
      data: { object: { id: `dp_${randomUUID()}`, charge: `ch_${randomUUID()}` } },
    };
    // Historical receipts used the display name as their namespace and had no
    // explicit app/customer columns. They must block spending before recovery.
    await db.insert(schema.webhookEvents).values({
      provider: "stripe",
      providerEventId: `Cozya:${id}`,
      eventType: "charge.dispute.created",
      payload,
    });
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(true);
    const processing = handleStripeEvent(deps, { id, type: "charge.dispute.created", payload });
    try {
      await vi.waitFor(() => expect(reading).toBe(true));
      expect(await hasPendingCompassoReview(db, f.group.id)).toBe(true);
      await expect(
        consumeCredits(
          { db, walletScope: "compasso", authorizeSpend: authorizeCompassoSpend },
          {
            owner: { type: "family", id: f.group.id },
            actorUserId: f.userId,
            app: "cozya",
            feature: "test",
            amount: 1,
          },
        ),
      ).rejects.toThrow();
    } finally {
      release();
      await expect(processing).rejects.toThrow("Legacy customer funding is incomplete");
    }
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(true);
    await retryLegacyFinancialEvents(deps);
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(false);
    expect(await f.balance()).toBe(0);
    const [receipt] = await db
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.providerEventId, `Cozya:${id}`));
    expect(receipt?.payload).toEqual(payload);
    expect(receipt?.providerCustomerId).toBe(f.snapshot.customerId);
    expect(receipt?.attempts).toBe(2);
  });

  it("keeps a late grant unavailable until its invoice funding is reconciled", async () => {
    const f = await fixture();
    await f.grant({ invoiceId: f.invoiceId });
    await persistPaymentPeriods(db, f.sub.id, f.snapshot);
    await f.migrate();
    await f.grant({ invoiceId: f.invoiceId });
    await forwardPendingLegacyCreditEntries(db, "cozya");
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(true);
    await persistPaymentPeriods(db, f.sub.id, f.observation(1, { disputed: true }));
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(false);
    expect(await f.balance()).toBe(0);
  });
  it("links an invoice grant without rewriting its expiry or amount, then freezes and restores only its migrated remainder", async () => {
    const f = await fixture();
    const grant = await f.grant({ invoiceId: f.invoiceId });
    await db.insert(schema.creditLedger).values({
      ownerType: "user",
      ownerId: f.userId,
      app: "cozya",
      entryType: "promo_grant",
      amount: 3,
    });
    await consumeCredits(
      { db },
      { owner: f.owner, app: "cozya", feature: "legacy", amount: 2, runId: randomUUID() },
    );
    await expect(f.migrate()).rejects.toThrow("pending financial events");
    await persistPaymentPeriods(db, f.sub.id, f.snapshot);
    const [bound] = await db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.id, grant.id));
    expect(bound?.fundingPeriodId).toBeTruthy();
    expect(bound?.amount).toBe(10);
    expect(bound?.expiresAt).toEqual(grant.expiresAt);
    await f.migrate();
    expect(await f.balance()).toBe(165);
    await persistPaymentPeriods(db, f.sub.id, f.observation(10, { disputed: true }));
    expect(await f.balance()).toBe(45);
    await persistPaymentPeriods(db, f.sub.id, f.observation(20, { disputed: false }));
    expect(await f.balance()).toBe(165);
    // An older adverse observation cannot undo a newer resolution.
    await persistPaymentPeriods(db, f.sub.id, f.observation(15, { disputed: true }));
    expect(await f.balance()).toBe(165);
  });

  it("uses the historical annual anchor and never assigns a drip to an unrelated invoice", async () => {
    const f = await fixture();
    const anchor = new Date(f.snapshot.start.getTime() + 30 * 86_400_000).toISOString();
    const grant = await f.grant({
      subscriptionId: f.sub.id,
      providerSubscriptionId: f.sub.providerSubscriptionId,
      grantKind: "annual_drip",
      anchor,
    });
    await persistPaymentPeriods(db, f.sub.id, f.snapshot);
    const [bound] = await db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.id, grant.id));
    expect(bound?.fundingPeriodId).toBeTruthy();
    await f.migrate();
    expect(await f.balance()).toBe(150);
    await persistPaymentPeriods(db, f.sub.id, f.observation(10, { fullyRefunded: true }));
    expect(await f.balance()).toBe(0);
  });

  it("rolls back ambiguous invoice lines instead of choosing the first match", async () => {
    const f = await fixture();
    const grant = await f.grant({ invoiceId: f.invoiceId });
    const first = f.snapshot.periods[0];
    if (!first) throw new Error("Missing fixture period");
    await expect(
      persistPaymentPeriods(db, f.sub.id, {
        ...f.snapshot,
        periods: [first, { ...first, lineId: `il_${randomUUID()}` }],
      }),
    ).rejects.toThrow("ambiguous invoice funding");
    const [unchanged] = await db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.id, grant.id));
    expect(unchanged?.fundingPeriodId).toBeNull();
    await expect(f.migrate()).rejects.toThrow("pending financial events");
    expect(
      await db
        .select()
        .from(schema.subscriptionPaymentPeriods)
        .where(eq(schema.subscriptionPaymentPeriods.subscriptionId, f.sub.id)),
    ).toEqual([]);
  });
});
