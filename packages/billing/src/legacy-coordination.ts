import { randomUUID } from "node:crypto";
import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { lockRecentCentralAuthentication } from "@informach/auth/web-sessions";
import type { Product, StripeMode } from "@informach/config";
import type { Database } from "@informach/db";
import {
  collectionAccounts,
  customers,
  familyEvents,
  legacyBillingConsents,
  legacyBillingCoordinationContracts,
  legacyBillingCoordinations,
  legacyContractAcceptances,
  legacyFutureIntents,
  subscriptionPaymentPeriods,
  subscriptions,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { assertAccountPayer } from "./collection-accounts";
import { hasPendingCompassoReview, requestCollectionReconciliation } from "./collection-jobs";
import { withActiveCompassoBillingLock } from "./credit-purchases";
import { refreshCompassoLegacySubscriptionFunding } from "./credits/legacy-subscriptions";
import { BillingError } from "./errors";
import { LEGACY_COORDINATION_POLICY_VERSION } from "./legacy-contract-policy";
import {
  ACTIVE_COORDINATION_STATES,
  type CoordinationOffer,
  readCoordinationOffer,
} from "./legacy-coordination-terms";
import { readLegacyFutureIntentTerms } from "./legacy-future-intent";
import type { createStripeFutureContractProvider } from "./providers/stripe-future-contract";
import {
  type createStripeLegacyDeferralProvider,
  LegacyDeferralChargeError,
} from "./providers/stripe-legacy-deferral";
import type { BillingProviderClient } from "./providers/types";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Coordination = typeof legacyBillingCoordinations.$inferSelect;
export type LegacyCoordinationDependencies = {
  db: Database;
  products: readonly Product[];
  mode: StripeMode;
  providerClient: Pick<BillingProviderClient, "readSubscriptionPaymentFacts">;
  deferralProvider: Pick<
    ReturnType<typeof createStripeLegacyDeferralProvider>,
    "defer" | "classify"
  >;
  futureProvider: Pick<ReturnType<typeof createStripeFutureContractProvider>, "moveScheduleStart">;
};
const POLICY = LEGACY_COORDINATION_POLICY_VERSION;
const accountSchema = z.object({ accountId: z.uuid() });
const decisionSchema = z.object({
  accountId: z.uuid(),
  revision: z.string().regex(/^[0-9a-f]{64}$/),
  requestKey: z.uuid(),
});

/** Attaches an accepted historical contract to the coordination the payer will
 * decide. Runs inside the contributor's acceptance transaction, which already
 * holds the family lock; nothing here changes the payer's billing. */
export async function attachLegacyCoordination(
  tx: Tx,
  input: {
    accountId: string;
    groupId: string;
    payerUserId: string;
    contributorUserId: string;
    acceptanceId: string;
    acceptedRevision: string;
    terms: Record<string, unknown>;
  },
) {
  const [existing] = await tx
    .select()
    .from(legacyBillingCoordinations)
    .where(
      and(
        eq(legacyBillingCoordinations.accountId, input.accountId),
        inArray(legacyBillingCoordinations.state, [...ACTIVE_COORDINATION_STATES]),
      ),
    )
    .for("update");
  if (
    existing &&
    (existing.state !== "open" || existing.contributorUserId !== input.contributorUserId)
  )
    throw new BillingError("Existing Compasso billing requires coordinated migration");
  const coordination =
    existing ??
    (
      await tx
        .insert(legacyBillingCoordinations)
        .values({
          accountId: input.accountId,
          groupId: input.groupId,
          payerUserId: input.payerUserId,
          contributorUserId: input.contributorUserId,
          policyVersion: POLICY,
        })
        .returning()
    )[0];
  if (!coordination) throw new BillingError("Billing coordination was not recorded");
  await tx
    .insert(legacyBillingCoordinationContracts)
    .values({ coordinationId: coordination.id, acceptanceId: input.acceptanceId })
    .onConflictDoNothing();
  await tx
    .insert(legacyBillingConsents)
    .values({
      userId: input.contributorUserId,
      role: "contributor",
      decision: "accepted",
      groupId: input.groupId,
      coordinationId: coordination.id,
      acceptanceId: input.acceptanceId,
      policyVersion: POLICY,
      termsRevision: input.acceptedRevision,
      terms: input.terms,
      requestKey: randomUUID(),
    })
    .onConflictDoNothing();
  await tx
    .update(legacyBillingCoordinations)
    .set({ updatedAt: new Date() })
    .where(eq(legacyBillingCoordinations.id, coordination.id));
  return coordination;
}

async function activeCoordination(tx: Tx, accountId: string) {
  const [row] = await tx
    .select()
    .from(legacyBillingCoordinations)
    .where(
      and(
        eq(legacyBillingCoordinations.accountId, accountId),
        inArray(legacyBillingCoordinations.state, [...ACTIVE_COORDINATION_STATES]),
      ),
    )
    .for("update");
  return row ?? null;
}

/** Provider reads of the contributed contracts, outside any transaction. */
async function refreshContributedContracts(
  deps: LegacyCoordinationDependencies,
  coordinationId: string,
) {
  const sources = await deps.db
    .select({ app: customers.app, providerSubscriptionId: subscriptions.providerSubscriptionId })
    .from(legacyBillingCoordinationContracts)
    .innerJoin(
      legacyContractAcceptances,
      eq(legacyContractAcceptances.id, legacyBillingCoordinationContracts.acceptanceId),
    )
    .innerJoin(subscriptions, eq(subscriptions.id, legacyContractAcceptances.subscriptionId))
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(eq(legacyBillingCoordinationContracts.coordinationId, coordinationId))
    .limit(100);
  for (const source of sources) {
    const refreshed = await refreshCompassoLegacySubscriptionFunding(
      {
        db: deps.db,
        products: deps.products,
        providerClient: deps.providerClient,
        app: source.app,
      },
      source.providerSubscriptionId,
    );
    if (!refreshed)
      throw new BillingError("Contributed contract is unavailable for reconciliation");
  }
}

function summary(row: Coordination, offer?: CoordinationOffer) {
  const live = offer?.effect === "defer" ? offer : null;
  return {
    coordinationId: row.id,
    state: row.state,
    kind: live?.kind ?? row.kind,
    amountCents: live?.amountCents ?? row.amountCents,
    interval: live?.interval ?? row.interval,
    fromChargeAt: live?.fromChargeAt ?? row.fromChargeAt,
    deferUntil: live?.deferUntil ?? row.deferUntil,
    revision: live?.revision ?? row.offerRevision,
    effect: offer?.effect ?? null,
  };
}

async function closeWithoutEffect(tx: Tx, row: Coordination, reason: "covered" | "expired") {
  const [closed] = await tx
    .update(legacyBillingCoordinations)
    .set({ state: reason === "covered" ? "no_effect" : "lapsed", reason, updatedAt: new Date() })
    .where(
      and(eq(legacyBillingCoordinations.id, row.id), eq(legacyBillingCoordinations.state, "open")),
    )
    .returning();
  if (!closed) throw new BillingError("Billing coordination changed");
  return closed;
}

/** What the payer is asked to approve: only the payer's own plan, amount and
 * dates. The contributor's app, price and contract are never returned. */
export async function previewLegacyCoordination(
  deps: LegacyCoordinationDependencies,
  actorId: string,
  raw: z.input<typeof accountSchema>,
) {
  const { accountId } = accountSchema.parse(raw);
  await assertAccountPayer(deps.db, actorId, accountId);
  const [observed] = await deps.db
    .select({ id: legacyBillingCoordinations.id, state: legacyBillingCoordinations.state })
    .from(legacyBillingCoordinations)
    .where(
      and(
        eq(legacyBillingCoordinations.accountId, accountId),
        eq(legacyBillingCoordinations.payerUserId, actorId),
        inArray(legacyBillingCoordinations.state, [...ACTIVE_COORDINATION_STATES]),
      ),
    );
  if (!observed) return null;
  if (observed.state === "open") await refreshContributedContracts(deps, observed.id);
  return deps.db.transaction(async (tx) => {
    const { account } = await assertAccountPayer(tx, actorId, accountId);
    if (account.closedAt || account.collection !== "compasso")
      throw new BillingError("Commercial account unavailable to this payer");
    await lockFamilyMembership(tx, actorId, account.groupId);
    const row = await activeCoordination(tx, accountId);
    if (!row || row.payerUserId !== actorId) return null;
    if (row.state !== "open") return summary(row);
    return summary(row, await readCoordinationOffer(tx, deps, row, new Date()));
  });
}

/** Records the payer's own acceptance of the exact previewed revision and
 * then applies it. The receipt is durable before any provider call; if the
 * provider cannot be reached now, the billing job resumes the same request. */
export async function acceptLegacyCoordination(
  deps: LegacyCoordinationDependencies,
  actorId: string,
  sessionId: string,
  raw: z.input<typeof decisionSchema>,
) {
  const input = decisionSchema.parse(raw);
  if (!sessionId) throw new BillingError("Recent central authentication is required");
  await assertAccountPayer(deps.db, actorId, input.accountId);
  return withActiveCompassoBillingLock(deps.db, actorId, input.accountId, async () => {
    const [observed] = await deps.db
      .select({ id: legacyBillingCoordinations.id, state: legacyBillingCoordinations.state })
      .from(legacyBillingCoordinations)
      .where(
        and(
          eq(legacyBillingCoordinations.accountId, input.accountId),
          eq(legacyBillingCoordinations.payerUserId, actorId),
          inArray(legacyBillingCoordinations.state, [...ACTIVE_COORDINATION_STATES]),
        ),
      );
    if (observed?.state === "open") await refreshContributedContracts(deps, observed.id);
    const accepted = await deps.db.transaction(async (tx) => {
      const { account } = await assertAccountPayer(tx, actorId, input.accountId);
      if (account.closedAt || account.collection !== "compasso")
        throw new BillingError("Commercial account unavailable to this payer");
      await lockFamilyMembership(tx, actorId, account.groupId);
      if (!(await lockRecentCentralAuthentication(tx, actorId, sessionId)))
        throw new BillingError("Recent central authentication is required");
      const [replay] = await tx
        .select()
        .from(legacyBillingConsents)
        .where(
          and(
            eq(legacyBillingConsents.userId, actorId),
            eq(legacyBillingConsents.requestKey, input.requestKey),
          ),
        );
      if (replay) {
        if (
          replay.role !== "payer" ||
          replay.decision !== "accepted" ||
          replay.termsRevision !== input.revision
        )
          throw new BillingError("Request key belongs to another billing decision");
        const [previous] = await tx
          .select()
          .from(legacyBillingCoordinations)
          .where(eq(legacyBillingCoordinations.id, replay.coordinationId));
        if (!previous || previous.accountId !== input.accountId)
          throw new BillingError("Request key belongs to another billing decision");
        return previous;
      }
      const row = await activeCoordination(tx, input.accountId);
      if (!row || row.payerUserId !== actorId)
        throw new BillingError("There is no billing coordination awaiting this payer");
      if (row.state !== "open") {
        if (row.offerRevision !== input.revision)
          throw new BillingError("Review the updated coordination preview");
        return row;
      }
      const offer = await readCoordinationOffer(tx, deps, row, new Date());
      if (offer.effect === "none") return closeWithoutEffect(tx, row, offer.reason);
      if (offer.revision !== input.revision)
        throw new BillingError("Review the updated coordination preview");
      await tx.insert(legacyBillingConsents).values({
        userId: actorId,
        role: "payer",
        decision: "accepted",
        groupId: row.groupId,
        coordinationId: row.id,
        policyVersion: POLICY,
        termsRevision: offer.revision,
        terms: {
          kind: offer.kind,
          amountCents: offer.amountCents,
          interval: offer.interval,
          fromChargeAt: offer.fromChargeAt.toISOString(),
          deferUntil: offer.deferUntil.toISOString(),
          refund: "none",
          planChange: "unavailable_until_deferred_charge",
        },
        requestKey: input.requestKey,
      });
      const [updated] = await tx
        .update(legacyBillingCoordinations)
        .set({
          state: "payer_accepted",
          kind: offer.kind,
          subscriptionId:
            offer.target.kind === "subscription_trial" ? offer.target.subscription.id : null,
          futureIntentId: offer.target.kind === "schedule_start" ? offer.target.intent.id : null,
          providerPriceId: offer.providerPriceId,
          amountCents: offer.amountCents,
          interval: offer.interval,
          fromChargeAt: offer.fromChargeAt,
          contributedPaidThrough: offer.contributedPaidThrough,
          deferUntil: offer.deferUntil,
          offerRevision: offer.revision,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(legacyBillingCoordinations.id, row.id),
            eq(legacyBillingCoordinations.state, "open"),
          ),
        )
        .returning();
      if (!updated) throw new BillingError("Billing coordination changed");
      await tx.insert(familyEvents).values({
        groupId: row.groupId,
        actorId,
        event: "billing.legacy_coordination_accepted",
        targetId: row.id,
      });
      return updated;
    });
    if (!["payer_accepted", "applying"].includes(accepted.state))
      return { coordinationId: accepted.id, state: accepted.state, pending: false };
    try {
      const applied = await applyLegacyCoordinationLocked(deps, accepted.id);
      return { coordinationId: accepted.id, state: applied.state, pending: false };
    } catch (error) {
      if (!(error instanceof BillingError)) throw error;
      const [current] = await deps.db
        .select({ state: legacyBillingCoordinations.state })
        .from(legacyBillingCoordinations)
        .where(eq(legacyBillingCoordinations.id, accepted.id));
      // The acceptance is recorded; the billing job retries the provider step.
      return {
        coordinationId: accepted.id,
        state: current?.state ?? accepted.state,
        pending: true,
      };
    }
  });
}

/** The payer keeps the current charge date. The contributor's own acceptance
 * and coverage are unaffected. */
export async function declineLegacyCoordination(
  deps: Pick<LegacyCoordinationDependencies, "db">,
  actorId: string,
  sessionId: string,
  raw: z.input<typeof decisionSchema>,
) {
  const input = decisionSchema.parse(raw);
  if (!sessionId) throw new BillingError("Recent central authentication is required");
  await assertAccountPayer(deps.db, actorId, input.accountId);
  return withActiveCompassoBillingLock(deps.db, actorId, input.accountId, () =>
    deps.db.transaction(async (tx) => {
      const { account } = await assertAccountPayer(tx, actorId, input.accountId);
      await lockFamilyMembership(tx, actorId, account.groupId);
      if (!(await lockRecentCentralAuthentication(tx, actorId, sessionId)))
        throw new BillingError("Recent central authentication is required");
      const [replay] = await tx
        .select()
        .from(legacyBillingConsents)
        .where(
          and(
            eq(legacyBillingConsents.userId, actorId),
            eq(legacyBillingConsents.requestKey, input.requestKey),
          ),
        );
      if (replay) {
        if (replay.role !== "payer" || replay.decision !== "declined")
          throw new BillingError("Request key belongs to another billing decision");
        return { coordinationId: replay.coordinationId, state: "declined" as const };
      }
      const row = await activeCoordination(tx, input.accountId);
      if (!row || row.payerUserId !== actorId || row.state !== "open")
        throw new BillingError("There is no billing coordination awaiting this payer");
      await tx.insert(legacyBillingConsents).values({
        userId: actorId,
        role: "payer",
        decision: "declined",
        groupId: row.groupId,
        coordinationId: row.id,
        policyVersion: POLICY,
        termsRevision: input.revision,
        terms: { decision: "keep_current_charge_date" },
        requestKey: input.requestKey,
      });
      await tx
        .update(legacyBillingCoordinations)
        .set({ state: "declined", reason: "payer_declined", updatedAt: new Date() })
        .where(eq(legacyBillingCoordinations.id, row.id));
      await tx.insert(familyEvents).values({
        groupId: row.groupId,
        actorId,
        event: "billing.legacy_coordination_declined",
        targetId: row.id,
      });
      return { coordinationId: row.id, state: "declined" as const };
    }),
  );
}

async function markReview(db: Database, id: string, reason: string) {
  await db
    .update(legacyBillingCoordinations)
    .set({ state: "review", reason, updatedAt: new Date() })
    .where(
      and(
        eq(legacyBillingCoordinations.id, id),
        inArray(legacyBillingCoordinations.state, ["payer_accepted", "applying", "applied"]),
      ),
    );
}

/** Facts changed before any provider attempt: the old acceptance is closed
 * and a fresh request, with a new idempotency key, waits for the payer. */
async function invalidate(tx: Tx, row: Coordination, reason: string) {
  await tx
    .update(legacyBillingCoordinations)
    .set({ state: "invalidated", reason, updatedAt: new Date() })
    .where(eq(legacyBillingCoordinations.id, row.id));
  const [next] = await tx
    .insert(legacyBillingCoordinations)
    .values({
      accountId: row.accountId,
      groupId: row.groupId,
      payerUserId: row.payerUserId,
      contributorUserId: row.contributorUserId,
      policyVersion: POLICY,
    })
    .returning();
  if (!next) throw new BillingError("Billing coordination was not reopened");
  const contracts = await tx
    .select({ acceptanceId: legacyBillingCoordinationContracts.acceptanceId })
    .from(legacyBillingCoordinationContracts)
    .where(eq(legacyBillingCoordinationContracts.coordinationId, row.id));
  if (contracts.length)
    await tx
      .insert(legacyBillingCoordinationContracts)
      .values(contracts.map((item) => ({ coordinationId: next.id, ...item })));
  return next;
}

/** Applies an accepted coordination. The caller holds the Compasso billing
 * lock of the account. The attempt is recorded before the provider is called
 * and every retry first reads what the provider already holds. */
export async function applyLegacyCoordinationLocked(
  deps: LegacyCoordinationDependencies,
  coordinationId: string,
): Promise<{ state: string }> {
  const [observed] = await deps.db
    .select()
    .from(legacyBillingCoordinations)
    .where(eq(legacyBillingCoordinations.id, coordinationId));
  if (!observed) throw new BillingError("Billing coordination is unavailable");
  if (["applied", "settled"].includes(observed.state)) return { state: observed.state };
  if (!["payer_accepted", "applying"].includes(observed.state))
    throw new BillingError("Billing coordination is not ready to apply");
  const firstAttempt = observed.state === "payer_accepted" && !observed.effectAttemptedAt;
  if (firstAttempt) await refreshContributedContracts(deps, coordinationId);
  const claim = await deps.db.transaction(async (tx) => {
    await lockFamilyMembership(tx, observed.payerUserId, observed.groupId);
    // A new provider effect is a commercial act and needs an active payer.
    // Finishing one that was already attempted settles an existing obligation,
    // so it must remain possible while the payer's account is being closed.
    if (firstAttempt) await lockActiveWebParticipation(tx, observed.payerUserId);
    const [row] = await tx
      .select()
      .from(legacyBillingCoordinations)
      .where(eq(legacyBillingCoordinations.id, coordinationId))
      .for("update");
    if (!row || !["payer_accepted", "applying"].includes(row.state))
      throw new BillingError("Billing coordination changed before applying");
    if (
      !row.kind ||
      !row.providerPriceId ||
      !row.amountCents ||
      !row.fromChargeAt ||
      !row.deferUntil ||
      !row.offerRevision ||
      (row.interval !== "month" && row.interval !== "year")
    )
      throw new BillingError("Billing coordination has no accepted terms");
    if (row.state === "payer_accepted" && !row.effectAttemptedAt) {
      const offer = await readCoordinationOffer(tx, deps, row, new Date());
      if (offer.effect === "none" || offer.revision !== row.offerRevision) {
        const next = await invalidate(tx, row, "terms_changed_before_effect");
        return { invalidated: next.id } as const;
      }
    }
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.provider, "stripe"),
          eq(customers.app, "compasso"),
          eq(customers.subjectType, "billing_account"),
          eq(customers.subjectId, row.accountId),
        ),
      );
    if (!customer) throw new BillingError("Coordinated customer is unavailable");
    const subscription = row.subscriptionId
      ? (await tx.select().from(subscriptions).where(eq(subscriptions.id, row.subscriptionId)))[0]
      : undefined;
    const intent = row.futureIntentId
      ? (
          await tx
            .select()
            .from(legacyFutureIntents)
            .where(eq(legacyFutureIntents.id, row.futureIntentId))
            .for("update")
        )[0]
      : undefined;
    if (row.kind === "subscription_trial" && subscription?.customerId !== customer.id)
      throw new BillingError("Coordinated subscription is unavailable");
    if (
      row.kind === "schedule_start" &&
      (!intent || intent.accountId !== row.accountId || !intent.scheduleId)
    )
      throw new BillingError("Coordinated future contract is unavailable");
    await tx
      .update(legacyBillingCoordinations)
      .set({
        state: "applying",
        effectAttemptedAt: sql`coalesce(${legacyBillingCoordinations.effectAttemptedAt}, clock_timestamp())`,
        updatedAt: new Date(),
      })
      .where(eq(legacyBillingCoordinations.id, row.id));
    return {
      row,
      interval: row.interval,
      kind: row.kind,
      providerPriceId: row.providerPriceId,
      amountCents: row.amountCents,
      fromChargeAt: row.fromChargeAt,
      deferUntil: row.deferUntil,
      customer,
      subscription,
      intent,
      retried: row.state === "applying" || !!row.effectAttemptedAt,
    } as const;
  });
  if ("invalidated" in claim) return { state: "invalidated" };
  const deferUntilSeconds = claim.deferUntil.getTime() / 1000;
  if (claim.kind === "subscription_trial") {
    if (!claim.subscription) throw new BillingError("Coordinated subscription is unavailable");
    const deferral = {
      intentId: claim.row.id,
      customerId: claim.customer.providerCustomerId,
      subscriptionId: claim.subscription.providerSubscriptionId,
      priceId: claim.providerPriceId,
      interval: claim.interval,
      amountCents: claim.amountCents,
      expectedPeriodEnd: claim.fromChargeAt.getTime() / 1000,
      deferUntil: deferUntilSeconds,
    };
    const before = claim.retried ? await deps.deferralProvider.classify(deferral) : "not_deferred";
    if (before === "conflict") {
      await markReview(deps.db, claim.row.id, "provider_conflict");
      throw new BillingError("Deferred subscription requires financial reconciliation");
    }
    if (before === "not_deferred") {
      try {
        await deps.deferralProvider.defer(deferral);
      } catch (error) {
        if (error instanceof LegacyDeferralChargeError) {
          await markReview(deps.db, claim.row.id, "charge_during_deferral");
          throw error;
        }
        // A lost response may hide an applied update: read before giving up.
        const after = await deps.deferralProvider.classify(deferral).catch(() => null);
        if (after === "conflict") await markReview(deps.db, claim.row.id, "provider_conflict");
        if (after !== "deferred") throw error;
      }
    }
  } else {
    const intent = claim.intent;
    if (!intent?.scheduleId || !intent.paymentMethodId)
      throw new BillingError("Coordinated future contract is unavailable");
    if (intent.interval !== "month" && intent.interval !== "year")
      throw new BillingError("Future contract interval is invalid");
    const moved = await deps.futureProvider.moveScheduleStart(
      {
        intentId: intent.id,
        customerId: claim.customer.providerCustomerId,
        paymentMethodId: intent.paymentMethodId,
        priceId: intent.providerPriceId,
        interval: intent.interval,
        // Until the local confirmation below, the intent still holds the terms
        // the schedule was created with.
        startsAt: claim.fromChargeAt.getTime() / 1000,
        paidThroughMs: Math.min(intent.paidThrough.getTime(), claim.fromChargeAt.getTime()),
        amountCents: intent.amountCents,
      },
      {
        scheduleId: intent.scheduleId,
        coordinationId: claim.row.id,
        newStartsAt: deferUntilSeconds,
      },
    );
    if (!moved.moved) {
      // The schedule already started: the charge the payer had accepted for
      // the earlier date happened. Nothing is undone automatically.
      await markReview(deps.db, claim.row.id, "schedule_started_before_move");
      throw new BillingError("Future schedule started before it could be moved");
    }
  }
  try {
    return await deps.db.transaction(async (tx) => {
      await lockFamilyMembership(tx, claim.row.payerUserId, claim.row.groupId);
      const [row] = await tx
        .select()
        .from(legacyBillingCoordinations)
        .where(eq(legacyBillingCoordinations.id, claim.row.id))
        .for("update");
      if (!row || row.state !== "applying")
        throw new BillingError("Billing coordination changed while applying");
      if (claim.kind === "schedule_start" && claim.intent) {
        const [intent] = await tx
          .select()
          .from(legacyFutureIntents)
          .where(eq(legacyFutureIntents.id, claim.intent.id))
          .for("update");
        if (
          !intent ||
          intent.state !== "scheduled" ||
          intent.scheduleId !== claim.intent.scheduleId
        )
          throw new BillingError("Future contract changed while its start was moved");
        if (intent.startsAt.getTime() !== claim.deferUntil.getTime()) {
          const terms = await readLegacyFutureIntentTerms(
            tx,
            { db: deps.db, products: deps.products, mode: deps.mode },
            claim.row.payerUserId,
            {
              accountId: intent.accountId,
              productId: z.enum(["compasso_monthly", "compasso_annual"]).parse(intent.productId),
            },
          );
          if (
            terms.startsAt.getTime() !== claim.deferUntil.getTime() ||
            terms.priceId !== intent.providerPriceId ||
            terms.amountCents !== intent.amountCents
          )
            throw new BillingError("Future contract terms no longer match the moved start");
          const [moved] = await tx
            .update(legacyFutureIntents)
            .set({
              startsAt: terms.startsAt,
              paidThrough: terms.paidThrough,
              termsRevision: terms.revision,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(legacyFutureIntents.id, intent.id),
                eq(legacyFutureIntents.state, "scheduled"),
                eq(legacyFutureIntents.startsAt, claim.fromChargeAt),
              ),
            )
            .returning({ id: legacyFutureIntents.id });
          if (!moved) throw new BillingError("Future contract changed while its start was moved");
        }
      }
      const [applied] = await tx
        .update(legacyBillingCoordinations)
        .set({
          state: "applied",
          effectConfirmedAt: sql`clock_timestamp()`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(legacyBillingCoordinations.id, row.id),
            eq(legacyBillingCoordinations.state, "applying"),
          ),
        )
        .returning({ state: legacyBillingCoordinations.state });
      if (!applied) throw new BillingError("Billing coordination changed while applying");
      if (claim.kind === "subscription_trial")
        await requestCollectionReconciliation(tx, {
          customerId: claim.customer.id,
          kind: "subscription",
          subjectId: claim.customer.id,
        });
      await tx.insert(familyEvents).values({
        groupId: row.groupId,
        actorId: row.payerUserId,
        event: "billing.legacy_coordination_applied",
        targetId: row.id,
      });
      return applied;
    });
  } catch (error) {
    // The provider already holds the new date. Keep the attempt for review
    // instead of retrying blindly against terms that no longer match.
    if (error instanceof BillingError && claim.kind === "schedule_start")
      await markReview(deps.db, claim.row.id, "local_confirmation_failed");
    throw error;
  }
}

