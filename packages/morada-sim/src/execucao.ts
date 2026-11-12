import { type Entrada, EntradaSchema } from "./comandos/intencao";
import { aplicarIntencao } from "./comandos/pipeline";
import { corpoDaFase, modeloDeImovel } from "./conteudo";
import { necessidadesIniciais, novoId, relacaoEntre } from "./dominio/estado";
import type { Fato } from "./dominio/fatos";
import type { FamiliaId, LoteId, MoradorId, MundoId, PerfilId } from "./dominio/ids";
import { verificarInvariantes } from "./dominio/invariantes";
import { PERMISSOES_DO_FUNDADOR } from "./dominio/permissoes";
import { reduzirFato } from "./dominio/reduzir-fato";
import { exigir, inserir, obter, tabelaVazia } from "./dominio/tabela";
import type {
  EstadoDoMundo,
  Familia,
  Lote,
  Morador,
  Presenca,
  RegrasDoMundo,
  Resultado,
  Tick,
} from "./dominio/tipos";
import { criarNavegador, type Navegador } from "./espaco/navegador";
import { objetosDoLote } from "./espaco/posicoes";
import type { DefinicaoDeBairro, MoradorInicial } from "./formatos/bairro";
import { abrirFotografia, type Fotografia, VERSAO_DA_FOTOGRAFIA } from "./formatos/fotografia";
import { andaresNoLote } from "./formatos/imovel";
import { copiar, resumoDe } from "./nucleo/canonico";
import { MS_DE_JOGO_POR_TICK, PASSO_MS } from "./nucleo/relogio";
import { sorteioAte } from "./nucleo/sorteio";
import { passoDasAcoes } from "./sistemas/acoes";
import { passoDaAutonomia } from "./sistemas/autonomia";
import {
  type ChaveReplicada,
  type Contexto,
  causaDoJogador,
  type EventoDeApresentacao,
  emitir,
  type TabelaReplicada,
  tocarChave,
} from "./sistemas/contexto";
import { passoDoQuadro } from "./sistemas/cuidado";
import { passoDasNecessidades } from "./sistemas/necessidades";
import {
  expirarSessoes,
  sessaoCaiu,
  sessaoEntrou,
  sessaoSaiu,
  sessaoVoltou,
} from "./sistemas/presenca";
import { passoDaVida } from "./sistemas/vida";
import { passoDasVisitas } from "./sistemas/visitas";
import {
  criarReplicador,
  type Mudanca,
  projetar,
  type Replicador,
  type VisaoDoCliente,
} from "./visao/replicacao";

/**
 * Um mundo em execução. A simulação guarda a verdade: recebe entradas, anda
 * em passos de 100 ms e devolve o que aconteceu. Não tem rede, banco, relógio
 * nem sorteio do ambiente; quem a hospeda entrega tudo como dado.
 */

/** Regras de um mundo novo. Os tempos de vida são hipóteses a validar jogando. */
export const REGRAS_PADRAO: RegrasDoMundo = {
  politicaDeAvanco: "suspenso",
  diasDeJogoPorDiaReal: 3,
  envelhecimento: "normal",
  diasPorFase: { colo: 3, pequeno: 4, crianca: 10, adolescente: 10, adulto: 40, idoso: null },
  diasDeGravidez: 3,
  maxMoradoresPorFamilia: 8,
  janelaDeGracaMs: 30_000,
};

/** Regras da prova: a mesma vida, com gravidez e primeiras fases mais curtas. */
export const REGRAS_DA_PROVA: RegrasDoMundo = {
  ...REGRAS_PADRAO,
  diasPorFase: { colo: 1, pequeno: 1, crianca: 4, adolescente: 4, adulto: 20, idoso: null },
  diasDeGravidez: 1,
};

export type SaidaDoPasso = {
  tick: Tick;
  /** Fatos críticos, na ordem. Vão para o diário antes de qualquer cliente saber. */
  fatos: Fato[];
  /** O que mudou no que os clientes veem. */
  mudancas: Mudanca[];
  /** Avisos de uma vez só, para animação e som. Nunca são estado. */
  apresentacao: EventoDeApresentacao[];
};

