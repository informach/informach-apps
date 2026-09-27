import type { TrackDefinition } from "../types";

/**
 * Onda 2 (3º ao 5º): Canguru P e Mirim 2. Canguru E passa a cobrir 5º e 6º.
 * As duas primeiras missões de contagem são gratuitas para a faixa.
 *
 * Os seeds seguem de 24 em 24 enquanto os intervalos de diagnóstico e de
 * simulado (seed + 101) não se cruzam; Mirim 2 pula para 391 porque 296 cairia
 * dentro do simulado de OBMEP N2, e 391 mantém a diferença para Canguru P (119)
 * fora dos múltiplos pequenos usados nos geradores compartilhados.
 */
export const wave2Tracks: TrackDefinition[] = [
  {
    id: "canguru-p",
    title: "Descobrir brincando",
    label: "Canguru · P",
    olympiad: "canguru",
    level: "P",
    grades: [3, 4],
    bankSeed: 272,
    description: "Contar, observar padrões, localizar, montar figuras, medir e escolher caminhos.",
    skills: [
      "contagem-inicial",
      "padroes-iniciais",
      "orientacao-espacial",
      "composicao-de-figuras",
      "tempo-e-medidas",
      "balancas",
      "caminhos",
    ],
  },
  {
    id: "mirim-2",
    title: "Pensar com desenho",
    label: "OBMEP Mirim · Nível 2",
    olympiad: "mirim",
    level: "M2",
    grades: [4, 5],
    bankSeed: 391,
    description:
      "Contagem, figuras, orientação, padrões, medidas e tabelas para explicar com desenho.",
    skills: [
      "contagem-inicial",
      "composicao-de-figuras",
      "orientacao-espacial",
      "padroes-iniciais",
      "tempo-e-medidas",
      "tabelas",
    ],
  },
];
