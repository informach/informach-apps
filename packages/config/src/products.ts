export type ProductId = string;

export type ProductKind = "subscription" | "credit_pack";

export type ProductPriceMap = {
  dev: string;
  prod: string;
};

export type ProductListPrice = {
  /** Amount in the smallest currency unit (cents for BRL/USD, etc). */
  amountCents: number;
  /** ISO 4217 currency code (e.g., "BRL"). */
  currency: string;
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
  /**
   * Display-only price shown in the UI (cards, plan picker, checkout previews).
   * Stripe remains the source of truth for actual charging — this value must
   * stay in sync with the Stripe Dashboard price (any mismatch is a config bug).
   */
  listPrice?: ProductListPrice;
};

// NOTE: stripePriceId placeholders. Substituir pelos IDs reais do Stripe (test+live)
// antes de habilitar Pro em produção. Free não tem entrada — é ausência de subscription.
//
// Modelo econômico Cozya (ver `packages/billing/CLAUDE.md` §5.5):
// - Pro: R$ 14,90/mês ou R$ 149/ano (~17% desc), 50 créditos/mês
// - 1 crédito = 1 chamada à API de IA (independente de salvar)
// - Custo médio por chamada ~R$ 0,02 (mix GPT-4o-mini + GPT-4o vision)
// - 50 créditos/mês ≈ R$ 1,00 de custo de IA → margem bruta ~93%
// - Free: sem IA (só cadastro manual com limite de receitas)
export const PRODUCTS: readonly Product[] = [
  {
    id: "cozya_pro_monthly",
    app: "cozya",
    kind: "subscription",
    name: "Cozya Pro",
    tier: "pro",
    interval: "month",
    bonusCreditsPerMonth: 50,
    stripePriceId: {
      dev: "price_1TTR6VCvOctqao30J41KCiYi",
      prod: "price_1TVAjMCvOctqao30WAOrs565",
    },
    listPrice: { amountCents: 1490, currency: "BRL" },
  },
  {
    id: "cozya_pro_annual",
    app: "cozya",
    kind: "subscription",
    name: "Cozya Pro (Anual)",
    tier: "pro",
    interval: "year",
    bonusCreditsPerMonth: 50,
    stripePriceId: {
      dev: "price_1TTR7ECvOctqao30h2pkeyqP",
      prod: "price_1TVAjTCvOctqao30glQmB1v4",
    },
    listPrice: { amountCents: 14900, currency: "BRL" },
  },
  // Credit packs: top-ups avulsos, sem expiração. Os Stripe Price IDs ficam
  // como `price_TODO_*` até o time de billing configurá-los — a UI esconde
  // packs com placeholder em produção via `isStripePriceIdConfigured`.
  //
  // Pricing regra (alinhada com Anthropic/OpenAI/Cursor): TODO pack custa
  // mais per-credit que o plano mensal — Pro = R$ 0,497/crédito (R$ 14,90 /
  // 30). Packs ficam em R$ 0,60-0,70/crédito (+20-40% premium), com desconto
  // progressivo por volume. Sinaliza "a assinatura é o melhor valor; pacotes
  // são para quando o cap mensal não chega".
  //
  // Volume cap em 30 (= 1 mês completo) mantém coerência com a regra "30
  // chamadas de IA por ciclo do plano".
  {
    id: "cozya_credits_10",
    app: "cozya",
    kind: "credit_pack",
    name: "10 créditos",
    creditAmount: 10,
    stripePriceId: {
      dev: "price_1TVAuJCvOctqao30a1dROkvp",
      prod: "price_1TVAjZCvOctqao30HEcEev83",
    },
    listPrice: { amountCents: 690, currency: "BRL" },
  },
  {
    id: "cozya_credits_20",
    app: "cozya",
    kind: "credit_pack",
    name: "20 créditos",
    creditAmount: 20,
    stripePriceId: {
      dev: "price_1TVAuKCvOctqao30zodJvm4F",
      prod: "price_1TVAjdCvOctqao302vcihvsS",
    },
    listPrice: { amountCents: 1290, currency: "BRL" },
  },
  {
    id: "cozya_credits_30",
    app: "cozya",
    kind: "credit_pack",
    name: "30 créditos",
    creditAmount: 30,
    stripePriceId: {
      dev: "price_1TVAuKCvOctqao3046AJfhFm",
      prod: "price_1TVAjhCvOctqao30mIrhXhN0",
    },
    listPrice: { amountCents: 1790, currency: "BRL" },
  },
  // Agenda da Turma — R$ 19,90/mês, R$ 199/ano, 50 créditos/mês,
  // packs 10/20/30 a R$ 6,90/12,90/17,90). Stripe Price IDs ficam como `price_TODO_*`
  // até o time configurar produtos no Stripe Dashboard (test+live). `isStripePriceIdConfigured`
  // rejeita placeholders e o boot do app trava em produção até IDs reais entrarem.
  // Hoje a Agenda da Turma não tem features de IA — créditos são acumulados pra quando
  // alguma feature consumir via `withCredits` (sem consumo até lá).
  {
    id: "agenda_da_turma_pro_monthly",
    app: "agenda-da-turma",
    kind: "subscription",
    name: "Agenda da Turma Pro",
    tier: "pro",
    interval: "month",
    bonusCreditsPerMonth: 50,
    stripePriceId: {
      dev: "price_1TVTonCvOctqao30b8wnGAXN",
      prod: "price_TODO_agenda_da_turma_pro_monthly_prod",
    },
    listPrice: { amountCents: 1990, currency: "BRL" },
  },
  {
    id: "agenda_da_turma_pro_annual",
    app: "agenda-da-turma",
    kind: "subscription",
    name: "Agenda da Turma Pro (Anual)",
    tier: "pro",
    interval: "year",
    bonusCreditsPerMonth: 50,
    stripePriceId: {
      dev: "price_1TVTpPCvOctqao30mLauE2qm",
      prod: "price_TODO_agenda_da_turma_pro_annual_prod",
    },
    listPrice: { amountCents: 19900, currency: "BRL" },
  },
  {
    id: "agenda_da_turma_credits_10",
    app: "agenda-da-turma",
    kind: "credit_pack",
    name: "10 créditos",
    creditAmount: 10,
    stripePriceId: {
      dev: "price_1TVTr9CvOctqao307lhSoW6K",
      prod: "price_TODO_agenda_da_turma_credits_10_prod",
    },
    listPrice: { amountCents: 690, currency: "BRL" },
  },
  {
    id: "agenda_da_turma_credits_20",
    app: "agenda-da-turma",
    kind: "credit_pack",
    name: "20 créditos",
    creditAmount: 20,
    stripePriceId: {
      dev: "price_1TVTsYCvOctqao3085Ch7sog",
      prod: "price_TODO_agenda_da_turma_credits_20_prod",
    },
    listPrice: { amountCents: 1290, currency: "BRL" },
  },
  {
    id: "agenda_da_turma_credits_30",
    app: "agenda-da-turma",
    kind: "credit_pack",
    name: "30 créditos",
    creditAmount: 30,
    stripePriceId: {
      dev: "price_1TVTsxCvOctqao30xAYj0dM2",
      prod: "price_TODO_agenda_da_turma_credits_30_prod",
    },
    listPrice: { amountCents: 1790, currency: "BRL" },
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
