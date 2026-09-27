import type { TrackDefinition } from "../types";

/**
 * Onda 3b (3ª série do EM): Canguru S. Compartilha contagem e probabilidade
 * com a OBMEP N3 e acrescenta equações, trigonometria, geometria espacial e
 * lógica. As duas primeiras missões de equações são gratuitas.
 *
 * O seed foi escolhido com `tools/seed-search.tool.ts`.
 */
export const wave3bTracks: TrackDefinition[] = [
  {
    id: "canguru-s",
    title: "Integrar e explicar",
    label: "Canguru · S",
    olympiad: "canguru",
    level: "S",
    grades: [12],
    bankSeed: 466,
    description:
      "Equações, trigonometria, espaço, contagem, probabilidade e lógica em problemas de síntese.",
    skills: [
      "equacoes-em",
      "trigonometria",
      "espaco",
      "combinacoes",
      "probabilidade-em",
      "logica-em",
    ],
  },
];
