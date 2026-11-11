import { randomUUID } from "node:crypto";
import { PRODUCTS } from "@informach/config";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import { openCompassoAccount } from "./collection-accounts";
import { getCompassoAccess } from "./compasso";
import {
  acceptLegacyContract,
  confirmRecentLegacyContractAcceptance,
  prepareLegacyContractAcceptance,
  reconcileLegacyCancellation,
} from "./legacy-contract-acceptance";
import {
  acceptLegacyCoordination,
  declineLegacyCoordination,
  previewLegacyCoordination,
  settleLegacyCoordinationLocked,
} from "./legacy-coordination";
import { runLegacyCoordinationRecovery } from "./legacy-coordination-jobs";
import { readLegacyFutureTerms } from "./legacy-future-terms";
import type { SubscriptionPaymentSnapshot } from "./payment-facts";
import { LegacyDeferralChargeError } from "./providers/stripe-legacy-deferral";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Legacy coordination requires an isolated database");
const connection = postgres(url, { max: 8, prepare: false });
const db: Database = drizzle(connection, { schema });
afterAll(async () => {
  await connection.end();
});

const DAY = 86_400_000;
const COMPASSO_PRICE = "price_compasso_fixture";
const legacyProduct = PRODUCTS.find(
  (entry) => entry.app === "cozya" && entry.kind === "subscription",
);
const compassoMonthly = PRODUCTS.find((entry) => entry.id === "compasso_monthly");
if (!legacyProduct || !compassoMonthly) throw new Error("Missing catalog fixtures");
const products = [
  { ...legacyProduct, stripePriceId: { dev: "price_legacy", prod: "" } },
  { ...compassoMonthly, stripePriceId: { dev: COMPASSO_PRICE, prod: "" } },
];
const ceilSecond = (date: Date) => new Date(Math.ceil(date.getTime() / 1000) * 1000);
type ScheduleMove = {
  id: string;
  status: "not_started" | "active" | "completed" | "released" | "canceled";
  moved: boolean;
};

/** One adult with a historical Cozya contract paid until `days` from now. */
async function adult(days: number) {
  const userId = `coordination-${randomUUID()}`;
  const email = `${userId}@example.test`;
  await db.insert(schema.users).values({ id: userId, name: "Adult", email, emailVerified: true });
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
  const end = new Date(Date.now() + days * DAY);
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
  const lineId = `il_${randomUUID()}`;
  const state = { canceled: false, fullyRefunded: false, disputed: false, offline: false };
  let observedAt = Date.now() - 1000;
  const read = async (): Promise<SubscriptionPaymentSnapshot> => {
    if (state.offline) throw new Error("Provider unavailable");
    return {
      customerId: customer.providerCustomerId,
      subscriptionId: sub.providerSubscriptionId,
      priceId: sub.providerPriceId,
      status: "active",
      start,
      end,
      trialEnd: null,
      canceledAt: null,
      cancelAtPeriodEnd: state.canceled,
      observedAt: new Date(++observedAt),
      periods: [
        {
          invoiceId,
          lineId,
          priceId: sub.providerPriceId,
          start,
          end,
          paidAt: start,
          fullyRefunded: state.fullyRefunded,
          disputed: state.disputed,
        },
      ],
    };
  };
  const sessionId = `session-${randomUUID()}`;
  await db.insert(schema.sessions).values({
    id: sessionId,
    userId,
    token: `token-${randomUUID()}`,
    originApp: "conta",
    expiresAt: new Date(Date.now() + 3600_000),
  });
  return { userId, email, sub, start, end, state, read, sessionId };
}
type Adult = Awaited<ReturnType<typeof adult>>;

