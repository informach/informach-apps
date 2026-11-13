import "server-only";
import { getProSubscription } from "@informach/billing";
import { getCompassoAccessInTransaction } from "@informach/billing/compasso";
import { PRODUCTS } from "@informach/config";
import { COMPASSO_POLICY } from "@informach/config/collections";
import { and, db, desc, eq } from "@informach/db";
import {
  boraFamilies,
  customers,
  familyMigrationSources,
  subscriptions,
} from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import { assertAllowed } from "@/lib/errors";
import { type Access, FREE_ACCESS } from "../acesso/policy";
import { emTolerancia, estadoDoTeste, TRIAL_PROFILE_LIMIT } from "../teste/regras";

/** Read-only bridge for an existing contract; never starts a local trial or checkout. */
export async function legacyBoraAccess(tx: FamilyTransaction, userId: string) {
  const active = await getProSubscription(
    { db: tx, app: "bora-treinar", provider: "stripe" },
    { type: "user", id: userId },
  );
  const [late] = await tx
    .select({ subscription: subscriptions })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(
      and(
        eq(customers.app, "bora-treinar"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, userId),
        eq(subscriptions.status, "past_due"),
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);
  const [family] = await tx
    .select({ trialStartedAt: boraFamilies.trialStartedAt })
    .from(boraFamilies)
    .where(eq(boraFamilies.userId, userId));
  const tolerated =
    !active && late && emTolerancia(late.subscription.currentPeriodEnd) ? late.subscription : null;
  const subscription = active ?? tolerated;
  const product = PRODUCTS.find(
    (p) => p.app === "bora-treinar" && p.id === subscription?.productId,
  );
  const subscribed = Boolean(subscription && product);
  const trial = estadoDoTeste(family?.trialStartedAt ?? null);
  const access: Access = {
    subscribed,
    unlocked: subscribed || trial.active,
    trial: { ...trial, active: trial.active && !subscribed },
    profileLimit: product
      ? product.tier === "family"
        ? 4
        : 1
      : trial.active
        ? TRIAL_PROFILE_LIMIT
        : 1,
    tier: product?.tier === "family" ? "family" : product ? "individual" : "free",
  };
  return { ...access, pagamentoAtrasado: Boolean(tolerated), subscription: null };
}

/** The family lock remains held until the domain write commits. */
export async function boraAccessInTransaction(
  tx: FamilyTransaction,
  actorId: string,
  groupId: string,
) {
  const coverage = await getCompassoAccessInTransaction(tx, actorId, groupId);
  const free = {
    ...FREE_ACCESS,
    trial: { ...FREE_ACCESS.trial, started: !coverage.canStartTrial },
    pagamentoAtrasado: false,
    subscription: null,
  };
  if (coverage.source === "review") return free;
  if (coverage.active)
    return {
      ...free,
      subscribed: coverage.source === "paid" || coverage.source === "legacy",
      unlocked: true,
      trial: {
        active: coverage.source === "trial",
        started: true,
        endsAt: coverage.source === "trial" ? (coverage.endsAt?.getTime() ?? null) : null,
      },
      profileLimit: COMPASSO_POLICY.capacity.adults + COMPASSO_POLICY.capacity.dependents,
      tier: "family" as const,
    };
  const sources = await tx
    .select({ owner: familyMigrationSources.sourceOwnerId })
    .from(familyMigrationSources)
    .where(
      and(
        eq(familyMigrationSources.groupId, groupId),
        eq(familyMigrationSources.app, "bora-treinar"),
      ),
    );
  assertAllowed(
    sources.length <= 1,
    "BILLING_REVIEW",
    "A cobertura anterior desta família precisa de conferência.",
  );
  return sources[0] ? legacyBoraAccess(tx, sources[0].owner) : free;
}

export function getGroupAccess(actorId: string, groupId: string) {
  return db.transaction((tx) => boraAccessInTransaction(tx, actorId, groupId));
}
