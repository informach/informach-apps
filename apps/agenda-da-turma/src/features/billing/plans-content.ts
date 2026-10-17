import { findProduct } from "@informach/config";
import { FREE_ACTIVITY_LIMIT } from "@/features/activities/limits";
import { FREE_NOTICE_TRIAL } from "@/features/notices/trial-reserve";
import { FREE_STUDENT_PROFILE_LIMIT, PRO_STUDENT_PROFILE_LIMIT } from "@/features/students/limits";

export type BillingCycle = "monthly" | "annual";

export type PlanFeature = { label: string; included: boolean };

// Preços e franquias derivados de `packages/config/src/products.ts` e dos
// limites do app: fonte oficial. Divergência entre UI e Stripe Dashboard é bug
// (root CLAUDE.md §8.1), e um número escrito à mão aqui é o jeito de criá-la.
const monthlyProduct = findProduct("agenda_da_turma_pro_monthly");
const annualProduct = findProduct("agenda_da_turma_pro_annual");
const smallestPack = findProduct("agenda_da_turma_credits_10");
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

/** Recados lidos por mês no Pro: o bônus mensal do catálogo, 1 crédito por leitura. */
export const PRO_READS_PER_MONTH = monthlyProduct.bonusCreditsPerMonth ?? 0;
/** Recados de teste do grátis, que não renovam. */
export const FREE_TRIAL_READS = FREE_NOTICE_TRIAL;
/**
 * Adultos com login próprio no Pro: quem assina e um adulto convidado (a casa
 * tem um segundo adulto, `agenda.family_members`, não uma lista).
 */
export const PRO_ADULTS = 2;
/**
 * Leituras que um ditado gasta: transcrever e ler o texto são duas chamadas de
 * um crédito (ver `AGENDA_PRICING_SEED`).
 */
export const DICTATION_READS = 2;
const NUMBER_WORDS: Record<number, string> = { 2: "dois", 3: "três" };
/** "ditado conta como dois", a ressalva das leituras em toda a interface. */
export const DICTATION_NOTE = `ditado conta como ${NUMBER_WORDS[DICTATION_READS] ?? DICTATION_READS}`;
/**
 * Quantos meses do mensal o anual custa, quando a conta é exata (R$ 199 é dez
 * vezes R$ 19,90). Se o catálogo mudar e a conta deixar de fechar, a frase
 * "pague 10 meses, use 12" some em vez de mentir.
 */
export const ANNUAL_MONTHS_PAID =
  annualCents % monthlyCents === 0 ? annualCents / monthlyCents : null;
/** O pacote de leituras mais barato, para "dá para comprar mais a partir de". */
export const SMALLEST_PACK_PRICE = smallestPack?.listPrice
  ? BRL.format(smallestPack.listPrice.amountCents / 100)
  : null;

export const FREE_FEATURES: PlanFeature[] = [
  {
    label: `${FREE_STUDENT_PROFILE_LIMIT} criança, com até ${FREE_ACTIVITY_LIMIT} atividades em aberto`,
    included: true,
  },
  {
    label: `${FREE_TRIAL_READS} recados lidos pela Agenda para experimentar. Não renovam.`,
    included: true,
  },
  { label: "Recebe o que a turma manda", included: true },
  { label: "Hoje, semana, plano de estudo e a vez da criança", included: true },
  { label: "Resumos, lembretes e segundo adulto", included: false },
];
export const PRO_FEATURES: PlanFeature[] = [
  {
    label: `Até ${PRO_STUDENT_PROFILE_LIMIT} crianças, sem limite de atividades em aberto`,
    included: true,
  },
  {
    label: `${PRO_ADULTS} adultos, cada um com seu login, vendo as crianças que você escolher`,
    included: true,
  },
  {
    label: `${PRO_READS_PER_MONTH} recados lidos por mês (${DICTATION_NOTE})`,
    included: true,
  },
  { label: "Resumo do dia e da semana, e lembretes no celular", included: true },
  { label: "Mandar atividades para a turma", included: true },
  { label: "A agenda no calendário do celular e a semana para imprimir", included: true },
];

export const PRICING: Record<
  BillingCycle,
  { price: string; period: string; note: string; tabLabel: string }
> = {
  monthly: {
    price: BRL.format(monthlyCents / 100),
    period: "/mês",
    note: "Cobrado todo mês.",
    tabLabel: "Mensal",
  },
  annual: {
    price: BRL.format(annualCents / 100),
    period: "/ano",
    note: `Cobrado anualmente. Equivale a ${BRL.format(annualMonthlyEquivalentCents / 100)} por mês, ${BRL.format((monthlyCents * 12 - annualCents) / 100)} a menos no ano.`,
    tabLabel: ANNUAL_MONTHS_PAID ? `Anual: pague ${ANNUAL_MONTHS_PAID} meses, use 12` : "Anual",
  },
};

/** Maps the marketing query param `?cycle=mensal|anual` to internal cycle id. */
export function parseCycleQueryParam(value: string | undefined): BillingCycle {
  return value === "anual" || value === "annual" ? "annual" : "monthly";
}
