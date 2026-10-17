export type CommercialState = {
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "unpaid"
    | "paused";
  trialEnd: Date | null;
  suspended: boolean;
  periods: readonly { start: Date; end: Date; refunded: boolean; disputed: boolean }[];
};
export type AccessDecision =
  | { allowed: true; paidThrough: Date }
  | { allowed: false; reason: "subscription_required" | "payment_required" | "suspended" };

/** Payment facts, not a mutable subscription end date, establish paid access. */
export function decideAccess(state: CommercialState | null, now: Date): AccessDecision {
  if (!state) return { allowed: false, reason: "subscription_required" };
  if (state.suspended || state.periods.some((period) => period.disputed))
    return { allowed: false, reason: "suspended" };
  if (state.status === "past_due" || state.status === "unpaid" || state.status === "paused")
    return { allowed: false, reason: "payment_required" };
  if (state.status === "incomplete" || state.status === "incomplete_expired")
    return { allowed: false, reason: "subscription_required" };
  if (state.status === "trialing") {
    return state.trialEnd && state.trialEnd > now
      ? { allowed: true, paidThrough: state.trialEnd }
      : { allowed: false, reason: "subscription_required" };
  }
  const valid = state.periods
    .filter((period) => !period.refunded && period.end > period.start)
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  let end = now.getTime();
  for (const period of valid) {
    if (period.start.getTime() <= end && period.end.getTime() > end) end = period.end.getTime();
  }
  return end > now.getTime()
    ? { allowed: true, paidThrough: new Date(end) }
    : { allowed: false, reason: "subscription_required" };
}
