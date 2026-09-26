import type { TrackDefinition } from "../types";

/**
 * Onda 1a (8º/9º): OBMEP N2 e Canguru C, publicadas em 26/09/2026.
 * As duas primeiras missões de proporção são gratuitas para a faixa.
 */
export const wave1Tracks: TrackDefinition[] = [
  {
    id: "obmep-n2",
    title: "Provar e generalizar",
    label: "OBMEP · Nível 2",
    olympiad: "obmep",
    level: "N2",
    grades: [8, 9],
    bankSeed: 200,
    description: "Restos, equações, semelhança e argumentos que fecham um problema.",
    skills: [
      "proporcao",
      "restos",
      "equacoes",
      "semelhanca",
      "pitagoras",
      "contagem-casos",
      "invariantes",
    ],
  },
  {
    id: "canguru-c",
    title: "Descobrir a relação",
    label: "Canguru · C",
    olympiad: "canguru",
    level: "C",
    grades: [9],
    bankSeed: 224,
    description: "Razões, equações, plano cartesiano e lógica em problemas de várias etapas.",
    skills: ["proporcao", "equacoes", "semelhanca", "contagem-casos", "coordenadas", "logica-n2"],
  },
];
