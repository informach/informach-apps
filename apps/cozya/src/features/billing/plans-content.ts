import { findProduct } from "@informach/config";

export type BillingCycle = "monthly" | "annual";

export type PlanFeature = { label: string; included: boolean };

export const FREE_FEATURES: PlanFeature[] = [
  { label: "14 dias para planejar, com 3 créditos de IA, sem cartão", included: true },
  { label: "Até 15 receitas escritas do seu jeito", included: true },
  { label: "Modo cozinha em todas as suas receitas", included: true },
  { label: "As semanas e listas que você já montou", included: true },
  { label: "Compartilhar receita pelo WhatsApp", included: true },
];

export const PRO_FEATURES: PlanFeature[] = [
  { label: "Semanas sem limite, com mesa e marmitas", included: true },
  { label: "Lista do mercado somada, com despensa", included: true },
  { label: "Modo cozinha e repetir a semana", included: true },
  { label: "Receitas sem limite", included: true },
  { label: "Trazer receita por foto, texto ou voz", included: true },
  { label: "Encontrar receitas com fonte na web", included: true },
  { label: "50 créditos de IA por mês, também no anual", included: true },
  { label: "Créditos extras quando precisar", included: true },
];

// Preços derivados de `packages/config/src/products.ts`, a fonte oficial.
// Divergência entre UI e Stripe Dashboard é bug (root CLAUDE.md §8.1).
const monthlyProduct = findProduct("cozya_pro_monthly");
const annualProduct = findProduct("cozya_pro_annual");
if (!monthlyProduct?.listPrice || !annualProduct?.listPrice) {
  throw new Error(
    "cozya_pro_monthly e cozya_pro_annual precisam ter listPrice em packages/config/src/products.ts",
  );
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const monthlyCents = monthlyProduct.listPrice.amountCents;
const annualCents = annualProduct.listPrice.amountCents;
const annualMonthlyEquivalentCents = Math.round(annualCents / 12);
export const ANNUAL_SAVINGS_PCT = Math.round((1 - annualCents / (monthlyCents * 12)) * 100);
export const ANNUAL_TOTAL = BRL.format(annualCents / 100);
export const ANNUAL_SAVINGS = BRL.format((monthlyCents * 12 - annualCents) / 100);

export const PRICING: Record<
  BillingCycle,
  { price: string; period: string; note: string; tabLabel: string }
> = {
  monthly: {
    price: BRL.format(monthlyCents / 100),
    period: "/mês",
    note: "cobrado mensalmente",
    tabLabel: "Mensal",
  },
  annual: {
    price: BRL.format(annualMonthlyEquivalentCents / 100),
    period: "/mês",
    note: `${BRL.format(annualCents / 100)} por ano. Economize ${ANNUAL_SAVINGS_PCT}%`,
    tabLabel: "Anual",
  },
};

/** Maps the marketing query param `?cycle=mensal|anual` to internal cycle id. */
export function parseCycleQueryParam(value: string | undefined): BillingCycle {
  return value === "anual" || value === "annual" ? "annual" : "monthly";
}