/** A family with a payer and a second adult, both with provenance. */
async function family(payerDays: number, contributorDays: number) {
  const payer = await adult(payerDays);
  const contributor = await adult(contributorDays);
  const service = createFamilyService({ db });
  const group = await service.createGroup(payer.userId, "Coordination");
  const invitation = await service.createInvitation(payer.userId, group.id, contributor.email);
  await service.acceptInvitation(contributor.userId, invitation.token);
  await db.insert(schema.familyMigrationSources).values([
    { app: "cozya", sourceOwnerId: payer.userId, groupId: group.id },
    { app: "cozya", sourceOwnerId: contributor.userId, groupId: group.id },
  ]);
  const adults = [payer, contributor];
  const providerClient = {
    readSubscriptionPaymentFacts: async (providerSubscriptionId: string) => {
      const owner = adults.find(
        (item) => item.sub.providerSubscriptionId === providerSubscriptionId,
      );
      if (!owner) throw new Error("Unexpected contract");
      return owner.read();
    },
    cancelSubscription: async ({ providerSubscriptionId }: { providerSubscriptionId: string }) => {
      const owner = adults.find(
        (item) => item.sub.providerSubscriptionId === providerSubscriptionId,
      );
      if (!owner) throw new Error("Unexpected contract");
      owner.state.canceled = true;
      return {
        id: providerSubscriptionId,
        status: "active" as const,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: owner.end,
      };
    },
  };
  const deps = { db, products, providerClient };
  const provider = {
    deferred: false,
    defer: vi.fn(async (input: { deferUntil: number }) => {
      provider.deferred = true;
      return { status: "deferred" as const, until: input.deferUntil };
    }),
    classify: vi.fn(async () =>
      provider.deferred ? ("deferred" as const) : ("not_deferred" as const),
    ),
    moveScheduleStart: vi.fn(
      async (_input: unknown, move: { scheduleId: string }): Promise<ScheduleMove> => ({
        id: move.scheduleId,
        status: "not_started",
        moved: true,
      }),
    ),
  };
  const coordination = {
    ...deps,
    mode: "dev" as const,
    deferralProvider: { defer: provider.defer, classify: provider.classify },
    futureProvider: { moveScheduleStart: provider.moveScheduleStart },
  };
  /** The adult accepts their own contract and its old renewal is ended. */
  async function contribute(person: Adult, mode: "none" | "payer_decides") {
    const input = { groupId: group.id, subscriptionId: person.sub.id };
    const preview = await prepareLegacyContractAcceptance(deps, person.userId, input);
    expect(preview.coordination).toBe(mode);
    const receipt = await confirmRecentLegacyContractAcceptance(
      deps,
      person.userId,
      person.sessionId,
      { ...input, revision: preview.revision, coordination: mode },
    );
    await reconcileLegacyCancellation(deps, person.userId, receipt.id);
    return receipt;
  }
  return { payer, contributor, group, deps, coordination, provider, contribute };
}

/** The payer already pays Compasso: a native subscription renewing in `days`. */
async function nativeSubscription(groupId: string, payer: Adult, days: number, status = "active") {
  const account = await openCompassoAccount(db, payer.userId, groupId);
  const [customer] = await db
    .insert(schema.customers)
    .values({
      app: "compasso",
      provider: "stripe",
      providerCustomerId: `cus_${randomUUID()}`,
      subjectType: "billing_account",
      subjectId: account.id,
      email: payer.email,
    })
    .returning();
  if (!customer) throw new Error("Missing family customer");
  const start = new Date(Date.now() - 60_000);
  const end = new Date(Math.floor((Date.now() + days * DAY) / 1000) * 1000);
  const [subscription] = await db
    .insert(schema.subscriptions)
    .values({
      customerId: customer.id,
      provider: "stripe",
      providerSubscriptionId: `sub_${randomUUID()}`,
      productId: "compasso_monthly",
      providerPriceId: COMPASSO_PRICE,
      status: status as "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
    })
    .returning();
  if (!subscription) throw new Error("Missing native subscription");
  await db.insert(schema.subscriptionPaymentPeriods).values({
    subscriptionId: subscription.id,
    provider: "stripe",
    providerInvoiceId: `in_${randomUUID()}`,
    providerLineId: `il_${randomUUID()}`,
    providerPriceId: COMPASSO_PRICE,
    periodStart: start,
    periodEnd: end,
    paidAt: start,
  });
  return { account, customer, subscription, end };
}

const coordinationOf = async (accountId: string) =>
  db
    .select()
    .from(schema.legacyBillingCoordinations)
    .where(eq(schema.legacyBillingCoordinations.accountId, accountId))
    .orderBy(schema.legacyBillingCoordinations.createdAt);
