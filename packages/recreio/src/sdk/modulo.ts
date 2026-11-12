import type { RecreioGameContext } from "../contrato/sdk";
import type { MundoId } from "../dominio/ids";

/**
 * O contrato entre a página do Recreio que hospeda um jogo (`/jogar/<jogo>`) e
 * o cliente desse jogo. A página abre a sessão de jogo, carrega o módulo sob
 * demanda e o monta num elemento que ocupa a janela; o jogo cuida do resto
 * (abrir o mundo, falar com o próprio servidor, desenhar). São só tipos: a
 * página não importa jogo nenhum, e o jogo não importa a página.
 *
 * Fica no SDK, e não em `contrato/`, porque fala de DOM (`HTMLElement`): o
 * contrato também é lido por servidores de jogo, que não têm os tipos do
 * navegador. Só `@informach/recreio/sdk` exporta este arquivo.
 */
export type OpcoesDeMontagem = {
  /** O mundo que a pessoa escolheu no portal. O jogo o abre com `contexto.mundos.abrir`. */
  mundoId: MundoId;
  /**
   * A pessoa pediu para sair por dentro do jogo, e o jogo já salvou o que
   * precisava. A página desmonta o jogo, encerra a sessão e volta à estante.
   */
  aoSair(): void;
  /**
   * O jogo não tem como continuar e entrega o motivo: em geral o
   * `ErroDoRecreio` que recebeu ao abrir o mundo (`SEM_INSTANCIA`,
   * `NAO_MEMBRO`, `SESSAO_ENCERRADA`...). A página desmonta o jogo e explica
   * para a pessoa. O que o jogo resolve sozinho (reconectar depois de uma
   * queda) não passa por aqui.
   */
  aoFalhar(erro: unknown): void;
  /**
   * Origem HTTP de onde o jogo baixa a arte (`RECREIO_GAME_ORIGINS[jogo].assets`),
   * a mesma que a política de segurança da página libera. Sem ela, o jogo
   * desenha sem a arte.
   */
  origemDaArte?: string;
};

export type JogoMontado = {
  /** Fecha conexões, solta o que o jogo criou no elemento e não chama mais nada da página. */
  dispose(): Promise<void> | void;
};

export type ModuloDoJogo = {
  montar(host: HTMLElement, contexto: RecreioGameContext, opcoes: OpcoesDeMontagem): JogoMontado;
  /**
   * O jogo tem o próprio controle de saída, em todas as telas dele (jogando,
   * entrando, reconectando), e chama `aoSair` por ele. Com isto a página não
   * desenha o botão de sair dela por cima do jogo: um caminho de saída, não
   * dois disputando o mesmo canto.
   */
  saidaPropria?: boolean;
};
