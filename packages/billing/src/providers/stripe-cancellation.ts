/** The Portal can schedule the period end using cancel_at while leaving its legacy flag false. */
export function cancelsAtPeriodEnd(
  subscription: { cancel_at_period_end?: boolean; cancel_at?: number | null },
  periodEnd: number | null | undefined,
): boolean {
  return (
    subscription.cancel_at_period_end === true ||
    (typeof periodEnd === "number" && periodEnd > 0 && subscription.cancel_at === periodEnd)
  );
}