const consentsOf = async (coordinationId: string) =>
  db
    .select()
    .from(schema.legacyBillingConsents)
    .where(eq(schema.legacyBillingConsents.coordinationId, coordinationId));
const age = (id: string) =>
  db
    .update(schema.legacyBillingCoordinations)
    .set({ updatedAt: new Date(Date.now() - 10 * 60_000) })
    .where(eq(schema.legacyBillingCoordinations.id, id));

describe("Two payers: historical contract brought to a family that already pays", () => {
  it("lets both adults accept directly while the payer has no commitment yet", async () => {
    const f = await family(20, 50);
    // The payer opening the commercial account used to lock the other adult out.
    const account = await openCompassoAccount(db, f.payer.userId, f.group.id);
    await f.contribute(f.contributor, "none");
    await f.contribute(f.payer, "none");
    expect(await coordinationOf(account.id)).toEqual([]);
    const terms = await db.transaction((tx) =>
      readLegacyFutureTerms(tx, f.payer.userId, account.id),
    );
    // Periods are never added up: the family's first charge follows the latest.
    expect(terms.paidThrough).toEqual(f.contributor.end);
    expect(await getCompassoAccess(db, f.contributor.userId, f.group.id)).toMatchObject({
      active: true,
      source: "legacy",
    });
  });

  it("defers the payer's next charge only with each adult's own acceptance", async () => {
    const f = await family(20, 40);
    const native = await nativeSubscription(f.group.id, f.payer, 10);
    const input = { groupId: f.group.id, subscriptionId: f.contributor.sub.id };
    const preview = await prepareLegacyContractAcceptance(f.deps, f.contributor.userId, input);
    expect(preview.coordination).toBe("payer_decides");
    // Not having seen the coordination terms is not consent to them.
    await expect(
      acceptLegacyContract(db, f.contributor.userId, { ...input, revision: preview.revision }),
    ).rejects.toThrow("Review the updated contract preview");
    const receipt = await confirmRecentLegacyContractAcceptance(
      f.deps,
      f.contributor.userId,
      f.contributor.sessionId,
      { ...input, revision: preview.revision, coordination: "payer_decides" },
    );
    const [open] = await coordinationOf(native.account.id);
    expect(open).toMatchObject({
      state: "open",
      payerUserId: f.payer.userId,
      contributorUserId: f.contributor.userId,
      kind: null,
    });
    if (!open) throw new Error("Missing coordination");
    expect(await consentsOf(open.id)).toMatchObject([
      { role: "contributor", decision: "accepted", userId: f.contributor.userId },
    ]);
    // The contributed date is only final once the old renewal has ended.
    await expect(
      previewLegacyCoordination(f.coordination, f.payer.userId, { accountId: native.account.id }),
    ).rejects.toThrow("still being ended");
    await reconcileLegacyCancellation(f.deps, f.contributor.userId, receipt.id);
    const offer = await previewLegacyCoordination(f.coordination, f.payer.userId, {
      accountId: native.account.id,
    });
    expect(offer).toMatchObject({
      state: "open",
      effect: "defer",
      kind: "subscription_trial",
      amountCents: 4990,
      interval: "month",
      fromChargeAt: native.end,
      deferUntil: ceilSecond(f.contributor.end),
    });
    // The payer sees their own plan and dates, never the other adult's contract.
    expect(JSON.stringify(offer)).not.toContain(f.contributor.sub.id);
    expect(JSON.stringify(offer)).not.toContain("cozya");
    if (!offer?.revision) throw new Error("Missing offer revision");
    const decision = { accountId: native.account.id, revision: offer.revision };
    // Nobody accepts on behalf of the payer.
    await expect(
      previewLegacyCoordination(f.coordination, f.contributor.userId, {
        accountId: native.account.id,
      }),
    ).rejects.toThrow("unavailable to this payer");
    await expect(
      acceptLegacyCoordination(f.coordination, f.contributor.userId, f.contributor.sessionId, {
        ...decision,
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("unavailable to this payer");
    await expect(
      acceptLegacyCoordination(f.coordination, f.payer.userId, f.payer.sessionId, {
        ...decision,
        revision: "0".repeat(64),
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("Review the updated coordination preview");
    await db
      .update(schema.sessions)
      .set({ createdAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(schema.sessions.id, f.payer.sessionId));
    await expect(
      acceptLegacyCoordination(f.coordination, f.payer.userId, f.payer.sessionId, {
        ...decision,
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("Recent central authentication");
    expect(f.provider.defer).not.toHaveBeenCalled();
    await db
      .update(schema.sessions)
      .set({ createdAt: new Date() })
      .where(eq(schema.sessions.id, f.payer.sessionId));
    const requestKey = randomUUID();
    const accepted = await acceptLegacyCoordination(
      f.coordination,
      f.payer.userId,
      f.payer.sessionId,
      { ...decision, requestKey },
    );
    expect(accepted).toMatchObject({ coordinationId: open.id, state: "applied", pending: false });
    expect(f.provider.defer).toHaveBeenCalledOnce();
    expect(f.provider.defer.mock.calls[0]?.[0]).toMatchObject({
      intentId: open.id,
      subscriptionId: native.subscription.providerSubscriptionId,
      priceId: COMPASSO_PRICE,
      amountCents: 4990,
      expectedPeriodEnd: native.end.getTime() / 1000,
      deferUntil: ceilSecond(f.contributor.end).getTime() / 1000,
    });
    // A repeated request is the same decision, not a second provider change.
    expect(
      await acceptLegacyCoordination(f.coordination, f.payer.userId, f.payer.sessionId, {
        ...decision,
        requestKey,
      }),
    ).toMatchObject({ coordinationId: open.id, state: "applied" });
    expect(f.provider.defer).toHaveBeenCalledOnce();
    const consents = await consentsOf(open.id);
    expect(consents.filter((item) => item.role === "payer")).toMatchObject([
      { decision: "accepted", userId: f.payer.userId, termsRevision: offer.revision },
    ]);
    const [applied] = await coordinationOf(native.account.id);
    expect(applied?.effectAttemptedAt).not.toBeNull();
    expect(applied?.effectConfirmedAt).not.toBeNull();
    // A further contract waits while this coordination is in force.
    expect(
      (
        await prepareLegacyContractAcceptance(f.deps, f.payer.userId, {
          groupId: f.group.id,
          subscriptionId: f.payer.sub.id,
        })
      ).coordination,
    ).toBe("wait");
  });

  it("leaves the payer's billing untouched when the contributed period ends first", async () => {
    const f = await family(20, 5);
    const native = await nativeSubscription(f.group.id, f.payer, 10);
    await f.contribute(f.contributor, "payer_decides");
    expect(
      await previewLegacyCoordination(f.coordination, f.payer.userId, {
        accountId: native.account.id,
      }),
    ).toMatchObject({ effect: "none" });
    const [open] = await coordinationOf(native.account.id);
    if (!open) throw new Error("Missing coordination");
    await age(open.id);
    const onError = vi.fn();
    // `failed` also counts coordinations held for review anywhere in the
    // database, so the assertion is on this run's own errors.
    await runLegacyCoordinationRecovery({ ...f.coordination, onError });
    expect(onError).not.toHaveBeenCalled();
    expect(await coordinationOf(native.account.id)).toMatchObject([
      { state: "no_effect", reason: "covered" },
    ]);
    expect(f.provider.defer).not.toHaveBeenCalled();
    // The contributor's own period still counts for the family.
    expect((await getCompassoAccess(db, f.contributor.userId, f.group.id)).active).toBe(true);
  });

  it("keeps the current charge date when the payer declines", async () => {
    const f = await family(20, 40);
    const native = await nativeSubscription(f.group.id, f.payer, 10);
    await f.contribute(f.contributor, "payer_decides");
    const offer = await previewLegacyCoordination(f.coordination, f.payer.userId, {
      accountId: native.account.id,
    });
    if (!offer?.revision) throw new Error("Missing offer revision");
    const requestKey = randomUUID();
    const declined = await declineLegacyCoordination(
      f.coordination,
      f.payer.userId,
      f.payer.sessionId,
      {
        accountId: native.account.id,
        revision: offer.revision,
        requestKey,
      },
    );
    expect(declined.state).toBe("declined");
    expect(
      await declineLegacyCoordination(f.coordination, f.payer.userId, f.payer.sessionId, {
        accountId: native.account.id,
        revision: offer.revision,
        requestKey,
      }),
    ).toMatchObject({ coordinationId: declined.coordinationId, state: "declined" });
    expect(f.provider.defer).not.toHaveBeenCalled();
    expect(
      await previewLegacyCoordination(f.coordination, f.payer.userId, {
        accountId: native.account.id,
      }),
    ).toBeNull();
  });

  it("recovers a lost provider response without a second change", async () => {
    const f = await family(20, 40);
    const native = await nativeSubscription(f.group.id, f.payer, 10);
    await f.contribute(f.contributor, "payer_decides");
    const offer = await previewLegacyCoordination(f.coordination, f.payer.userId, {
      accountId: native.account.id,
    });
    if (!offer?.revision) throw new Error("Missing offer revision");
    f.provider.defer.mockImplementationOnce(async () => {
      f.provider.deferred = true;
      throw new Error("lost response");
    });
    expect(
      await acceptLegacyCoordination(f.coordination, f.payer.userId, f.payer.sessionId, {
        accountId: native.account.id,
        revision: offer.revision,
        requestKey: randomUUID(),
      }),
    ).toMatchObject({ state: "applied" });
    expect(f.provider.defer).toHaveBeenCalledOnce();
  });

  it("resumes an accepted coordination from the job when the provider was unreachable", async () => {
    const f = await family(20, 40);
    const native = await nativeSubscription(f.group.id, f.payer, 10);
    await f.contribute(f.contributor, "payer_decides");
    const offer = await previewLegacyCoordination(f.coordination, f.payer.userId, {
      accountId: native.account.id,
    });
    if (!offer?.revision) throw new Error("Missing offer revision");
    f.provider.defer.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(
      acceptLegacyCoordination(f.coordination, f.payer.userId, f.payer.sessionId, {
        accountId: native.account.id,
        revision: offer.revision,
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("provider unavailable");
    const [interrupted] = await coordinationOf(native.account.id);
    // The acceptance and the attempt are durable although the request failed.
    expect(interrupted).toMatchObject({ state: "applying" });
    expect(interrupted?.effectAttemptedAt).not.toBeNull();
    if (!interrupted) throw new Error("Missing coordination");
    const onError = vi.fn();
    // A fresh attempt is not retried by a concurrent job run.
    await runLegacyCoordinationRecovery({ ...f.coordination, onError });
    expect(await coordinationOf(native.account.id)).toMatchObject([{ state: "applying" }]);
    expect(f.provider.defer).toHaveBeenCalledOnce();
    await age(interrupted.id);
    const resumed = await runLegacyCoordinationRecovery({ ...f.coordination, onError });
    // `failed` also counts coordinations held for review anywhere in the
    // database; this run itself must not have failed.
    expect(resumed.failed - resumed.review).toBe(0);
    expect(await coordinationOf(native.account.id)).toMatchObject([{ state: "applied" }]);
    expect(f.provider.defer).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it("holds for review a charge that appeared while the charge was being deferred", async () => {
    const f = await family(20, 40);
    const native = await nativeSubscription(f.group.id, f.payer, 10);
    await f.contribute(f.contributor, "payer_decides");
    const offer = await previewLegacyCoordination(f.coordination, f.payer.userId, {
      accountId: native.account.id,
    });
    if (!offer?.revision) throw new Error("Missing offer revision");
    f.provider.defer.mockImplementationOnce(async () => {
      f.provider.deferred = true;
      throw new LegacyDeferralChargeError("Deferred subscription has a charge");
    });
    expect(
      await acceptLegacyCoordination(f.coordination, f.payer.userId, f.payer.sessionId, {
        accountId: native.account.id,
        revision: offer.revision,
        requestKey: randomUUID(),
      }),
    ).toMatchObject({ state: "review", pending: true });
    expect(await coordinationOf(native.account.id)).toMatchObject([
      { state: "review", reason: "charge_during_deferral" },
    ]);
    // A held coordination is an operational failure until someone resolves it.
    expect(
      (await runLegacyCoordinationRecovery({ ...f.coordination, onError: vi.fn() })).review,
    ).toBeGreaterThanOrEqual(1);
  });

  it("asks the payer again when the contributed payment changes before any effect", async () => {
    const f = await family(20, 40);
    const native = await nativeSubscription(f.group.id, f.payer, 10);
    await f.contribute(f.contributor, "payer_decides");
    const offer = await previewLegacyCoordination(f.coordination, f.payer.userId, {
      accountId: native.account.id,
    });
    if (!offer?.revision) throw new Error("Missing offer revision");
    // The refund lands between the payer's acceptance and the provider call.
    const read = f.deps.providerClient.readSubscriptionPaymentFacts;
    let reads = 0;
    const coordination = {
      ...f.coordination,
      providerClient: {
        readSubscriptionPaymentFacts: async (id: string) => {
          if (++reads === 2) f.contributor.state.fullyRefunded = true;
          return read(id);
        },
      },
    };
    expect(
      await acceptLegacyCoordination(coordination, f.payer.userId, f.payer.sessionId, {
        accountId: native.account.id,
        revision: offer.revision,
        requestKey: randomUUID(),
      }),
    ).toMatchObject({ state: "invalidated" });
    expect(f.provider.defer).not.toHaveBeenCalled();
    const rows = await coordinationOf(native.account.id);
    expect(rows.map((row) => row.state).sort()).toEqual(["invalidated", "open"]);
    const reopened = rows.find((row) => row.state === "open");
    if (!reopened) throw new Error("Missing reopened coordination");
    expect(
      await db
        .select()
        .from(schema.legacyBillingCoordinationContracts)
        .where(eq(schema.legacyBillingCoordinationContracts.coordinationId, reopened.id)),
    ).toHaveLength(1);
  });

  it("settles only on a paid period after the deferred date and never inside it", async () => {
    const f = await family(20, 40);
    const native = await nativeSubscription(f.group.id, f.payer, 10);
    await f.contribute(f.contributor, "payer_decides");
    const offer = await previewLegacyCoordination(f.coordination, f.payer.userId, {
      accountId: native.account.id,
    });
    if (!offer?.revision) throw new Error("Missing offer revision");
    const accepted = await acceptLegacyCoordination(
      f.coordination,
      f.payer.userId,
      f.payer.sessionId,
      { accountId: native.account.id, revision: offer.revision, requestKey: randomUUID() },
    );
    expect(accepted.state).toBe("applied");
    // Not yet due: nothing is settled on the passage of time alone.
    expect(await settleLegacyCoordinationLocked({ db }, accepted.coordinationId)).toEqual({
      state: "applied",
    });
    // Move the accepted interval into the past, still after the period the
    // payer had already paid when the coordination was accepted.
    const from = new Date(Date.now() - 40_000);
    const until = new Date(Date.now() - 20_000);
    await db
      .update(schema.legacyBillingCoordinations)
      .set({ fromChargeAt: from, contributedPaidThrough: until, deferUntil: until })
      .where(eq(schema.legacyBillingCoordinations.id, accepted.coordinationId));
    expect(await settleLegacyCoordinationLocked({ db }, accepted.coordinationId)).toEqual({
      state: "applied",
    });
    const period = {
      subscriptionId: native.subscription.id,
      provider: "stripe" as const,
      providerPriceId: COMPASSO_PRICE,
    };
    await db.insert(schema.subscriptionPaymentPeriods).values({
      ...period,
      providerInvoiceId: `in_${randomUUID()}`,
      providerLineId: `il_${randomUUID()}`,
      periodStart: until,
      periodEnd: new Date(until.getTime() + 30 * DAY),
      paidAt: new Date(until.getTime() + 1000),
    });
    expect(await settleLegacyCoordinationLocked({ db }, accepted.coordinationId)).toEqual({
      state: "settled",
    });
    // Same history with a positive charge inside the deferred interval.
    const g = await family(20, 40);
    const other = await nativeSubscription(g.group.id, g.payer, 10);
    await g.contribute(g.contributor, "payer_decides");
    const second = await previewLegacyCoordination(g.coordination, g.payer.userId, {
      accountId: other.account.id,
    });
    if (!second?.revision) throw new Error("Missing offer revision");
    const applied = await acceptLegacyCoordination(
      g.coordination,
      g.payer.userId,
      g.payer.sessionId,
      {
        accountId: other.account.id,
        revision: second.revision,
        requestKey: randomUUID(),
      },
    );
    await db
      .update(schema.legacyBillingCoordinations)
      .set({ fromChargeAt: from, contributedPaidThrough: until, deferUntil: until })
      .where(eq(schema.legacyBillingCoordinations.id, applied.coordinationId));
    await db.insert(schema.subscriptionPaymentPeriods).values({
      subscriptionId: other.subscription.id,
      provider: "stripe",
      providerPriceId: COMPASSO_PRICE,
      providerInvoiceId: `in_${randomUUID()}`,
      providerLineId: `il_${randomUUID()}`,
      periodStart: new Date(from.getTime() + 5000),
      periodEnd: new Date(from.getTime() + 30 * DAY),
      paidAt: new Date(from.getTime() + 5000),
    });
    expect(await settleLegacyCoordinationLocked({ db }, applied.coordinationId)).toEqual({
      state: "review",
    });
  });

  it("serializes two simultaneous acceptances into one provider change", async () => {
    const f = await family(20, 40);
    const native = await nativeSubscription(f.group.id, f.payer, 10);
    await f.contribute(f.contributor, "payer_decides");
    const offer = await previewLegacyCoordination(f.coordination, f.payer.userId, {
      accountId: native.account.id,
    });
    if (!offer?.revision) throw new Error("Missing offer revision");
    const accept = () =>
      acceptLegacyCoordination(f.coordination, f.payer.userId, f.payer.sessionId, {
        accountId: native.account.id,
        revision: offer.revision as string,
        requestKey: randomUUID(),
      });
    const results = await Promise.all([accept(), accept()]);
    expect(results.map((result) => result.state)).toEqual(["applied", "applied"]);
    expect(f.provider.defer).toHaveBeenCalledOnce();
    const [row] = await coordinationOf(native.account.id);
    if (!row) throw new Error("Missing coordination");
    expect((await consentsOf(row.id)).filter((item) => item.role === "payer")).toHaveLength(1);
  });

  it("makes the contributor wait while the payer's billing is unsettled", async () => {
    const f = await family(20, 40);
    await nativeSubscription(f.group.id, f.payer, 10, "past_due");
    const input = { groupId: f.group.id, subscriptionId: f.contributor.sub.id };
    const preview = await prepareLegacyContractAcceptance(f.deps, f.contributor.userId, input);
    expect(preview.coordination).toBe("wait");
    await expect(
      acceptLegacyContract(db, f.contributor.userId, {
        ...input,
        revision: preview.revision,
        coordination: "wait",
      }),
    ).rejects.toThrow("Existing Compasso billing requires coordinated migration");
  });
});

describe("Two payers: the payer's first charge is still a future schedule", () => {
  async function scheduled() {
    const f = await family(20, 50);
    await f.contribute(f.payer, "none");
    const account = await openCompassoAccount(db, f.payer.userId, f.group.id);
    const [customer] = await db
      .insert(schema.customers)
      .values({
        app: "compasso",
        provider: "stripe",
        providerCustomerId: `cus_${randomUUID()}`,
        subjectType: "billing_account",
        subjectId: account.id,
        email: f.payer.email,
      })
      .returning();
    if (!customer) throw new Error("Missing family customer");
    const startsAt = ceilSecond(f.payer.end);
    const [intent] = await db
      .insert(schema.legacyFutureIntents)
      .values({
        accountId: account.id,
        payerUserId: f.payer.userId,
        requestKey: randomUUID(),
        productId: "compasso_monthly",
        providerPriceId: COMPASSO_PRICE,
        amountCents: 4990,
        interval: "month",
        paidThrough: f.payer.end,
        startsAt,
        termsRevision: "a".repeat(64),
        setupExpiresAt: new Date(Date.now() + 3600_000),
        state: "scheduled",
        setupSessionId: `cs_${randomUUID()}`,
        paymentMethodId: "pm_fixture",
        scheduleId: `sub_sched_${randomUUID()}`,
      })
      .returning();
    if (!intent) throw new Error("Missing future schedule");
    return { ...f, account, customer, intent, startsAt };
  }

  it("moves the accepted start in place to the later paid-through date", async () => {
    const f = await scheduled();
    await f.contribute(f.contributor, "payer_decides");
    const offer = await previewLegacyCoordination(f.coordination, f.payer.userId, {
      accountId: f.account.id,
    });
    expect(offer).toMatchObject({
      effect: "defer",
      kind: "schedule_start",
      fromChargeAt: f.startsAt,
      deferUntil: ceilSecond(f.contributor.end),
      amountCents: 4990,
    });
    if (!offer?.revision) throw new Error("Missing offer revision");
    const accepted = await acceptLegacyCoordination(
      f.coordination,
      f.payer.userId,
      f.payer.sessionId,
      { accountId: f.account.id, revision: offer.revision, requestKey: randomUUID() },
    );
    expect(accepted).toMatchObject({ state: "applied", pending: false });
    expect(f.provider.moveScheduleStart).toHaveBeenCalledOnce();
    expect(f.provider.moveScheduleStart.mock.calls[0]).toMatchObject([
      {
        intentId: f.intent.id,
        startsAt: f.startsAt.getTime() / 1000,
        priceId: COMPASSO_PRICE,
        amountCents: 4990,
      },
      {
        scheduleId: f.intent.scheduleId,
        coordinationId: accepted.coordinationId,
        newStartsAt: ceilSecond(f.contributor.end).getTime() / 1000,
      },
    ]);
    expect(f.provider.defer).not.toHaveBeenCalled();
    const [intent] = await db
      .select()
      .from(schema.legacyFutureIntents)
      .where(eq(schema.legacyFutureIntents.id, f.intent.id));
    // The local receipt now describes the schedule the provider holds.
    expect(intent).toMatchObject({
      state: "scheduled",
      scheduleId: f.intent.scheduleId,
      startsAt: ceilSecond(f.contributor.end),
      paidThrough: f.contributor.end,
    });
    expect(intent?.termsRevision).not.toBe(f.intent.termsRevision);
    expect(await settleLegacyCoordinationLocked({ db }, accepted.coordinationId)).toEqual({
      state: "applied",
    });
    await db
      .update(schema.legacyFutureIntents)
      .set({ state: "applied" })
      .where(eq(schema.legacyFutureIntents.id, f.intent.id));
    expect(await settleLegacyCoordinationLocked({ db }, accepted.coordinationId)).toEqual({
      state: "settled",
    });
  });

  it("does not undo a schedule that started before it could be moved", async () => {
    const f = await scheduled();
    await f.contribute(f.contributor, "payer_decides");
    const offer = await previewLegacyCoordination(f.coordination, f.payer.userId, {
      accountId: f.account.id,
    });
    if (!offer?.revision) throw new Error("Missing offer revision");
    f.provider.moveScheduleStart.mockResolvedValueOnce({
      id: f.intent.scheduleId as string,
      status: "active",
      moved: false,
    });
    expect(
      await acceptLegacyCoordination(f.coordination, f.payer.userId, f.payer.sessionId, {
        accountId: f.account.id,
        revision: offer.revision,
        requestKey: randomUUID(),
      }),
    ).toMatchObject({ state: "review", pending: true });
    const [intent] = await db
      .select()
      .from(schema.legacyFutureIntents)
      .where(eq(schema.legacyFutureIntents.id, f.intent.id));
    expect(intent?.startsAt).toEqual(f.startsAt);
    expect(
      await db
        .select({ reason: schema.legacyBillingCoordinations.reason })
        .from(schema.legacyBillingCoordinations)
        .where(
          and(
            eq(schema.legacyBillingCoordinations.accountId, f.account.id),
            sql`${schema.legacyBillingCoordinations.state} = 'review'`,
          ),
        ),
    ).toEqual([{ reason: "schedule_started_before_move" }]);
  });
});
