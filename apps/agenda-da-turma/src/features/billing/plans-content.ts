import { COMPASSO_POLICY } from "@informach/config/collections";
import { FREE_ACTIVITY_LIMIT } from "@/features/activities/limits";
export type BillingCycle = "monthly" | "annual";
export type PlanFeature = { label: string; included: boolean };
export const TRIAL_DAYS = COMPASSO_POLICY.trialDays;
export const TRIAL_CREDITS = COMPASSO_POLICY.ai.trialCredits;
const brl = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export const SMALLEST_PACK_PRICE = brl(COMPASSO_POLICY.ai.packs[0].amountCents);
export const FREE_FEATURES: PlanFeature[] = [
  { label: `1 criança e até ${FREE_ACTIVITY_LIMIT} atividades em aberto`, included: true },
  { label: "Atividades manuais, calendário e histórico", included: true },
  { label: "Receber atividades da turma", included: true },
  { label: "IA usa o saldo compartilhado da família", included: true },
];
export const COMPASSO_FEATURES: PlanFeature[] = [
  { label: "Todos os apps web do Compasso, incluindo os próximos lançamentos", included: true },
  {
    label: `Até ${COMPASSO_POLICY.capacity.adults} adultos e ${COMPASSO_POLICY.capacity.dependents} dependentes, com permissões por pessoa e app`,
    included: true,
  },
  {
    label: `${COMPASSO_POLICY.ai.monthlyCredits} créditos de IA por mês, compartilhados entre os apps e sem acumular`,
    included: true,
  },
  { label: "Atividades sem limite, lembretes e compartilhamento com a turma", included: true },
  { label: "Recargas sem vencimento; custo informado antes do uso", included: true },
];
export const PRICING = {
  monthly: {
    price: brl(COMPASSO_POLICY.monthlyAmountCents),
    periodWords: "por mês",
    tabLabel: "Mensal",
    landingNote: "Cobrado mensalmente.",
  },
  annual: {
    price: brl(COMPASSO_POLICY.annualAmountCents),
    periodWords: "por ano",
    tabLabel: "Anual",
    landingNote: `Cobrado uma vez por ano. Equivale a ${brl(Math.round(COMPASSO_POLICY.annualAmountCents / 12))} por mês.`,
  },
} satisfies Record<
  BillingCycle,
  { price: string; periodWords: string; tabLabel: string; landingNote: string }
>;
export function parseCycleQueryParam(value: string | undefined): BillingCycle {
  return value === "anual" || value === "annual" ? "annual" : "monthly";
}
export function compassoOfferHref(cycle: BillingCycle) {
  return `/upgrade?cycle=${cycle === "annual" ? "anual" : "mensal"}`;
}
