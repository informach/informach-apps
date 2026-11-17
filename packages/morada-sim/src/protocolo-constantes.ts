/** V2 exige o leitor do mundo V3 e da arte V4, inclusive em abas já abertas. */
export const VERSAO_DO_PROTOCOLO = 2;
/** O cliente de transição ainda pode apresentar V1 a um host anterior ao corte. */
export type VersaoDoProtocolo = 1 | typeof VERSAO_DO_PROTOCOLO;
/** Subprotocolo do WebSocket. Outro formato de quadro ganha outro nome. */
export const SUBPROTOCOLO = "morada.v1.json";
/** Tamanho máximo de um quadro vindo do cliente. */
export const QUADRO_MAXIMO_BYTES = 16 * 1024;
/** Quanto o servidor espera o primeiro quadro, com a sessão, antes de desistir. */
export const PRAZO_PARA_ENTRAR_MS = 5000;

/** Por que o servidor fechou a conexão. O cliente decide por aqui se tenta de novo. */
export const FECHAMENTO = {
  /** O cliente pediu para sair. */
  normal: 1000,
  /** Sessão de jogo ausente, vencida ou que não confere. */
  sessao: 4001,
  /** A sessão vale, mas não dá direito a este mundo. */
  semAcesso: 4003,
  /** Quadro fora do formato ou comandos demais. */
  protocolo: 4008,
  /** Esta instância perdeu a posse do mundo: reabra pelo Recreio. */
  posse: 4009,
  /** O servidor está reiniciando: reabra pelo Recreio. */
  reiniciando: 4010,
  /** O cliente não acompanhou o ritmo: reconecte para receber a visão inteira. */
  atrasado: 4011,
  /** O mesmo perfil entrou por outra conexão. */
  substituida: 4012,
  /** O servidor não aceita mais mundos agora. */
  cheio: 4013,
} as const;

export type CodigoDeFechamento = (typeof FECHAMENTO)[keyof typeof FECHAMENTO];

/** Depois destes fechamentos o cliente pode reabrir o mundo sozinho. */
export const FECHAMENTOS_QUE_REABREM: readonly number[] = [
  FECHAMENTO.posse,
  FECHAMENTO.reiniciando,
  FECHAMENTO.atrasado,
];
