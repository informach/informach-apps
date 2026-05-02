export type BillingCycle = "monthly" | "annual";

export type PlanFeature = { label: string; included: boolean };

export const FREE_FEATURES: PlanFeature[] = [
  { label: "Cadastro manual de receitas", included: true },
  { label: "Busca por nome e favoritos", included: true },
  { label: "Compartilhar pelo WhatsApp", included: true },
  { label: "Uso direto no navegador do celular", included: true },
  { label: "Limite mensal de receitas salvas", included: true },
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

/* TODO: trocar pelos preços reais quando definidos pelo time de billing */
export const PRICING: Record<
  BillingCycle,
  { price: string; period: string; note: string; tabLabel: string }
> = {
  monthly: {
    price: "R$ 19",
    period: "/mês",
    note: "cobrado mensalmente",
    tabLabel: "Mensal",
  },
  annual: {
    price: "R$ 15",
    period: "/mês",
    note: "R$ 180/ano — economize ~20%",
    tabLabel: "Anual",
  },
};

/** Maps the marketing query param `?cycle=mensal|anual` to internal cycle id. */
export function parseCycleQueryParam(value: string | undefined): BillingCycle {
  return value === "anual" || value === "annual" ? "annual" : "monthly";
}
