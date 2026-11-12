import type { DocumentoDeImovel } from "../formatos/imovel";
import type {
  AcaoId,
  BairroId,
  FamiliaId,
  GravidezId,
  ImovelId,
  LoteId,
  MemoriaId,
  MoradorId,
  MundoId,
  ObjetoId,
  PedidoId,
  PerfilId,
  RelacaoId,
  SessaoId,
  TarefaId,
} from "./ids";
import type { Permissao } from "./permissoes";
import type { Tabela } from "./tabela";

/**
 * O estado de um mundo. São dados puros: o que está aqui é o que vai para a
 * fotografia. Duas regiões:
 *
 * - `EstadoDoMundo` é durável: moradores, famílias, casas, relações.
 * - `Presenca` é volátil: quem está conectado e quem dirige quem. Nunca é
 *   gravada e é refeita quando o mundo volta.
 *
 * Não existe campo "é NPC". Todo morador decide sozinho; quem dirige um
 * morador é uma reserva de sessão, guardada em `Presenca`.
 */

export type Tick = number;
/** Milímetros. */
export type Mm = number;
/** Partes por milhão: 1_000_000 = 100%. */
export type Mil = number;
export type Centavos = number;
export type PontoMm = [x: Mm, y: Mm];

export const FASES = ["colo", "pequeno", "crianca", "adolescente", "adulto", "idoso"] as const;
export type Fase = (typeof FASES)[number];

export type PoliticaDeAvanco = "suspenso" | "limitado" | "sincronia";
export type Envelhecimento = "desligado" | "lento" | "normal" | "rapido";
export type Velocidade = 0 | 1 | 2 | 3;

export type RegrasDoMundo = {
  /** O que acontece com as famílias de quem não está presente. */
  politicaDeAvanco: PoliticaDeAvanco;
  /** Só na política `limitado`: dias de jogo por dia real para famílias ausentes. */
  diasDeJogoPorDiaReal: number;
  envelhecimento: Envelhecimento;
  /** Dias de jogo em cada fase; `null` é uma fase que não termina. */
  diasPorFase: Record<Fase, number | null>;
  diasDeGravidez: number;
  maxMoradoresPorFamilia: number;
  /** Quanto uma reserva espera a reconexão de quem caiu, em milissegundos reais. */
  janelaDeGracaMs: number;
};

export type Relogio = {
  tick: Tick;
  velocidade: Velocidade;
  /** Tempo de jogo que cada tick representa. 3000 = um dia de jogo em 48 minutos. */
  msDeJogoPorTick: number;
};

export type Bairro = {
  id: BairroId;
  nome: string;
  tamanho: PontoMm;
  lotes: LoteId[];
};

export type Lote = {
  id: LoteId;
  bairroId: BairroId;
  /** Canto do lote no bairro. */
  origem: PontoMm;
  tamanho: PontoMm;
  imovelId: ImovelId | null;
  familiaId: FamiliaId | null;
  /** Onde alguém aparece ao chegar, em coordenadas do lote. */
  entrada: PontoMm;
  /** Sobe quando paredes ou objetos do lote mudam; a navegação é refeita. */
  revisaoDoEspaco: number;
};

export type Objeto = {
  id: ObjetoId;
  loteId: LoteId;
  /** Entrada do catálogo. O mundo salvo nunca guarda arquivo 3D. */
  catalogo: string;
  versao: number;
  pos: [x: Mm, y: Mm, z: Mm];
  andar: number;
  /** Graus, em múltiplos de 90. Com 0 a frente aponta para −Y. */
  giro: number;
  cor: number;
  /** Ponto de uso → quem o ocupa. Um ponto tem um ocupante só. */
  ocupacao: Record<string, MoradorId>;
};

export type Familia = {
  id: FamiliaId;
  nome: string;
  loteId: LoteId | null;
  fundo: Centavos;
  /**
   * Relógio de vida da família, em milissegundos de jogo. Gravidez e idade
   * andam por ele, e ele só anda quando a política de avanço deixa.
   */
  vidaMs: number;
  versao: number;
};

export type Aparencia = {
  linha: "f" | "m";
  corpo: string;
  /** Tom de pele, como cor RGB inteira. */
  pele: number;
  cabelo: string;
  roupa: string;
  semente: number;
};

