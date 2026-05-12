import { findProduct } from "@informach/config";

export type BillingCycle = "monthly" | "annual";

export type PlanFeature = { label: string; included: boolean };

export const FREE_FEATURES: PlanFeature[] = [
  { label: "Cadastro manual de tarefas e provas", included: true },
  { label: "Visualização por dia, semana e mês", included: true },
  { label: "Notificações de prazos próximos", included: true },
  { label: "Uso direto no navegador do celular", included: true },
  { label: "70 créditos de IA por mês", included: false },
  { label: "Pacotes extras avulsos quando precisar", included: false },
];

export const PRO_FEATURES: PlanFeature[] = [
  { label: "Tudo do Free, sem limites", included: true },
  { label: "70 créditos de IA renovados todo mês", included: true },
  { label: "Pacotes extras avulsos quando precisar", included: true },
  { label: "Suporte prioritário por e-mail", included: true },
];

// Preços derivados de `packages/config/src/products.ts` — fonte oficial.
// Divergência entre UI e Stripe Dashboard é bug (root CLAUDE.md §8.1).
const monthlyProduct = findProduct("agenda_da_turma_pro_monthly");
const annualProduct = findProduct("agenda_da_turma_pro_annual");
if (!monthlyProduct?.listPrice || !annualProduct?.listPrice) {
  throw new Error(
    "agenda_da_turma_pro_monthly e agenda_da_turma_pro_annual precisam ter listPrice em packages/config/src/products.ts",
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
    note: `${BRL.format(annualCents / 100)}/ano. Economize ~${ANNUAL_SAVINGS_PCT}%`,
    tabLabel: "Anual",
  },
};

/** Maps the marketing query param `?cycle=mensal|anual` to internal cycle id. */
export function parseCycleQueryParam(value: string | undefined): BillingCycle {
  return value === "anual" || value === "annual" ? "annual" : "monthly";
}
