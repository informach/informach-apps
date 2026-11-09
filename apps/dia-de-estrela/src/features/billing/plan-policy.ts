import type { Product } from "@informach/config";

function profileLimit(product: Pick<Product, "tier">) {
  return product.tier === "family" ? 4 : 1;
}

/**
 * Capacity reductions and annual-to-monthly changes preserve the period that
 * was already paid. Capacity increases and monthly-to-annual changes apply as
 * soon as Stripe confirms the prorated charge.
 */
export function planChangeMode(
  current: Pick<Product, "tier" | "interval">,
  target: Pick<Product, "tier" | "interval">,
) {
  const currentLimit = profileLimit(current);
  const targetLimit = profileLimit(target);
  if (targetLimit < currentLimit) return "schedule_at_period_end" as const;
  if (targetLimit > currentLimit) return "immediate" as const;
  return current.interval === "year" && target.interval === "month"
    ? ("schedule_at_period_end" as const)
    : ("immediate" as const);
}

export function planProfileLimit(product: Pick<Product, "tier">) {
  return profileLimit(product);
}
