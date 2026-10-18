import { findProduct } from "@informach/config";
import { TRIAL_CREDITS, TRIAL_DAYS } from "@/features/kitchen/trial";
import { FREE_RECIPE_LIMIT } from "@/features/recipes/limits";

export type BillingCycle = "monthly" | "annual";

export type PlanFeature = { label: string; included: boolean };

// Preços e créditos derivados de `packages/config/src/products.ts`, a fonte oficial.
// Divergência entre UI e Stripe Dashboard é bug (root CLAUDE.md §8.1).
const monthlyProduct = findProduct("cozya_pro_monthly");
const annualProduct = findProduct("cozya_pro_annual");
if (!monthlyProduct?.listPrice || !annualProduct?.listPrice) {
  throw new Error(
    "cozya_pro_monthly e cozya_pro_annual precisam ter listPrice em packages/config/src/products.ts",
  );
}
// The annual plan releases the same credits every month: the copy says one number for both.
if (
  !monthlyProduct.bonusCreditsPerMonth ||
  monthlyProduct.bonusCreditsPerMonth !== annualProduct.bonusCreditsPerMonth
) {
  throw new Error(
    "cozya_pro_monthly e cozya_pro_annual precisam do mesmo bonusCreditsPerMonth em packages/config/src/products.ts",
  );
}
/** Credits of the Pro every month, also on the annual plan. */
export const PRO_MONTHLY_CREDITS = monthlyProduct.bonusCreditsPerMonth;

export const FREE_FEATURES: PlanFeature[] = [
  {
    label: `${TRIAL_DAYS} dias para planejar, com ${TRIAL_CREDITS} créditos de IA, sem cartão`,
    included: true,
  },
  { label: `Até ${FREE_RECIPE_LIMIT} receitas escritas do seu jeito`, included: true },
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
  { label: `${PRO_MONTHLY_CREDITS} créditos de IA por mês, também no anual`, included: true },
  { label: "Créditos extras quando precisar", included: true },
];

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const monthlyCents = monthlyProduct.listPrice.amountCents;
const annualCents = annualProduct.listPrice.amountCents;
const annualMonthlyEquivalentCents = Math.round(annualCents / 12);
export const ANNUAL_SAVINGS_PCT = Math.round((1 - annualCents / (monthlyCents * 12)) * 100);
export const ANNUAL_SAVINGS = BRL.format((monthlyCents * 12 - annualCents) / 100);

/** "R$ 149" and "R$ 14,90": the cents only when there are cents, as a price tag reads. */
function wholePrice(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
export const WHOLE_PRICES = {
  monthly: wholePrice(monthlyCents),
  annual: wholePrice(annualCents),
} as const;

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
