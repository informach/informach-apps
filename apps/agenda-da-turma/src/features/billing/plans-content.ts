import { findProduct } from "@informach/config";

export type BillingCycle = "monthly" | "annual";

export type PlanFeature = { label: string; included: boolean };

export const FREE_FEATURES: PlanFeature[] = [
  { label: "1 criança e até 20 pendências próprias", included: true },
  { label: "5 importações de recados por conta verificada", included: true },
  { label: "Receber atividades da turma gratuitamente", included: true },
  { label: "Rotina, calendário e histórico preservado", included: true },
  { label: "Dois adultos, resumo e lembretes", included: false },
];
export const PRO_FEATURES: PlanFeature[] = [
  { label: "Até 3 crianças e 2 adultos com logins próprios", included: true },
  { label: "Providências sem o limite de 20 pendências", included: true },
  { label: "70 créditos por mês: 1 por recado de texto, foto ou PDF", included: true },
  { label: "Resumo por e-mail, lembretes e push compatível", included: true },
  { label: "Responsáveis por criança e repetição semanal", included: true },
  { label: "Compartilhar com a turma e calendário pessoal", included: true },
  { label: "Exportar agenda em PDF; cadastro por voz usa 2 créditos", included: true },
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
    price: BRL.format(annualCents / 100),
    period: "/ano",
    note: `Cobrado anualmente. Equivale a ${BRL.format(annualMonthlyEquivalentCents / 100)}/mês. Economia de ${BRL.format((monthlyCents * 12 - annualCents) / 100)} por ano em relação ao mensal (~${ANNUAL_SAVINGS_PCT}%).`,
    tabLabel: "Anual",
  },
};

/** Maps the marketing query param `?cycle=mensal|anual` to internal cycle id. */
export function parseCycleQueryParam(value: string | undefined): BillingCycle {
  return value === "anual" || value === "annual" ? "annual" : "monthly";
}
