import type { Sessao } from "../espelho/sessao";
import type { OpcoesDosRetratos } from "../modelo/retratos";

/**
 * O que o HUD pode pedir ao jogo. O HUD não fala com a rede nem com a cena:
 * lê o espelho pela sessão e pede por aqui.
 */
export type Controle = {
  sessao: Sessao;
  /** Como chamar outro jogador do mundo, se quem hospeda o jogo souber. */
  apelidoDe?(jogadorId: string): string | undefined;
  alternarParedes(): void;
  focarNoMeu(): void;
  /** Devolve o foco do teclado à cena, depois de fechar um menu. */
  focarNaCena(): void;
  /** Sai do mundo de propósito e avisa quem hospeda o jogo. */
  sair(): void;
  /** Volta para quem hospeda o jogo depois que ele acabou; `null` se não há para onde voltar. */
  voltar: (() => void) | null;
};

/** Quem a pessoa é e como chamar os outros, na forma que os modelos do HUD esperam. */
export function quemSou(controle: Controle): OpcoesDosRetratos | null {
  const jogadorId = controle.sessao.loja.jogador?.jogadorId;
  if (!jogadorId) return null;
  return { jogadorId, apelidoDe: controle.apelidoDe };
}
