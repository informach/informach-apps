import type { Mil, Morador } from "../dominio/tipos";
import { limitar, UM } from "../nucleo/fixo";
import { type Contexto, tocar } from "./contexto";

/** Pequenas mudanças que vários sistemas fazem em um morador. */

export const MS_POR_MINUTO = 60_000;
export const MS_POR_DIA = 24 * 60 * MS_POR_MINUTO;

/** Minutos de jogo em ticks; no mínimo um. */
export function ticksDeMinutos(ctx: Contexto, minutos: number): number {
  return Math.max(1, Math.floor((minutos * MS_POR_MINUTO) / ctx.estado.relogio.msDeJogoPorTick));
}

/** Soma em uma necessidade que o morador tem; as que ele não tem são ignoradas. */
export function somarNecessidade(morador: Morador, id: string, delta: Mil): void {
  const atual = morador.necessidades[id];
  if (atual === undefined) return;
  morador.necessidades[id] = limitar(atual + delta, 0, UM);
}

export function darSensacao(ctx: Contexto, morador: Morador, id: string, minutos: number): void {
  const ateTick = ctx.estado.relogio.tick + ticksDeMinutos(ctx, minutos);
  const existente = morador.sensacoes.find((s) => s.id === id);
  if (existente) existente.ateTick = Math.max(existente.ateTick, ateTick);
  else morador.sensacoes.push({ id, ateTick });
  tocar(ctx, "moradores", morador.id);
}
