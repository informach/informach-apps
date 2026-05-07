import { findProduct } from "@informach/config";

export type BillingCycle = "monthly" | "annual";

export type PlanFeature = { label: string; included: boolean };

export const FREE_FEATURES: PlanFeature[] = [
  { label: "Cadastro manual de receitas", included: true },
  { label: "Busca por nome e favoritos", included: true },
  { label: "Compartilhar pelo WhatsApp", included: true },
  { label: "Uso direto no navegador do celular", included: true },
  { label: "Limite vitalício de 15 receitas salvas", included: true },
  { label: "Importação por imagem, câmera e voz", included: false },
  { label: "Geração de receita por título com IA", included: false },
];

export const PRO_FEATURES: PlanFeature[] = [
  { label: "Tudo do plano Free", included: true },
  { label: "Receitas ilimitadas", included: true },
  { label: "Importação por imagem, texto e câmera", included: true },
  { label: "Geração por título com IA", included: true },
  { label: "Ditado por voz", included: true },
  { label: "Créditos de IA renovados todo mês", included: true },
  { label: "Compre créditos extras avulsos quando precisar", included: true },
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
    note: `${BRL.format(annualCents / 100)}/ano — economize ~${ANNUAL_SAVINGS_PCT}%`,
    tabLabel: "Anual",
  },
};

/** Maps the marketing query param `?cycle=mensal|anual` to internal cycle id. */
export function parseCycleQueryParam(value: string | undefined): BillingCycle {
  return value === "anual" || value === "annual" ? "annual" : "monthly";
}
