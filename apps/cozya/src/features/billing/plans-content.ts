import { findProduct } from "@informach/config";

export type BillingCycle = "monthly" | "annual";

export type PlanFeature = { label: string; included: boolean };

export const FREE_FEATURES: PlanFeature[] = [
  { label: "Cadastro manual de receitas", included: true },
  { label: "Busca por nome e favoritos", included: true },
  { label: "Compartilhar pelo WhatsApp", included: true },
  { label: "Uso direto no navegador do celular", included: true },
  { label: "Até 15 receitas no acervo gratuito", included: true },
  { label: "Teste: 3 operações de IA e 14 dias de planejamento", included: true },
  { label: "Preparo e listas já criadas continuam acessíveis", included: true },
];

export const PRO_FEATURES: PlanFeature[] = [
  { label: "Planejamento semanal com porções e marmitas", included: true },
  { label: "Lista de compras somada por ingredientes compatíveis", included: true },
  { label: "Repetir a semana e acompanhar o preparo", included: true },
  { label: "Receitas ilimitadas", included: true },
  { label: "Captura por voz, foto e texto", included: true },
  { label: "Geração com busca na web", included: true },
  { label: "50 créditos de IA renovados todo mês", included: true },
  { label: "Pacotes extras avulsos quando precisar", included: true },
];

// Preços derivados de `packages/config/src/products.ts` — fonte oficial.
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
    note: `${BRL.format(annualCents / 100)}/ano. Economize ~${ANNUAL_SAVINGS_PCT}%`,
    tabLabel: "Anual",
  },
};

/** Maps the marketing query param `?cycle=mensal|anual` to internal cycle id. */
export function parseCycleQueryParam(value: string | undefined): BillingCycle {
  return value === "anual" || value === "annual" ? "annual" : "monthly";
}