export type Mundo = {
  readonly estado: Readonly<EstadoDoMundo>;
  readonly presenca: Readonly<Presenca>;
  /** Aplica uma entrada agora. Só intenções de jogador podem ser recusadas. */
  aplicar(entrada: Entrada): Resultado;
  /**
   * Anda o tempo. `ms` é múltiplo de 100; com o mundo acelerado, cada 100 ms
   * valem dois ou três passos. `avancar(0)` só recolhe o que as entradas
   * produziram.
   */
  avancar(ms: number): SaidaDoPasso;
  fotografar(): Fotografia;
  /** A visão inteira, para quem entra ou reconecta. */
  visao(perfilId: PerfilId, loteId?: LoteId): VisaoDoCliente;
  /** Resumo do estado: `duravel` é o que vai para a fotografia. */
  hash(escopo?: "duravel" | "tudo"): string;
  navegador(loteId: LoteId): Navegador;
};

export type OpcoesDoMundo = {
  /** Acusa qualquer mudança visível que não foi marcada para replicação. Para testes. */
  conferirReplicacao?: boolean;
};

function montar(estado: EstadoDoMundo, opcoes: OpcoesDoMundo): Mundo {
  const presenca: Presenca = { sessoes: [], reservas: [], voto: null };
  const navegadores = new Map<LoteId, { revisao: number; navegador: Navegador }>();
  const tocadas = new Map<TabelaReplicada, Set<string>>();
  const chavesTocadas = new Set<ChaveReplicada>();
  let fatos: Fato[] = [];
  let apresentacao: EventoDeApresentacao[] = [];
  const replicador: Replicador = criarReplicador(estado, presenca, {
    conferir: opcoes.conferirReplicacao ?? false,
  });

  function navegador(loteId: LoteId): Navegador {
    const lote = exigir(estado.lotes, loteId);
    const guardado = navegadores.get(loteId);
    if (guardado && guardado.revisao === lote.revisaoDoEspaco) return guardado.navegador;
    const imovel = lote.imovelId ? (obter(estado.imoveis, lote.imovelId) ?? null) : null;
    const novo = criarNavegador(lote, imovel, objetosDoLote(estado, loteId));
    navegadores.set(loteId, { revisao: lote.revisaoDoEspaco, navegador: novo });
    return novo;
  }

  function contexto(): Contexto {
    return { estado, presenca, fatos, apresentacao, tocadas, chavesTocadas, navegador };
  }

  function colher(): SaidaDoPasso {
    const saida: SaidaDoPasso = {
      tick: estado.relogio.tick,
      fatos,
      mudancas: replicador.colher({ tocadas, chavesTocadas }),
      apresentacao,
    };
    fatos = [];
    apresentacao = [];
    return saida;
  }

  function passo(): void {
    estado.relogio.tick++;
    const ctx = contexto();
    // Ordem fixa: o que chega, o corpo, o que precisa de cuidado, a escolha,
    // a ação e, por fim, a vida.
    passoDasVisitas(ctx);
    passoDasNecessidades(ctx);
    passoDoQuadro(ctx);
    passoDaAutonomia(ctx);
    passoDasAcoes(ctx);
    passoDaVida(ctx);
  }

  return {
    estado,
    presenca,
    navegador,

    aplicar(entradaBruta) {
      const entrada = EntradaSchema.parse(entradaBruta);
      const ctx = contexto();
      const aceito: Resultado = {
        ok: true,
        comandoId: "",
        tick: estado.relogio.tick,
        versoes: {},
      };
      switch (entrada.t) {
        case "intencao":
          return aplicarIntencao(ctx, entrada.sessaoId, entrada.intencao);
        case "sessao_entrou":
          sessaoEntrou(ctx, entrada.sessaoId, entrada.perfilId, entrada.apelido);
          return aceito;
        case "sessao_caiu":
          sessaoCaiu(ctx, entrada.sessaoId, entrada.agoraMs);
          return aceito;
        case "sessao_voltou":
          return sessaoVoltou(ctx, entrada.sessaoId, entrada.apelido)
            ? aceito
            : { ok: false, comandoId: "", motivo: "sem_sessao" };
        case "sessao_saiu":
          sessaoSaiu(ctx, entrada.sessaoId);
          return aceito;
        case "expirar":
          expirarSessoes(ctx, entrada.agoraMs);
          return aceito;
        case "conceder_acesso": {
          if (!obter(estado.familias, entrada.familiaId)) {
            return { ok: false, comandoId: "", motivo: "nao_existe" };
          }
          emitir(
            ctx,
            `acesso:${entrada.perfilId}:${entrada.familiaId}:${estado.relogio.tick}`,
            entrada.familiaId,
            {
              tipo: "AcessoConcedido",
              perfilId: entrada.perfilId,
              familiaId: entrada.familiaId,
              permissoes: entrada.permissoes,
            },
            causaDoJogador(null, null, "acesso_pelo_recreio"),
          );
          return aceito;
        }
        case "revogar_acesso": {
          emitir(
            ctx,
            `revoga:${entrada.perfilId}:${entrada.familiaId}:${estado.relogio.tick}`,
            entrada.familiaId,
            {
              tipo: "AcessoRevogado",
              perfilId: entrada.perfilId,
              familiaId: entrada.familiaId,
            },
            causaDoJogador(null, null, "acesso_pelo_recreio"),
          );
          // Quem perdeu o acesso não continua dirigindo moradores daquela família.
          const antes = presenca.reservas.length;
          presenca.reservas = presenca.reservas.filter((reserva) => {
            const morador = obter(estado.moradores, reserva.moradorId);
            return !(
              reserva.perfilId === entrada.perfilId && morador?.familiaId === entrada.familiaId
            );
          });
          if (presenca.reservas.length !== antes) tocarChave(ctx, "presenca");
          return aceito;
        }
        case "dia_real":
          if (estado.avancoDoDia.dia !== entrada.dia) {
            estado.avancoDoDia = { dia: entrada.dia, gastoMs: {} };
          }
          return aceito;
      }
    },

    avancar(ms) {
      if (!Number.isInteger(ms) || ms < 0 || ms % PASSO_MS !== 0) {
        throw new Error(`O tempo anda em passos de ${PASSO_MS} ms`);
      }
      const passos = (ms / PASSO_MS) * estado.relogio.velocidade;
      for (let i = 0; i < passos; i++) passo();
      return colher();
    },

    fotografar() {
      return {
        formato: "morada.foto",
        versao: VERSAO_DA_FOTOGRAFIA,
        mundoId: estado.id,
        tick: estado.relogio.tick,
        estado: copiar(estado),
      };
    },

    visao() {
      return projetar(estado, presenca);
    },

    hash(escopo = "duravel") {
      return resumoDe(escopo === "duravel" ? estado : { estado, presenca });
    },
  };
}

