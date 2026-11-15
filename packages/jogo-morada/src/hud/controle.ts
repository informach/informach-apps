import type { DescricaoDoMorador } from "../ativos/ativos";
import type { EstadoDaPrevia } from "../cena/previa";
import type { Sessao } from "../espelho/sessao";
import type { EditorDaCasa } from "../modelo/editor-da-casa";
import type { OpcoesDosRetratos } from "../modelo/retratos";

/**
 * O que o HUD pode pedir ao jogo. O HUD não fala com a rede nem com a cena:
 * lê o espelho pela sessão e pede por aqui.
 */
export type Controle = {
  editor: EditorDaCasa;
  sessao: Sessao;
  previa: {
    definir(descricao: DescricaoDoMorador | null): void;
    estado(esperado?: DescricaoDoMorador): EstadoDaPrevia;
    recarregar(): void;
    girar(sentido: -1 | 1): void;
  };
  alternarParedes(): void;
  focarNoMeu(): void;
  /** Devolve o foco do teclado à cena, depois de fechar um menu. */
  focarNaCena(): void;
  /** Sai do mundo de propósito e avisa quem hospeda o jogo. */
  sair(): void;
  /** Volta para quem hospeda o jogo depois que ele acabou; `null` se não há para onde voltar. */
  voltar: (() => void) | null;
};

/** Quem a pessoa é neste mundo, na forma que os modelos do HUD esperam. */
export function quemSou(controle: Controle): OpcoesDosRetratos | null {
  const jogadorId = controle.sessao.loja.jogador?.jogadorId;
  return jogadorId ? { jogadorId } : null;
}
