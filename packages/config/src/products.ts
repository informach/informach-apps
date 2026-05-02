export type ProductId = string;

export type ProductKind = "subscription" | "credit_pack";

export type ProductPriceMap = {
  dev: string;
  prod: string;
};

export type Product = {
  id: ProductId;
  app: string;
  kind: ProductKind;
  name: string;
  description?: string;
  /** Subscription tier label (e.g., "free", "pro", "team"). */
  tier?: string;
  /** Subscription billing interval. */
  interval?: "month" | "year";
  /**
   * Bonus AI credits granted on every subscription renewal (webhook invoice.paid).
   * Expire at the end of the billing cycle (~31 days).
   */
  bonusCreditsPerMonth?: number;
  /** Number of credits granted on a one-time credit pack purchase. */
  creditAmount?: number;
  /** Stripe Price ID, mapped per environment. */
  stripePriceId: ProductPriceMap;
};

// NOTE: stripePriceId placeholders. Substituir pelos IDs reais do Stripe (test+live)
// antes de habilitar Pro em produção. Free não tem entrada — é ausência de subscription.
export const PRODUCTS: readonly Product[] = [
  {
    id: "cozya_pro_monthly",
    app: "cozya",
    kind: "subscription",
    name: "Cozya Pro",
    tier: "pro",
    interval: "month",
    bonusCreditsPerMonth: 100,
    stripePriceId: {
      dev: "price_TODO_cozya_pro_monthly_dev",
      prod: "price_TODO_cozya_pro_monthly_prod",
    },
  },
  {
    id: "cozya_pro_annual",
    app: "cozya",
    kind: "subscription",
    name: "Cozya Pro (Anual)",
    tier: "pro",
    interval: "year",
    bonusCreditsPerMonth: 100,
    stripePriceId: {
      dev: "price_TODO_cozya_pro_annual_dev",
      prod: "price_TODO_cozya_pro_annual_prod",
    },
  },
] as const;

export type StripeMode = "dev" | "prod";

const STRIPE_PRICE_ID_PATTERN = /^price_[A-Za-z0-9_]+$/;
const STRIPE_PRICE_ID_PLACEHOLDER_PREFIX = "price_TODO";

/**
 * Resolves the Stripe Price ID for a product given the runtime environment.
 * Apps inject `mode` based on env (e.g., NODE_ENV).
 */
export function getStripePriceId(product: Product, mode: StripeMode): string {
  return product.stripePriceId[mode];
}

export function isStripePriceIdConfigured(priceId: string): boolean {
  return (
    STRIPE_PRICE_ID_PATTERN.test(priceId) && !priceId.startsWith(STRIPE_PRICE_ID_PLACEHOLDER_PREFIX)
  );
}

export function findProduct(productId: ProductId): Product | undefined {
  return PRODUCTS.find((p) => p.id === productId);
}

export function findProductByPriceId(priceId: string): Product | undefined {
  return PRODUCTS.find((p) => p.stripePriceId.dev === priceId || p.stripePriceId.prod === priceId);
}
