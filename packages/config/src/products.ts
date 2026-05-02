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

export const PRODUCTS: readonly Product[] = [] as const;

export type StripeMode = "dev" | "prod";

/**
 * Resolves the Stripe Price ID for a product given the runtime environment.
 * Apps inject `mode` based on env (e.g., NODE_ENV).
 */
export function getStripePriceId(product: Product, mode: StripeMode): string {
  return product.stripePriceId[mode];
}

export function findProduct(productId: ProductId): Product | undefined {
  return PRODUCTS.find((p) => p.id === productId);
}

export function findProductByPriceId(priceId: string): Product | undefined {
  return PRODUCTS.find((p) => p.stripePriceId.dev === priceId || p.stripePriceId.prod === priceId);
}
