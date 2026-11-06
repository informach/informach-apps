/**
 * Os planos como a tela os mostra, calculados do catálogo (`@informach/config`), nunca escritos à
 * mão: o anual aparece pelo valor por mês e pelos meses que ele dá de graça.
 */
export interface ProdutoDoCatalogo {
  id: string;
  tier?: string;
  interval?: string;
  listPrice?: { amountCents: number } | null;
}

export type TierPago = "individual" | "family";

export interface Oferta {
  tier: TierPago;
  mensal: { id: string; centavos: number };
  anual: { id: string; centavos: number; porMes: number; mesesGratis: number };
}

/** Individual primeiro: a maioria treina sozinha; a Família é a mesma assinatura com mais perfis. */
const ORDEM: TierPago[] = ["individual", "family"];

export function ofertas(produtos: readonly ProdutoDoCatalogo[]): Oferta[] {
  return ORDEM.flatMap((tier) => {
    const mensal = produtos.find((p) => p.tier === tier && p.interval === "month");
    const anual = produtos.find((p) => p.tier === tier && p.interval === "year");
    const m = mensal?.listPrice?.amountCents;
    const a = anual?.listPrice?.amountCents;
    if (!mensal || !anual || !m || !a) return [];
    return [
      {
        tier,
        mensal: { id: mensal.id, centavos: m },
        anual: {
          id: anual.id,
          centavos: a,
          porMes: Math.round(a / 12),
          // quantos meses do mensal o anual deixa de cobrar (R$ 24,90 × 12 − R$ 249 = 2 meses)
          mesesGratis: Math.max(0, Math.round((m * 12 - a) / m)),
        },
      },
    ];
  });
}

export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Por que a pessoa chegou aos planos: abre a folha dizendo o que ela tentou usar. */
export const MOTIVOS = {
  camera: {
    chamada: "Você tocou em contar pela câmera",
    titulo: "A câmera conta por você.",
  },
  treino: { chamada: "Este treino é da assinatura", titulo: "Todos os 15 treinos, no seu ritmo." },
  niveis: {
    chamada: "Subir de nível é da assinatura",
    titulo: "Os níveis acompanham você.",
  },
  perfis: {
    chamada: "Mais perfis no plano Família",
    titulo: "Cada um da casa no seu perfil.",
  },
  editor: { chamada: "Montar treinos é da assinatura", titulo: "Monte o treino do seu jeito." },
  desafio: { chamada: "O desafio da semana é da assinatura", titulo: "Um desafio por semana." },
  tv: {
    chamada: "O celular como câmera é da assinatura",
    titulo: "A TV mostra, o celular conta.",
  },
  historico: { chamada: "O histórico completo é da assinatura", titulo: "Todo o seu histórico." },
  geral: { chamada: "Planos do Bora Treinar", titulo: "Treine com tudo liberado." },
} as const;

export type Motivo = keyof typeof MOTIVOS;
export const ehMotivo = (m: string | undefined): m is Motivo => !!m && m in MOTIVOS;
