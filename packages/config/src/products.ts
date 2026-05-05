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
      dev: "price_1TTR6VCvOctqao30J41KCiYi",
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
      dev: "price_1TTR7ECvOctqao30h2pkeyqP",
      prod: "price_TODO_cozya_pro_annual_prod",
    },
  },
  // Credit packs: top-ups avulsos, sem expiração. Os Stripe Price IDs ficam
  // como `price_TODO_*` até o time de billing configurá-los — a UI esconde
  // packs com placeholder em produção via `isStripePriceIdConfigured`.
  {
    id: "cozya_credits_100",
    app: "cozya",
    kind: "credit_pack",
    name: "100 créditos",
    description: "Pacote inicial para experimentar a IA do Cozya.",
    creditAmount: 100,
    stripePriceId: {
      dev: "price_TODO_cozya_credits_100_dev",
      prod: "price_TODO_cozya_credits_100_prod",
    },
  },
  {
    id: "cozya_credits_500",
    app: "cozya",
    kind: "credit_pack",
    name: "500 créditos",
    description: "Recarga padrão — combina com uso regular de IA.",
    creditAmount: 500,
    stripePriceId: {
      dev: "price_TODO_cozya_credits_500_dev",
      prod: "price_TODO_cozya_credits_500_prod",
    },
  },
  {
    id: "cozya_credits_1500",
    app: "cozya",
    kind: "credit_pack",
    name: "1500 créditos",
    description: "Volume — para quem usa muito e quer melhor preço por crédito.",
    creditAmount: 1500,
    stripePriceId: {
      dev: "price_TODO_cozya_credits_1500_dev",
      prod: "price_TODO_cozya_credits_1500_prod",
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
