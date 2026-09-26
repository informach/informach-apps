import type { TrackDefinition } from "../types";

/**
 * Onda 4 (2º e 3º ano): Mirim 1. Contar, formas, sequências, medidas e
 * problemas resolvidos com desenho, com texto curto e leitura que pode ser
 * acompanhada por um adulto. As duas primeiras missões de contar e
 * comparar são gratuitas.
 *
 * O seed foi escolhido com `tools/seed-search.tool.ts`.
 */
export const wave4Tracks: TrackDefinition[] = [
  {
    id: "mirim-1",
    title: "Contar e explicar",
    label: "OBMEP Mirim · 1",
    olympiad: "mirim",
    level: "M1",
    grades: [2, 3],
    bankSeed: 504,
    description:
      "Contar e comparar, formas e posições, sequências, medidas e problemas com desenho.",
    skills: [
      "contar-e-comparar",
      "formas-e-posicoes",
      "sequencias-iniciais",
      "medir-e-comparar",
      "problemas-com-desenho",
    ],
  },
];
