import type { TrackDefinition } from "../types";

/**
 * Onda 3c (ensino médio): OLITEF N3. Modelos, equivalência temporal, renda
 * fixa, renda variável e cenários, sempre com premissas declaradas e sem
 * recomendação financeira pessoal. As duas primeiras missões de modelos
 * financeiros são gratuitas.
 *
 * O seed foi escolhido com `tools/seed-search.tool.ts`.
 */
export const wave3cTracks: TrackDefinition[] = [
  {
    id: "olitef-n3",
    title: "Analisar com premissas",
    label: "OLITEF · Nível 3",
    olympiad: "olitef",
    level: "N3",
    grades: [10, 11, 12],
    bankSeed: 478,
    description:
      "Modelos financeiros, dinheiro no tempo, renda fixa e variável e análise de cenários.",
    skills: [
      "modelos-financeiros",
      "equivalencia-temporal",
      "renda-fixa",
      "renda-variavel",
      "cenarios",
    ],
  },
];
