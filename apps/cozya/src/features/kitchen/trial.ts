import { daysBetween } from "./dates";

/** The trial as the product promises it: these numbers are the copy too, never written by hand. */
export const TRIAL_DAYS = 14;
export const TRIAL_CREDITS = 3;
/** How long after its end the trial is still news: the recap "Seu teste terminou" stops after it. */
export const TRIAL_RECAP_DAYS = 7;

/** What `getKitchenAccess` answers, as far as the trial goes. */
type TrialAccess = {
  isPro: boolean;
  trialActive: boolean;
  trialEndsAt: Date | null;
  profile: { trialStartedAt: Date | null } | null;
};

/**
 * Calendar days left in the trial, in São Paulo (0 on the last day), or null when no trial
 * should show. Whoever subscribes during the trial is Pro, and Pro never shows the trial.
 */
export function trialDaysLeft(access: TrialAccess, now = new Date()): number | null {
  if (access.isPro || !access.trialActive || !access.trialEndsAt) return null;
  return daysBetween(now, access.trialEndsAt);
}

/** The trial ended and the account is not Pro: "Novas semanas ficam no Pro." */
export function trialEnded(access: TrialAccess): boolean {
  return !access.isPro && !access.trialActive && !!access.profile?.trialStartedAt;
}

export type TrialRecap = {
  /** "active": the trial is running; "ended": the account just left it. */
  phase: "active" | "ended";
  /** What the house did counts only inside the trial, from its start to its end. */
  from: Date;
  to: Date;
};

/**
 * The "Sua semana continua aqui" recap is for who is in the trial or just left it. Someone who
 * subscribed at some point, or whose trial ended long ago, did not "just finish the trial".
 */
export function trialRecap(
  access: TrialAccess,
  everSubscribed: boolean,
  now = new Date(),
): TrialRecap | null {
  const from = access.profile?.trialStartedAt ?? null;
  const end = access.trialEndsAt;
  if (access.isPro || !from || !end) return null;
  if (access.trialActive) return { phase: "active", from, to: end };
  if (everSubscribed || daysBetween(end, now) > TRIAL_RECAP_DAYS) return null;
  return { phase: "ended", from, to: end };
}

/** Stripe statuses of a subscription that was never paid: a failed checkout is not a subscription. */
const NEVER_PAID = new Set(["incomplete", "incomplete_expired"]);

export function hasEverSubscribed(subscriptions: readonly { status: string }[]): boolean {
  return subscriptions.some((subscription) => !NEVER_PAID.has(subscription.status));
}
