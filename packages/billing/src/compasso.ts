import { createHmac } from "node:crypto";
import { COMPASSO_POLICY } from "@informach/config/collections";
import type { Database } from "@informach/db";
import {
  collectionAccounts,
  collectionTrialClaims,
  collectionTrials,
  customers,
  familyEvents,
  subscriptionPaymentPeriods,
  subscriptions,
  users,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { assertCompassoFundingClear, hasPendingCompassoReview } from "./collection-jobs";
import { grantBonusCredits } from "./credits/grant";
import { lockCreditOwner } from "./credits/locks";
import { BillingError } from "./errors";
import { legacyContractCoverage } from "./legacy-contract-coverage";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export class CompassoTrialUnavailableError extends BillingError {
  override name = "CompassoTrialUnavailableError";
  constructor(readonly reason: "already-used" | "not-administrator" | "paid-period") {
    super(`Compasso trial is unavailable: ${reason}`);
  }
}
async function paidWindow(tx: Tx, groupId: string, now: Date) {
  const [paid] = await tx
    .select({ endsAt: subscriptionPaymentPeriods.periodEnd })
    .from(subscriptionPaymentPeriods)
    .innerJoin(subscriptions, eq(subscriptions.id, subscriptionPaymentPeriods.subscriptionId))
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .innerJoin(collectionAccounts, sql`${collectionAccounts.id}::text = ${customers.subjectId}`)
    .where(
      and(
        eq(collectionAccounts.groupId, groupId),
        eq(collectionAccounts.collection, "compasso"),
        eq(customers.app, "compasso"),
        eq(customers.subjectType, "billing_account"),
        inArray(subscriptions.productId, ["compasso_monthly", "compasso_annual"]),
        inArray(subscriptions.status, ["active", "past_due", "canceled", "trialing"]),
        eq(subscriptionPaymentPeriods.fullyRefunded, false),
        eq(subscriptionPaymentPeriods.disputed, false),
        lte(subscriptionPaymentPeriods.periodStart, now),
        gt(subscriptionPaymentPeriods.periodEnd, now),
      ),
    )
    .orderBy(desc(subscriptionPaymentPeriods.periodEnd))
    .limit(1);
  return paid ?? null;
}

/** Local trial without card; it neither creates a Stripe subscription nor starts a charge. */
export async function startCompassoTrial(
  config: { db: Database; trialHashSecret: string },
  actorId: string,
  groupId: string,
) {
  if (config.trialHashSecret.length < 32)
    throw new BillingError("A durable trial digest secret is required");
  return config.db.transaction(async (tx) => {
    // Spending acquires wallet -> membership; trial grants follow that same order.
    await lockCreditOwner(tx, { type: "family", id: groupId });
    const membership = await lockFamilyMembership(tx, actorId, groupId);
    await assertCompassoFundingClear(tx, groupId);
    if (membership.role !== "administrator")
      throw new CompassoTrialUnavailableError("not-administrator");
    const [existing] = await tx
      .select()
      .from(collectionTrials)
      .where(
        and(eq(collectionTrials.groupId, groupId), eq(collectionTrials.collection, "compasso")),
      );
    if (existing) {
      if (existing.endsAt <= new Date()) throw new CompassoTrialUnavailableError("already-used");
      return existing;
    }
    const now = new Date();
    if (await paidWindow(tx, groupId, now)) throw new CompassoTrialUnavailableError("paid-period");
    if ((await legacyContractCoverage(tx, groupId, now)).status !== "none")
      throw new CompassoTrialUnavailableError("paid-period");
    const [actor] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, actorId))
      .for("update");
    if (!actor) throw new BillingError("Trial account is unavailable");
    // Email can change. The same authenticated identity still gets one trial;
    // its durable email claim also survives a later identity deletion.
    const [usedByActor] = await tx
      .select({ groupId: collectionTrials.groupId })
      .from(collectionTrials)
      .where(
        and(eq(collectionTrials.collection, "compasso"), eq(collectionTrials.startedBy, actorId)),
      )
      .limit(1);
    if (usedByActor) throw new CompassoTrialUnavailableError("already-used");
    const emailHash = createHmac("sha256", config.trialHashSecret)
      .update(`compasso:${actor.email.trim().toLowerCase()}`)
      .digest("hex");
    const [claim] = await tx
      .insert(collectionTrialClaims)
      .values({ collection: "compasso", emailHash })
      .onConflictDoNothing()
      .returning({ emailHash: collectionTrialClaims.emailHash });
    if (!claim) throw new CompassoTrialUnavailableError("already-used");
    const endsAt = new Date(now.getTime() + COMPASSO_POLICY.trialDays * 86_400_000);
    const [trial] = await tx
      .insert(collectionTrials)
      .values({ groupId, collection: "compasso", startedBy: actorId, startsAt: now, endsAt })
      .returning();
    if (!trial) throw new BillingError("Trial was not created");
    await grantBonusCredits(
      { db: tx, app: "compasso" },
      {
        owner: { type: "family", id: groupId },
        amount: COMPASSO_POLICY.ai.trialCredits,
        reason: "promo",
        expiresAt: endsAt,
        stripeEventId: `trial:compasso:${groupId}`,
      },
    );
    await tx.insert(familyEvents).values({ groupId, actorId, event: "billing.trial_started" });
    return trial;
  });
}

export async function getCompassoAccess(db: Database, actorId: string, groupId: string) {
  return db.transaction((tx) => getCompassoAccessInTransaction(tx, actorId, groupId));
}

/** Domain transactions keep the family lock through the authorized write. */
export async function getCompassoAccessInTransaction(tx: Tx, actorId: string, groupId: string) {
  await lockFamilyMembership(tx, actorId, groupId);
  if (await hasPendingCompassoReview(tx, groupId, "subscription"))
    return { active: false, source: "review" as const, endsAt: null, canStartTrial: false };
  const now = new Date();
  const paid = await paidWindow(tx, groupId, now);
  if (paid)
    return { active: true, source: "paid" as const, endsAt: paid.endsAt, canStartTrial: false };
  const legacy = await legacyContractCoverage(tx, groupId, now);
  if (legacy.status === "review")
    return { active: false, source: "review" as const, endsAt: null, canStartTrial: false };
  if (legacy.status === "active")
    return { active: true, source: "legacy" as const, endsAt: legacy.endsAt, canStartTrial: false };
  const [trial] = await tx
    .select({ startsAt: collectionTrials.startsAt, endsAt: collectionTrials.endsAt })
    .from(collectionTrials)
    .where(and(eq(collectionTrials.groupId, groupId), eq(collectionTrials.collection, "compasso")));
  const [usedByActor] = trial
    ? []
    : await tx
        .select({ groupId: collectionTrials.groupId })
        .from(collectionTrials)
        .where(
          and(eq(collectionTrials.collection, "compasso"), eq(collectionTrials.startedBy, actorId)),
        )
        .limit(1);
  return trial && trial.startsAt <= now && trial.endsAt > now
    ? { active: true, source: "trial" as const, endsAt: trial.endsAt, canStartTrial: false }
    : {
        active: false,
        source: "none" as const,
        endsAt: null,
        canStartTrial: !trial && !usedByActor,
      };
}