/** Closes an applied coordination only on proof of the first charge at or
 * after the deferred date. A positive charge inside the deferred interval is
 * never settled silently. The caller holds the Compasso billing lock. */
export async function settleLegacyCoordinationLocked(
  deps: Pick<LegacyCoordinationDependencies, "db">,
  coordinationId: string,
): Promise<{ state: string }> {
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(legacyBillingCoordinations)
      .where(eq(legacyBillingCoordinations.id, coordinationId))
      .for("update");
    if (!row) throw new BillingError("Billing coordination is unavailable");
    if (row.state !== "applied" || !row.deferUntil || !row.fromChargeAt)
      return { state: row.state };
    const finish = async (state: "settled" | "canceled" | "review", reason?: string) => {
      await tx
        .update(legacyBillingCoordinations)
        .set({
          state,
          reason: reason ?? null,
          settledAt: state === "settled" ? sql`clock_timestamp()` : null,
          updatedAt: new Date(),
        })
        .where(eq(legacyBillingCoordinations.id, row.id));
      return { state };
    };
    if (row.kind === "schedule_start") {
      if (!row.futureIntentId) throw new BillingError("Coordinated future contract is missing");
      const [intent] = await tx
        .select({ state: legacyFutureIntents.state })
        .from(legacyFutureIntents)
        .where(eq(legacyFutureIntents.id, row.futureIntentId));
      if (intent?.state === "applied") return finish("settled");
      if (intent?.state === "canceled" || intent?.state === "failed")
        return finish("canceled", "future_contract_ended");
      return { state: row.state };
    }
    if (!row.subscriptionId || !row.providerPriceId)
      throw new BillingError("Coordinated subscription is missing");
    const [inside] = await tx
      .select({ id: subscriptionPaymentPeriods.id })
      .from(subscriptionPaymentPeriods)
      .where(
        and(
          eq(subscriptionPaymentPeriods.subscriptionId, row.subscriptionId),
          gte(subscriptionPaymentPeriods.periodStart, row.fromChargeAt),
          lt(subscriptionPaymentPeriods.periodStart, row.deferUntil),
        ),
      )
      .limit(1);
    if (inside) return finish("review", "charge_inside_deferred_interval");
    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, row.subscriptionId));
    if (!subscription) throw new BillingError("Coordinated subscription is missing");
    if (row.deferUntil > new Date()) return { state: row.state };
    const [paid] = await tx
      .select({ id: subscriptionPaymentPeriods.id })
      .from(subscriptionPaymentPeriods)
      .where(
        and(
          eq(subscriptionPaymentPeriods.subscriptionId, row.subscriptionId),
          eq(subscriptionPaymentPeriods.providerPriceId, row.providerPriceId),
          gte(subscriptionPaymentPeriods.periodStart, row.deferUntil),
          gte(subscriptionPaymentPeriods.paidAt, row.deferUntil),
          eq(subscriptionPaymentPeriods.fullyRefunded, false),
          eq(subscriptionPaymentPeriods.disputed, false),
        ),
      )
      .limit(1);
    if (paid && !(await hasPendingCompassoReview(tx, row.groupId, "subscription")))
      return finish("settled");
    if (!paid && ["canceled", "incomplete_expired"].includes(subscription.status))
      return finish("canceled", "subscription_ended_without_charge");
    await requestCollectionReconciliation(tx, {
      customerId: subscription.customerId,
      kind: "subscription",
      subjectId: subscription.customerId,
    });
    return { state: row.state };
  });
}

