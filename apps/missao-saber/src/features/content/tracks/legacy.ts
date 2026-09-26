import type { TrackDefinition } from "../types";

/**
 * As quatro trilhas de 6º/7º publicadas em 13/09/2026.
 *
 * `bankSeed` é a base das questões reservadas: diagnóstico usa `base + i`,
 * simulado `base + 101 + i`, e a numeração exibida `base + 1` e `base + 13`.
 * Os valores reproduzem o deslocamento original de cada trilha; trocar um
 * deles mudaria as 24 questões reservadas dela e quebraria a revisão.
 */
export const legacyTracks: TrackDefinition[] = [
  {
    id: "olitef-n1",
    title: "Dinheiro com propósito",
    label: "OLITEF · Nível 1",
    olympiad: "olitef",
    level: "N1",
    grades: [6, 7],
    bankSeed: 0,
    description: "Frações, escolhas de consumo e planejamento financeiro.",
    skills: ["fracoes", "porcentagem", "precos", "orcamento", "probabilidade"],
  },
  {
    id: "canguru-e",
    title: "Olhar de explorador",
    label: "Canguru · E",
    olympiad: "canguru",
    level: "E",
    grades: [6],
    bankSeed: 24,
    description: "Formas, padrões e problemas que convidam a experimentar.",
    skills: ["fracoes", "medidas", "simetria", "padroes", "contagem", "logica"],
    maximumLayers: 4,
  },
  {
    id: "canguru-b",
    title: "Conectar ideias",
    label: "Canguru · B",
    olympiad: "canguru",
    level: "B",
    grades: [7, 8],
    bankSeed: 48,
    description: "Conexões entre geometria, contagem e argumentos.",
    skills: ["fracoes", "medidas", "simetria", "contagem", "paridade", "probabilidade", "logica"],
  },
  {
    id: "obmep-n1",
    title: "Pensar além da conta",
    label: "OBMEP · Nível 1",
    olympiad: "obmep",
    level: "N1",
    grades: [6, 7],
    bankSeed: 72,
    description: "Estratégias, casos e justificativas para resolver problemas.",
    skills: ["fracoes", "paridade", "padroes", "contagem", "gavetas", "medidas", "logica"],
  },
];