function criarMorador(
  estado: EstadoDoMundo,
  inicial: MoradorInicial,
  familiaId: FamiliaId | null,
  local: Morador["local"],
): Morador {
  const id = novoId(estado, "mor");
  const necessidades = necessidadesIniciais(inicial.fase);
  // Cada um começa em um ponto diferente das necessidades, para não agirem em coro.
  for (const chave of Object.keys(necessidades).sort()) {
    necessidades[chave] =
      600_000 + sorteioAte(350_000, estado.semente, "inicio", `${id}:${chave}`, 0);
  }
  const morador: Morador = {
    id,
    mundoId: estado.id,
    familiaId,
    versao: 1,
    nome: inicial.nome,
    fase: inicial.fase,
    idadeNaFaseMs: 0,
    origem: {},
    aparencia: {
      linha: inicial.linha,
      corpo: corpoDaFase(inicial.linha, inicial.fase),
      pele: inicial.pele,
      cabelo: inicial.cabelo,
      roupa: inicial.roupa,
      semente: sorteioAte(0x7fffffff, estado.semente, "aparencia", id, 0),
    },
    local,
    movimento: null,
    necessidades: local.t === "fora" ? {} : necessidades,
    sensacoes: [],
    tracos: [...inicial.tracos],
    habilidades: { ...(inicial.habilidades ?? {}) },
    relacoes: [],
    fila: [],
    acaoAtual: null,
    carteira: 0,
  };
  return inserir(estado.moradores, id, morador);
}

