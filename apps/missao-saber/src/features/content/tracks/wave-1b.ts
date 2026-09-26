import type { TrackDefinition } from "../types";

/**
 * Onda 1b (8º/9º): OLITEF N2, que compartilha proporção com a onda 1a e
 * acrescenta as cinco habilidades de educação financeira.
 */
export const wave1bTracks: TrackDefinition[] = [
  {
    id: "olitef-n2",
    title: "Dinheiro no tempo",
    label: "OLITEF · Nível 2",
    olympiad: "olitef",
    level: "N2",
    grades: [8, 9],
    bankSeed: 248,
    description:
      "Porcentagem, juros, orçamento, inflação e investimentos para decidir com números.",
    skills: ["proporcao", "porcentagem-n2", "juros", "orcamento-n2", "inflacao", "investimentos"],
  },
];