export type Local =
  | { t: "lote"; loteId: LoteId; andar: number; pos: PontoMm; frente: number }
  | { t: "objeto"; loteId: LoteId; objetoId: ObjetoId; ponto: string }
  | { t: "colo"; de: MoradorId }
  | { t: "fora"; motivo: "avulso" | "visita_encerrada" };

export type Movimento = {
  /** Pontos do caminho, em coordenadas do lote; o primeiro é a partida. */
  rota: PontoMm[];
  inicioTick: Tick;
  mmPorTick: Mm;
  /** Muda a cada rota nova; o cliente usa para saber que precisa corrigir. */
  v: number;
};

export type Morador = {
  id: MoradorId;
  mundoId: MundoId;
  /** No máximo uma família por vez; `null` é um morador avulso do bairro. */
  familiaId: FamiliaId | null;
  /** Sobe em mudança estrutural (fila, família, fase), nunca em decaimento. */
  versao: number;
  nome: string;
  fase: Fase;
  /** Tempo na fase atual, pelo relógio de vida. */
  idadeNaFaseMs: number;
  origem: { gravidezId?: GravidezId };
  aparencia: Aparencia;
  local: Local;
  movimento: Movimento | null;
  necessidades: Record<string, Mil>;
  sensacoes: { id: string; ateTick: Tick }[];
  tracos: string[];
  habilidades: Record<string, number>;
  relacoes: RelacaoId[];
  fila: AcaoId[];
  acaoAtual: AcaoId | null;
  carteira: Centavos;
  /** Quem costuma jogar com este morador. Não dá exclusividade. */
  preferidoDe?: PerfilId;
};

export type EstadoDoCasal = "nenhum" | "namoro" | "casamento" | "ex";

export type Relacao = {
  id: RelacaoId;
  a: MoradorId;
  b: MoradorId;
  versao: number;
  eixos: { amizade: Mil; romance: Mil; confianca: Mil };
  casal: EstadoDoCasal;
  /** `de` é genitor do outro morador da relação. */
  parentesco: null | { tipo: "genitor"; de: MoradorId } | { tipo: "irmaos" };
  marcos: MemoriaId[];
};

export type Gravidez = {
  id: GravidezId;
  gestanteId: MoradorId;
  outroGenitorId: MoradorId | null;
  familiaId: FamiliaId;
  /** Os dois no relógio de vida da família. */
  inicioVidaMs: number;
  previstaVidaMs: number;
  sementeDoBebe: number;
  /** Decidido na concepção: o bebê nasce uma vez só e com este id. */
  bebeId: MoradorId;
  estado: "em_curso" | "concluida";
};

export type Alvo =
  | { t: "objeto"; objetoId: ObjetoId }
  | { t: "morador"; moradorId: MoradorId }
  | { t: "proprio" }
  | { t: "ponto"; pos: PontoMm; andar: number };

export type EstadoDaAcao = "na_fila" | "indo" | "esperando" | "executando";

export type Acao = {
  id: AcaoId;
  moradorId: MoradorId;
  interacao: string;
  alvo: Alvo;
  origem: "jogador" | "autonomia" | "quadro" | "resposta";
  autor: PerfilId | null;
  comandoId: string | null;
  estado: EstadoDaAcao;
  reserva: { objetoId: ObjetoId; ponto: string } | null;
  /** Ação do outro morador em uma interação a dois. */
  par: AcaoId | null;
  inicioTick: Tick | null;
  /** Quando a execução termina; `null` enquanto não começou ou se dura até uma condição. */
  fimTick: Tick | null;
  /** Tarefa do quadro que esta ação atende. */
  tarefaId: TarefaId | null;
};

export type TipoDePedido = "namoro" | "casamento" | "morar_junto" | "bebe";

export type Pedido = {
  id: PedidoId;
  tipo: TipoDePedido;
  de: MoradorId;
  para: MoradorId;
  autor: PerfilId | null;
  criadoTick: Tick;
  estado: "aberto" | "aceito" | "recusado";
  motivo: string | null;
};