export type NovoMundo = {
  mundoId: MundoId;
  semente: number;
  definicao: DefinicaoDeBairro;
  /** Perfis que recebem todos os direitos sobre as famílias do bairro. */
  fundadores: readonly PerfilId[];
  regras?: Partial<RegrasDoMundo>;
};

/** Cria um mundo a partir de um bairro descrito como dados. */
export function criarMundo(novo: NovoMundo, opcoes: OpcoesDoMundo = {}): Mundo {
  const { definicao } = novo;
  const estado: EstadoDoMundo = {
    formato: "morada.mundo",
    versao: 1,
    id: novo.mundoId,
    semente: novo.semente >>> 0,
    relogio: { tick: 0, velocidade: 1, msDeJogoPorTick: MS_DE_JOGO_POR_TICK },
    regras: { ...REGRAS_PADRAO, ...novo.regras },
    bairros: tabelaVazia(),
    lotes: tabelaVazia(),
    imoveis: tabelaVazia(),
    objetos: tabelaVazia(),
    familias: tabelaVazia(),
    moradores: tabelaVazia(),
    relacoes: tabelaVazia(),
    acoes: tabelaVazia(),
    gravidezes: tabelaVazia(),
    pedidos: tabelaVazia(),
    quadro: tabelaVazia(),
    agenda: [],
    acessos: [],
    memorias: [],
    comandos: [],
    contadores: {},
    avancoDoDia: { dia: 0, gastoMs: {} },
  };

  const bairroId = novoId(estado, "bairro");
  const lotesPorRef = new Map<string, Lote>();
  for (const inicial of definicao.lotes) {
    const loteId = novoId(estado, "lote");
    const lote: Lote = {
      id: loteId,
      bairroId,
      origem: [inicial.origem[0], inicial.origem[1]],
      tamanho: [inicial.tamanho[0], inicial.tamanho[1]],
      imovelId: null,
      familiaId: null,
      entrada: [inicial.entrada[0], inicial.entrada[1]],
      revisaoDoEspaco: 1,
    };
    inserir(estado.lotes, loteId, lote);
    lotesPorRef.set(inicial.ref, lote);

    if (inicial.imovel) {
      const modelo = modeloDeImovel(inicial.imovel.modelo);
      if (!modelo) throw new Error(`Modelo de imóvel desconhecido: ${inicial.imovel.modelo}`);
      const imovelId = novoId(estado, "imo");
      inserir(estado.imoveis, imovelId, {
        formato: "morada.imovel",
        versao: 1,
        id: imovelId,
        modelo: inicial.imovel.modelo,
        revisao: 1,
        fundacao: modelo.fundacao,
        andares: andaresNoLote(modelo, inicial.imovel.posicao),
      });
      lote.imovelId = imovelId;
      const [dx, dy] = inicial.imovel.posicao;
      for (const objeto of modelo.objetos) {
        const objetoId = novoId(estado, "obj");
        inserir(estado.objetos, objetoId, {
          id: objetoId,
          loteId,
          catalogo: objeto.catalogo,
          versao: objeto.versao,
          pos: [objeto.pos[0] + dx, objeto.pos[1] + dy, objeto.pos[2]],
          andar: objeto.andar,
          giro: objeto.giro,
          cor: objeto.cor,
          ocupacao: {},
        });
      }
    }
  }
  inserir(estado.bairros, bairroId, {
    id: bairroId,
    nome: definicao.nome,
    tamanho: [definicao.tamanho[0], definicao.tamanho[1]],
    lotes: [...estado.lotes.ordem],
  });

  const moradoresPorRef = new Map<string, MoradorId>();
  const registrar = (ref: string, id: MoradorId) => {
    if (moradoresPorRef.has(ref)) throw new Error(`Morador repetido no bairro: ${ref}`);
    moradoresPorRef.set(ref, id);
  };

  for (const inicial of definicao.familias) {
    const lote = lotesPorRef.get(inicial.lote);
    if (!lote) throw new Error(`Família ${inicial.ref} em lote desconhecido: ${inicial.lote}`);
    if (lote.familiaId) throw new Error(`Lote ${inicial.lote} com duas famílias`);
    const familiaId = novoId(estado, "fam");
    const familia: Familia = {
      id: familiaId,
      nome: inicial.nome,
      loteId: lote.id,
      fundo: inicial.fundo,
      vidaMs: 0,
      versao: 1,
    };
    inserir(estado.familias, familiaId, familia);
    lote.familiaId = familiaId;
    inicial.moradores.forEach((moradorInicial, n) => {
      // Chegam juntos, lado a lado, na entrada do lote.
      const morador = criarMorador(estado, moradorInicial, familiaId, {
        t: "lote",
        loteId: lote.id,
        andar: 0,
        pos: [lote.entrada[0] + (n - 1) * 600, lote.entrada[1] - (n % 2) * 600],
        frente: 180,
      });
      registrar(moradorInicial.ref, morador.id);
    });
    for (const perfilId of novo.fundadores) {
      estado.acessos.push({ familiaId, perfilId, permissoes: [...PERMISSOES_DO_FUNDADOR] });
    }
  }

  for (const inicial of definicao.avulsos) {
    const morador = criarMorador(estado, inicial, null, { t: "fora", motivo: "avulso" });
    registrar(inicial.ref, morador.id);
  }

  for (const inicial of definicao.relacoes) {
    const a = moradoresPorRef.get(inicial.a);
    const b = moradoresPorRef.get(inicial.b);
    if (!a || !b) throw new Error(`Relação com morador desconhecido: ${inicial.a}, ${inicial.b}`);
    const relacao = relacaoEntre(estado, a, b);
    relacao.eixos = {
      amizade: inicial.amizade ?? 0,
      romance: inicial.romance ?? 0,
      confianca: inicial.confianca ?? 0,
    };
    relacao.casal = inicial.casal ?? "nenhum";
    relacao.parentesco =
      inicial.parentesco === "genitor"
        ? { tipo: "genitor", de: a }
        : inicial.parentesco === "irmaos"
          ? { tipo: "irmaos" }
          : null;
  }

  const problemas = verificarInvariantes(estado);
  if (problemas.length > 0) throw new Error(`Mundo novo inválido: ${problemas.join("; ")}`);
  return montar(estado, opcoes);
}

/**
 * Volta um mundo da última fotografia e dos fatos do diário gravados depois
 * dela. Os fatos passam pelo mesmo redutor da simulação ao vivo, então o que
 * é crítico volta exatamente; o resto volta como estava na fotografia.
 */
export function restaurar(
  fotografia: unknown,
  fatos: readonly Fato[] = [],
  opcoes: OpcoesDoMundo = {},
): Mundo {
  const foto = abrirFotografia(fotografia);
  const estado = copiar(foto.estado);
  let tick = estado.relogio.tick;
  for (const fato of fatos) {
    reduzirFato(estado, fato);
    if (fato.tick > tick) tick = fato.tick;
  }
  estado.relogio.tick = tick;
  // O acordo de velocidade é de quem estava presente; o mundo volta no ritmo normal.
  estado.relogio.velocidade = 1;
  const problemas = verificarInvariantes(estado);
  if (problemas.length > 0) {
    throw new Error(`Mundo restaurado inválido: ${problemas.slice(0, 5).join("; ")}`);
  }
  return montar(estado, opcoes);
}
