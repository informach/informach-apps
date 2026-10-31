import { isProductKey, type ProductKey } from "@/lib/products";

/** Abas de Produtos: os cinco apps com conta, o site e o Sistema Zero. */
export const PRODUCT_TABS = [
  "cozya",
  "agenda-da-turma",
  "missao-saber",
  "bora-treinar",
  "edi",
  "site",
  "sistema-zero",
] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

export const TAB_LABEL: Record<ProductTab, string> = {
  cozya: "Cozya",
  "agenda-da-turma": "Agenda da Turma",
  "missao-saber": "Missão Saber",
  "bora-treinar": "Bora Treinar",
  edi: "Suíte Edi",
  site: "Site",
  "sistema-zero": "Sistema Zero",
};

export function parseTab(value: string | string[] | undefined): ProductTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return PRODUCT_TABS.includes(raw as ProductTab) ? (raw as ProductTab) : "cozya";
}

export function tabProduct(tab: ProductTab): ProductKey | null {
  return isProductKey(tab) ? tab : null;
}

export type FunnelStep = {
  label: string;
  value: number;
  /**
   * Com quem o passo se compara. "previous" só quando o passo é parte do
   * anterior (quem confirmou o e-mail tem conta); "first" quando não é (quem
   * assinou um dia pode não ter usado nesta semana).
   */
  comparedTo?: "previous" | "first";
};
export type FunnelBar = FunnelStep & {
  /** Largura em porcentagem do primeiro passo; nunca some de todo. */
  width: number;
  /** "92% do passo anterior", "40% de quem tem conta"; null sem base ou acima de 100%. */
  share: { value: number; text: string } | null;
};

export function funnelBars(steps: FunnelStep[]): FunnelBar[] {
  const top = steps[0]?.value ?? 0;
  return steps.map((step, index) => {
    const first = (step.comparedTo ?? "previous") === "first";
    const base = index === 0 ? null : first ? top : (steps[index - 1]?.value ?? 0);
    // Passo maior que a base quer dizer que não é parte dela: a fração passaria
    // de 100% e enganaria, então fica de fora.
    const share =
      base === null || base <= 0 || step.value > base
        ? null
        : { value: step.value / base, text: first ? "de quem tem conta" : "do passo anterior" };
    return {
      ...step,
      width: top <= 0 ? 4 : Math.max(4, Math.min(100, Math.round((step.value / top) * 100))),
      share,
    };
  });
}
