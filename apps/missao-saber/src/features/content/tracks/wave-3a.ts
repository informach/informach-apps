import type { TrackDefinition } from "../types";

/**
 * Onda 3a (ensino médio): OBMEP N3 e Canguru J. As duas primeiras missões de
 * funções são gratuitas para a faixa.
 *
 * Seeds: OBMEP N3 em 416 (próximo livre depois de Mirim 2 em 391, contando o
 * simulado em seed + 101); Canguru J em 444, escolhido com
 * `tools/seed-search.tool.ts` para que nenhum banco repita uma questão de
 * outro nas quatro habilidades compartilhadas (445 repetia duas).
 */
export const wave3aTracks: TrackDefinition[] = [
  {
    id: "obmep-n3",
    title: "Estruturas e demonstrações",
    label: "OBMEP · Nível 3",
    olympiad: "obmep",
    level: "N3",
    grades: [10, 11, 12],
    bankSeed: 416,
    description: "Funções, sequências, números, geometria, contagem, probabilidade e provas.",
    skills: [
      "funcoes",
      "recorrencias",
      "estruturas-numericas",
      "geometria-plana",
      "combinacoes",
      "probabilidade-em",
      "argumentacao-em",
    ],
  },
  {
    id: "canguru-j",
    title: "Relacionar e comparar",
    label: "Canguru · J",
    olympiad: "canguru",
    level: "J",
    grades: [10, 11],
    bankSeed: 444,
    description: "Funções, polinômios, sequências, indução, contagem, geometria e coordenadas.",
    skills: [
      "funcoes",
      "recorrencias",
      "combinacoes",
      "geometria-plana",
      "polinomios",
      "inducao",
      "coordenadas-em",
    ],
  },
];
