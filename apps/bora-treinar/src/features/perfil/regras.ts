import { CHAINS } from "@/features/treino/catalog/catalog";
import type { Intensidade } from "@/features/treino/catalog/workouts";
import type { ProgressMap } from "@/features/treino/engine/progression";

/**
 * Primeiro acesso de um perfil: três perguntas, nada de idade, peso ou saúde. O ritmo decide a
 * intensidade e os níveis de partida de cada trilha; o tempo e os dias guiam o treino do dia e a
 * meta da semana.
 */
export const RITMOS = [
  {
    id: "comecando",
    titulo: "Começando agora",
    texto: "Movimentos sem salto e metas menores para pegar o jeito.",
    intensidade: "leve",
    nivel: 0,
  },
  {
    id: "as-vezes",
    titulo: "Já treino às vezes",
    texto: "O ritmo padrão, um nível acima nas trilhas.",
    intensidade: "normal",
    nivel: 1,
  },
  {
    id: "sempre",
    titulo: "Treino sempre",
    texto: "Metas um pouco maiores e dois níveis acima.",
    intensidade: "forte",
    nivel: 2,
  },
] as const satisfies readonly {
  id: string;
  titulo: string;
  texto: string;
  intensidade: Intensidade;
  nivel: number;
}[];

export type Ritmo = (typeof RITMOS)[number]["id"];
export const RITMO_IDS = RITMOS.map((r) => r.id) as [Ritmo, ...Ritmo[]];
export const MINUTOS = [10, 20, 30] as const;
export const META_PADRAO = 3;

export const ritmoPorId = (id: Ritmo) => RITMOS.find((r) => r.id === id) ?? RITMOS[0];

/** O ritmo que corresponde a uma intensidade gravada (para editar o perfil depois). */
export const ritmoDaIntensidade = (i: Intensidade): Ritmo =>
  (RITMOS.find((r) => r.intensidade === i) ?? RITMOS[1]).id;

/** Níveis de partida: o nível do ritmo, sem passar do último de cada trilha. */
export function niveisIniciais(ritmo: Ritmo): ProgressMap {
  const { nivel } = ritmoPorId(ritmo);
  return Object.fromEntries(
    CHAINS.map((c) => [
      c.id,
      { level: Math.min(nivel, c.levels.length - 1), bonus: 0, streak: 0, struggle: 0 },
    ]),
  );
}
