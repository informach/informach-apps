import type { Permissao } from "../dominio/permissoes";
import type { EstadoDoCasal, Fase, Mil, Mm } from "../dominio/tipos";

/**
 * Conteúdo como dados. Uma necessidade, uma interação ou um móvel novo entram
 * no jogo por aqui, sem código: cada tipo de objeto tem um comportamento
 * (pontos de uso e ações), e todos os sofás compartilham o mesmo.
 */

export type Postura = "em_pe" | "sentado" | "deitado";

export type PontoDeUso = {
  id: string;
  /** O que se faz ali: `deitar`, `sentar`, `usar`, `berco`. */
  tipo: string;
  postura: Postura;
  /** Onde o corpo fica ao usar, no referencial da peça: lateral e para a frente, em mm. */
  vaga: [lateral: Mm, frente: Mm];
  /**
   * De onde a pessoa chega, em ordem de preferência. A mesma peça pode estar
   * encostada em paredes diferentes em cada casa; a navegação usa o primeiro
   * lugar alcançável.
   */
  acessos: [lateral: Mm, frente: Mm][];
};

export type EntradaDeCatalogo = {
  /** O mesmo id da biblioteca de arte. */
  id: string;
  versao: number;
  categoria: string;
  fixacao: "chao" | "parede" | "apoio" | "teto";
  /** `[lateral0, frente0, lateral1, frente1]` da área que a peça ocupa no chão. */
  pegada: [Mm, Mm, Mm, Mm];
  altura: Mm;
  /** Se impede a passagem. */
  bloqueia: boolean;
  comportamento?: string;
  pontos?: PontoDeUso[];
};

export type ComportamentoDeObjeto = {
  id: string;
  rotulo: string;
  /** Interações que este tipo de objeto oferece. */
  interacoes: readonly string[];
};

export type DefNecessidade = {
  id: string;
  rotulo: string;
  fases: readonly Fase[];
  /** Tempo de jogo para ir de cheia a vazia sem atendimento. */
  esvaziaEmHoras: number;
  /** Abaixo disto a necessidade vira urgência e gera a sensação. */
  critico: Mil;
  sensacao: string;
};

export type Humor =
  | "alegre"
  | "tranquilo"
  | "focado"
  | "inspirado"
  | "triste"
  | "irritado"
  | "tenso"
  | "envergonhado"
  | "apaixonado";

export type DefSensacao = {
  id: string;
  rotulo: string;
  humor: Humor;
  peso: number;
};

export type Quem = "ator" | "alvo";
export type Eixo = "amizade" | "romance" | "confianca";

export type Teste =
  | { t: "vinculo"; eixo: Eixo; min: Mil }
  | { t: "casal"; em: readonly EstadoDoCasal[] }
  | { t: "sem_parentesco" }
  | { t: "alvo_na_fase"; em: readonly Fase[] }
  | { t: "ator_carrega_bebe"; valor: boolean }
  | { t: "alvo_no_colo"; valor: boolean }
  | { t: "objeto_no_lote"; comportamento: string };

export type Efeito =
  /** Aplicado a cada minuto de jogo enquanto a ação dura. */
  | { t: "necessidade"; quem: Quem; id: string; porMinuto: Mil }
  /** Aplicado uma vez, quando a ação termina. */
  | { t: "necessidade_ao_concluir"; quem: Quem; id: string; valor: Mil }
  | { t: "vinculo"; eixo: Eixo; valor: Mil }
  | { t: "habilidade"; id: string; pontos: number }
  | { t: "sensacao"; quem: Quem; id: string; minutos: number };

export type Duracao =
  | { minutos: number }
  /** Dura até a necessidade chegar ao valor, com um teto de tempo. */
  | { ate: { quem: Quem; necessidade: string; valor: Mil }; maxMinutos: number };

/** Passos que precisam de regra própria ao concluir. */
export type Especial =
  | "pegar_no_colo"
  | "por_no_berco"
  | "por_no_chao"
  | "propor_namoro"
  | "propor_casamento"
  | "propor_morar_junto"
  | "propor_bebe"
  | "despedir";

export type DefInteracao = {
  id: string;
  rotulo: string;
  alvo: "objeto" | "morador" | "proprio" | "ponto";
  /**
   * Ordem de prioridade da autonomia: 1 urgências do corpo, 2 obrigações,
   * 3 objetivos pessoais, 4 convívio e lazer, 5 preferências.
   */
  classe: 1 | 2 | 3 | 4 | 5;
  /** O morador pode escolher isto sozinho. */
  autonoma: boolean;
  quem: readonly Fase[];
  requer: readonly Teste[];
  /** Para alvo objeto: o tipo de ponto de uso que a ação ocupa. */
  tipoDePonto?: string;
  /** Para alvo morador: a que distância o ator para. */
  distancia?: Mm;
  duracao: Duracao;
  /**
   * Hora do dia em que a ação faz mais sentido. Dentro da janela a pontuação
   * é multiplicada por `dentro`; fora, por `fora`. Os dois em milésimos.
   */
  contexto?: { deHora: number; ateHora: number; dentro: number; fora: number };
  /** O que a ação promete, para a pontuação da autonomia. */
  anuncia: readonly { quem?: Quem; necessidade: string; valor: Mil }[];
  efeitos: readonly Efeito[];
  /** Clipe da biblioteca de animação. */
  animacao: string;
  animacaoDoAlvo?: string;
  /** Direito exigido além de comandar o morador. */
  permissao?: Permissao;
  /** Outra ação pode tomar o lugar desta antes do fim. */
  interruptivel: boolean;
  especial?: Especial;
};

export type Conteudo = {
  necessidades: readonly DefNecessidade[];
  sensacoes: readonly DefSensacao[];
  interacoes: readonly DefInteracao[];
  comportamentos: readonly ComportamentoDeObjeto[];
  catalogo: readonly EntradaDeCatalogo[];
};
