import type { Olympiad } from "../content/types";

/** Constantes da competição sem dependências pesadas: seguras para o navegador. */
export type Area = "matematica" | "financeira";
export const areas: Record<Area, { nome: string; fonte: string; linhas: Olympiad[] }> = {
  matematica: {
    nome: "Matemática",
    fonte: "Perguntas no estilo Canguru e OBMEP",
    linhas: ["canguru", "obmep"],
  },
  financeira: {
    nome: "Financeira",
    fonte: "Perguntas no estilo OLITEF, a partir do 6º ano",
    linhas: ["olitef"],
  },
};

export const PONTOS = { problema: 1, desafio: 3 } as const;
/** Folga para a rede: a resposta que chega até 1,5 s depois do fim ainda vale. */
export const FOLGA_MS = 1500;
export const LIMITES = {
  problemas: { min: 0, max: 20 },
  desafios: { min: 0, max: 3 },
  segundosProblema: [20, 30, 45, 60, 90, 120, 180, 300],
  segundosDesafio: [60, 120, 180, 300, 480, 600, 900],
  competidores: { min: 1, max: 6 },
} as const;
