/**
 * O que o cliente do Morada precisa de quem o hospeda. É pouco de propósito:
 * a bancada de desenvolvimento, o SDK do Recreio e um teste entregam a mesma
 * coisa, e o jogo não sabe de onde ela veio.
 */
export type FonteDoMundo = {
  /** Obtém ou entra na posse do mundo e diz onde ele está rodando. Chamado de novo a cada reabertura. */
  abrir(): Promise<{ endereco: string; mundoId: string }>;
  /** A sessão de jogo vigente. Vai no primeiro quadro, nunca no endereço. */
  token(): string;
  /** Avisa quando a sessão é renovada, para o cliente mandar `renovar_sessao`. */
  aoRenovar?(ouvinte: (token: string) => void): () => void;
  /** O acesso acabou: o jogo mostra o motivo e para. */
  aoPerderAcesso?(ouvinte: (motivo: string) => void): () => void;
};

export type MotivoDoEncerramento =
  | "sessao"
  | "sem_acesso"
  | "acesso_encerrado"
  | "substituida"
  | "protocolo";

export type OpcoesDoMorada = {
  fonte: FonteDoMundo;
  /** Chamado quando a pessoa pede para sair, depois de o mundo confirmar que salvou. */
  aoSair?(): void;
  /**
   * O mundo apareceu na tela: a conexão entrou e a visão inteira chegou.
   * Chamado na primeira entrada e de novo a cada volta depois de uma queda.
   * Quem hospeda usa para saber que, daqui em diante, uma queda é assunto do
   * jogo (que reconecta sozinho) e não da página.
   */
  aoEntrar?(): void;
  /**
   * O jogo parou sem a pessoa pedir e não vai tentar de novo: a sessão venceu
   * (`sessao`), não há acesso a este mundo (`sem_acesso`), o direito de jogar
   * acabou (`acesso_encerrado`), a pessoa entrou por outra janela
   * (`substituida`) ou cliente e servidor são de versões diferentes
   * (`protocolo`). O jogo mostra o motivo na tela; quem hospeda pode fazer mais.
   */
  aoEncerrar?(motivo: MotivoDoEncerramento, detalhe?: string): void;
  /**
   * O código do jogo não chegou (a rede caiu no meio do download). Sem isto, o
   * jogo escreve um aviso simples no lugar dele; com isto, quem hospeda avisa.
   */
  aoNaoCarregar?(): void;
  /** Expõe `window.__morada` para os testes de navegador. Nunca em produção. */
  depurar?: boolean;
};

export type JogoMontado = {
  /** Sai do mundo, espera a confirmação por um instante e solta tudo. */
  dispose(): Promise<void>;
};
