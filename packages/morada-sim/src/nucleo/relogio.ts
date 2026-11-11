import type { Relogio } from "../dominio/tipos";

/**
 * O relógio do mundo. O tempo é o número do tick: um tick é sempre o mesmo
 * pedaço de tempo de jogo, e acelerar é dar mais ticks por segundo real. O
 * estado no tick N não depende da velocidade em que se chegou lá.
 */

export const PASSO_MS = 100;
export const MS_DE_JOGO_POR_TICK = 3000;
export const DIA_MS = 24 * 60 * 60 * 1000;
/** Um mundo novo começa às 8 da manhã do primeiro dia. */
export const INICIO_DO_MUNDO_MS = 8 * 60 * 60 * 1000;

/** Tempo de jogo desde a meia-noite do primeiro dia. */
export function tempoDeJogoMs(relogio: Relogio): number {
  return INICIO_DO_MUNDO_MS + relogio.tick * relogio.msDeJogoPorTick;
}

/** Dia de jogo, começando em 1. */
export function diaDeJogo(relogio: Relogio): number {
  return Math.floor(tempoDeJogoMs(relogio) / DIA_MS) + 1;
}

/** Milissegundos desde a meia-noite do dia de jogo. */
export function horaDoDiaMs(relogio: Relogio): number {
  return tempoDeJogoMs(relogio) % DIA_MS;
}

export function ticksPorDia(relogio: Relogio): number {
  return Math.floor(DIA_MS / relogio.msDeJogoPorTick);
}
