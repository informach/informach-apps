import { COMPASSO_POLICY } from "@informach/config/collections";

export type BillingCycle = "monthly" | "annual";

export const MONTHLY_CREDITS = COMPASSO_POLICY.ai.monthlyCredits;

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const monthlyCents = COMPASSO_POLICY.monthlyAmountCents;
const annualCents = COMPASSO_POLICY.annualAmountCents;
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