/** An open request stops waiting when the contributed period no longer reaches
 * past the payer's next charge, or when the payer left the family. */
export async function reviewOpenLegacyCoordinationLocked(
  deps: LegacyCoordinationDependencies,
  coordinationId: string,
): Promise<{ state: string }> {
  await refreshContributedContracts(deps, coordinationId);
  return deps.db.transaction(async (tx) => {
    const [observed] = await tx
      .select()
      .from(legacyBillingCoordinations)
      .where(eq(legacyBillingCoordinations.id, coordinationId));
    if (!observed || observed.state !== "open") return { state: observed?.state ?? "missing" };
    const [account] = await tx
      .select()
      .from(collectionAccounts)
      .where(eq(collectionAccounts.id, observed.accountId));
    let member = true;
    await tx
      .transaction((nested) => lockFamilyMembership(nested, observed.payerUserId, observed.groupId))
      .catch(() => {
        member = false;
      });
    const [row] = await tx
      .select()
      .from(legacyBillingCoordinations)
      .where(eq(legacyBillingCoordinations.id, coordinationId))
      .for("update");
    if (!row || row.state !== "open") return { state: row?.state ?? "missing" };
    if (!member || !account || account.closedAt) {
      await tx
        .update(legacyBillingCoordinations)
        .set({ state: "lapsed", reason: "payer_unavailable", updatedAt: new Date() })
        .where(eq(legacyBillingCoordinations.id, row.id));
      return { state: "lapsed" };
    }
    const offer = await readCoordinationOffer(tx, deps, row, new Date());
    if (offer.effect === "none") return closeWithoutEffect(tx, row, offer.reason);
    await tx
      .update(legacyBillingCoordinations)
      .set({ updatedAt: new Date() })
      .where(eq(legacyBillingCoordinations.id, row.id));
    return { state: row.state };
  });
}
