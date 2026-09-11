import "server-only";
import { createHmac } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import { cozyaProfiles, cozyaTrialClaims } from "@informach/db/schema";
import { cache } from "react";
import { getIsProForUser } from "@/features/billing/server-cache";
import { billing } from "@/features/billing/service";
import { env } from "@/lib/env";
import { recordProductEvent } from "./events";

export const TRIAL_DAYS = 14;
export const TRIAL_CREDITS = 3;

export const getKitchenAccess = cache(async (userId: string) => {
  const [isPro, profiles] = await Promise.all([
    getIsProForUser(userId),
    db.select().from(cozyaProfiles).where(eq(cozyaProfiles.userId, userId)).limit(1),
  ]);
  const profile = profiles[0] ?? null;
  const trialEndsAt = profile?.trialStartedAt
    ? new Date(profile.trialStartedAt.getTime() + TRIAL_DAYS * 86400000)
    : null;
  const trialActive = trialEndsAt !== null && trialEndsAt > new Date();
  return {
    isPro,
    trialActive,
    canPlan: isPro || trialActive,
    canUseAi: isPro || trialActive,
    trialEndsAt,
    profile,
  };
});

export async function startKitchenTrial(user: {
  id: string;
  email: string;
  emailVerified: boolean;
}) {
  if (!user.emailVerified) return { ok: false, code: "VERIFY_EMAIL" } as const;
  const emailHash = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`cozya-trial:${user.email.trim().toLowerCase()}`)
    .digest("hex");
  const startedAt = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:trial:${emailHash}`}))`);
    await tx.insert(cozyaTrialClaims).values({ emailHash, userId: user.id }).onConflictDoNothing();
    const [claim] = await tx
      .select()
      .from(cozyaTrialClaims)
      .where(eq(cozyaTrialClaims.emailHash, emailHash));
    if (!claim || claim.userId !== user.id) return null;
    await tx
      .insert(cozyaProfiles)
      .values({ userId: user.id, trialStartedAt: claim.startedAt })
      .onConflictDoUpdate({
        target: cozyaProfiles.userId,
        set: { trialStartedAt: claim.startedAt },
      });
    return claim.startedAt;
  });
  if (!startedAt) return { ok: false, code: "TRIAL_ALREADY_USED" } as const;
  const expiresAt = new Date(startedAt.getTime() + TRIAL_DAYS * 86400000);
  if (expiresAt <= new Date()) return { ok: false, code: "TRIAL_EXPIRED" } as const;
  // A retry after a process failure completes this grant, but cannot grant twice.
  await billing.grantBonusCredits({
    owner: { type: "user", id: user.id },
    amount: TRIAL_CREDITS,
    reason: "promo",
    expiresAt,
    stripeEventId: `cozya_trial_v1_${emailHash}`,
    metadata: { campaign: "cozya_trial_v1" },
  });
  await recordProductEvent(user.id, "trial_started", "v1");
  return { ok: true } as const;
}