export type Tarefa = {
  id: TarefaId;
  familiaId: FamiliaId;
  bebeId: MoradorId;
  /** O cuidado pedido, que também diz qual necessidade o motivou. */
  cuidado: string;
  necessidade: string;
  criadaTick: Tick;
  responsavelId: MoradorId | null;
};

export type EventoAgendado = {
  id: string;
  em: Tick;
  tipo: "visita_chega" | "visita_vai";
  moradorId: MoradorId;
  loteId: LoteId;
};

export type AcessoFamilia = {
  familiaId: FamiliaId;
  perfilId: PerfilId;
  permissoes: Permissao[];
};

export type Memoria = {
  id: MemoriaId;
  tick: Tick;
  tipo: "namoro" | "casamento" | "mudanca" | "gravidez" | "nascimento" | "fase";
  familiaId: FamiliaId | null;
  moradores: MoradorId[];
};

export type MotivoDeRecusa =
  | "mundo_errado"
  | "sem_sessao"
  | "sem_acesso"
  | "sem_permissao"
  | "sem_reserva"
  | "reservado_por_outro"
  | "versao_antiga"
  | "nao_existe"
  | "fase_nao_permite"
  | "requisito"
  | "ocupado"
  | "inalcancavel"
  | "limite_da_familia"
  | "ja_resolvido"
  | "politica_do_mundo"
  | "comando_invalido";

export type Resultado =
  | {
      ok: true;
      comandoId: string;
      tick: Tick;
      /** Versão nova de cada entidade que o comando mudou. */
      versoes: Record<string, number>;
      repetido?: true;
    }
  | { ok: false; comandoId: string; motivo: MotivoDeRecusa; detalhe?: string; repetido?: true };

export type RegistroDeComando = { comandoId: string; resultado: Resultado };

export type EstadoDoMundo = {
  formato: "morada.mundo";
  versao: 1;
  id: MundoId;
  semente: number;
  relogio: Relogio;
  regras: RegrasDoMundo;
  bairros: Tabela<BairroId, Bairro>;
  lotes: Tabela<LoteId, Lote>;
  imoveis: Tabela<ImovelId, DocumentoDeImovel>;
  objetos: Tabela<ObjetoId, Objeto>;
  familias: Tabela<FamiliaId, Familia>;
  moradores: Tabela<MoradorId, Morador>;
  relacoes: Tabela<RelacaoId, Relacao>;
  acoes: Tabela<AcaoId, Acao>;
  gravidezes: Tabela<GravidezId, Gravidez>;
  pedidos: Tabela<PedidoId, Pedido>;
  quadro: Tabela<TarefaId, Tarefa>;
  /** Em ordem de `(em, id)`. */
  agenda: EventoAgendado[];
  acessos: AcessoFamilia[];
  memorias: Memoria[];
  /** Últimos comandos e o que foi respondido: repetir não faz de novo. */
  comandos: RegistroDeComando[];
  /** Fatos já aplicados neste tick, para não repetir ids no mesmo instante. */
  contadores: Record<string, number>;
  /** Dia real e quanto do avanço limitado já foi gasto nele, por família. */
  avancoDoDia: { dia: number; gastoMs: Record<string, number> };
};

// --- Presença: volátil, nunca vai para a fotografia ---

export type Sessao = {
  sessaoId: SessaoId;
  perfilId: PerfilId;
  /** Como a plataforma chama quem joga; `null` se quem hospeda o mundo não disse. */
  apelido: string | null;
  /** `em_graca`: a conexão caiu e ainda pode voltar. */
  estado: "presente" | "em_graca";
  /** Relógio real do servidor, entregue como dado. */
  ateMs: number | null;
};

/** Quem dirige um morador agora. É da sessão; nunca é gravada no morador. */
export type ReservaDeControle = {
  moradorId: MoradorId;
  perfilId: PerfilId;
  sessaoId: SessaoId;
};

export type VotoDeVelocidade = {
  velocidade: Velocidade;
  /** Perfis presentes que já concordaram. */
  aFavor: PerfilId[];
};

export type Presenca = {
  sessoes: Sessao[];
  reservas: ReservaDeControle[];
  voto: VotoDeVelocidade | null;
};
