import { performance } from "node:perf_hooks";
import { gunzipSync, gzipSync } from "node:zlib";
import { jogoPorId } from "@informach/config/jogos";
import {
  APELIDO_MAX,
  criarMundo,
  type Fato,
  type Intencao,
  listar,
  type Mundo,
  PERMISSOES_DE_QUEM_DIVIDE,
  PERMISSOES_DO_FUNDADOR,
  type RegrasDoMundo,
  restaurar,
  resumoDoTexto,
  type SaidaDoPasso,
  ticksPorDia,
  VERSAO_DO_MUNDO,
} from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import type { DefinicaoDeBairro } from "@informach/morada-sim/formatos";
import {
  FECHAMENTO,
  type MensagemDoServidor,
  VERSAO_DO_PROTOCOLO,
} from "@informach/morada-sim/protocolo";
import { ehErroDoRecreio, FOLGA_DE_AUTOCERCA_MS, type MundoId } from "@informach/recreio";
import { sessaoVencida } from "@informach/recreio/contrato";
import type {
  ClienteDoHost,
  EntradaDoDiario,
  EntradaPermitida,
  SessaoVerificada,
} from "@informach/recreio/host";
import { type Falhas, QuedaSimulada } from "./falhas";

/**
 * Um mundo aberto nesta instância. O ator guarda a simulação na memória,
 * recebe o que os jogadores pedem, anda o tempo e cuida de duas promessas:
 *
 * - o que é crítico vai para o diário antes de qualquer cliente ficar sabendo;
 * - só escreve quem tem a posse. Se a posse se perde, o ator para na hora,
 *   larga o estado e fecha as conexões.
 *
 * Tudo o que o ator faz passa por uma fila só: entrada de jogador, passo e
 * fotografia nunca se cruzam.
 */

export interface Conexao {
  enviar(texto: string): void;
  fechar(codigo: number, motivo?: string): void;
  /** Bytes ainda não entregues ao cliente. */
  pendente(): number;
}

export type Ligacao = {
  conexao: Conexao;
  fase: "nova" | "entrando" | "dentro" | "fechada";
  ator: Ator | null;
  /** A sessão de jogo do Recreio. É também a sessão dentro da simulação. */
  sid: string | null;
  /** Quem a pessoa é neste mundo: o id de membro, não o do perfil. */
  jogadorId: string | null;
  perfilId: string | null;
  /** O `exp` da sessão de jogo, em ms. Quem diz se ela venceu é `sessaoVencida`. */
  expiraEm: number;
  seq: number;
  fichas: number;
  fichasDeIntencao: number;
  recarregadaEm: number;
};

type EntradaNaCaixa =
  | { t: "intencao"; ligacao: Ligacao; intencao: Intencao }
  | { t: "caiu"; sid: string }
  | { t: "sair"; ligacao: Ligacao }
  | { t: "encerrada"; sid: string };

export type OpcoesDoAtor = {
  mundoId: MundoId;
  host: ClienteDoHost;
  agora(): number;
  posseTtlMs: number;
  falhas: Falhas;
  definicao?: DefinicaoDeBairro;
  regras?: Partial<RegrasDoMundo>;
  /** De quanto em quanto tempo real o mundo é fotografado enquanto muda. */
  checkpointMs: number;
  /**
   * Com este tanto de diário sem fotografia, o mundo é fotografado logo, sem
   * esperar o intervalo. Por padrão, um quarto do teto do Recreio.
   */
  diarioParaFotografarBytes?: number;
  aoFechar(ator: Ator): void;
  registrar(evento: string, dados?: Record<string, unknown>): void;
};

/** Acima disto a conexão não está acompanhando: melhor fechar e recomeçar da visão inteira. */
const ATRASO_MAXIMO_BYTES = 1024 * 1024;
/** Fatos depois dos quais vale fotografar logo, sem esperar o intervalo. */
const FATOS_MARCANTES = new Set([
  "NascimentoRegistrado",
  "FamiliaMudou",
  "FaseMudou",
  "CasalMudou",
]);

/**
 * Os tetos do Recreio para o diário do Morada. O lote é dividido antes de
 * passar deles, e o mundo é fotografado bem antes de o diário sem fotografia
 * chegar ao ponto em que o Recreio recusa novas entradas.
 */
const LIMITES = jogoPorId("morada")?.limites ?? {
  diarioLoteMaxBytes: 256 * 1024,
  diarioPendenteMaxBytes: 8 * 1024 * 1024,
};
const ENTRADAS_POR_LOTE = 256;
const DIARIO_SEM_FOTO_PARA_FOTOGRAFAR = Math.floor(LIMITES.diarioPendenteMaxBytes / 4);
/** Com o diário fora do ar, o registro repete a queixa neste intervalo, não a cada tentativa. */
const REPETIR_QUEIXA_MS = 5000;

/**
 * Recusas do Recreio que não dizem nada sobre quem pede: ele não respondeu ou
 * pediu calma. A instância tenta de novo; o jogador não é mandado embora.
 */
function ehPassageiro(erro: unknown): boolean {
  return ehErroDoRecreio(erro, "INDISPONIVEL") || ehErroDoRecreio(erro, "MUITAS_TENTATIVAS");
}

/**
 * Recusas do diário que tentar de novo não resolve: o que a memória tem não
 * bate com o que o Recreio guarda (sequência, fato repetido, tamanho) ou ele
 * exige uma fotografia antes. O mundo recomeça do que está gravado.
 */
const RECUSAS_DO_DIARIO = [
  "CHECKPOINT_NECESSARIO",
  "FATO_DUPLICADO",
  "SEQUENCIA",
  "TAMANHO_EXCEDIDO",
  "ENTRADA_INVALIDA",
] as const;

/** Um passo que ainda não foi concluído: os fatos esperam o diário e ninguém soube dele. */
type PassoPorConcluir = { saida: SaidaDoPasso; respostas: (() => void)[] };

const texto = new TextEncoder();
const leitura = new TextDecoder();

/**
 * O apelido de quem entra, como os outros jogadores vão ver. O Recreio já o
 * conferiu pelas regras dele; para o mundo continua sendo texto de fora: sai
 * sem caracteres de controle e cortado no tamanho que a simulação aceita. Se
 * não sobra nada, a pessoa entra sem apelido.
 */
export function apelidoParaOMundo(bruto: string): string | undefined {
  let saida = "";
  for (const letra of bruto.replace(/\p{Cc}+/gu, " ").trim()) {
    if (saida.length + letra.length > APELIDO_MAX) break;
    saida += letra;
  }
  return saida.trimEnd() || undefined;
}

export type MedidasDoAtor = {
  mundoId: string;
  tick: number;
  jogadores: number;
  moradores: number;
  passos: number;
  /** Tempo de CPU gasto simulando, em ms. */
  simulandoMs: number;
  piorPassoMs: number;
  /** Tempo esperando o diário e as fotografias, em ms. */
  gravandoMs: number;
  bytesEnviados: number;
  quadrosEnviados: number;
  fatos: number;
  fotografias: number;
  bytesDaUltimaFotografia: number;
};

export class Ator {
  readonly mundoId: MundoId;
  estado: "novo" | "ativo" | "fechado" | "perdido" = "novo";
  /** Posse desta instância sobre o mundo. */
  cerca = 0;
  /** Prazo local da posse: a hora do último batimento enviado, mais a validade. */
  validaAte = 0;
  readonly ligacoes = new Map<string, Ligacao>();

  private mundo: Mundo | null = null;
  private revisao = 0;
  private diarioSeq = 0;
  private fila: Promise<void> = Promise.resolve();
  private readonly caixa: EntradaNaCaixa[] = [];
  /**
   * Os passos cujo diário ainda não foi confirmado, na ordem em que
   * aconteceram. Nada anda até o primeiro gravar, e um passo novo (a entrada
   * de alguém) entra atrás dos que já esperam: nunca toma o lugar deles.
   */
  private readonly pendentes: PassoPorConcluir[] = [];
  /** Quem entrou e espera o diário confirmar tudo para ver o mundo. */
  private readonly chegando: (() => void)[] = [];
  /** O tick do último passo que os clientes puderam saber. */
  private tickConfirmado = 0;
  /** Bytes gravados no diário desde a última fotografia. */
  private diarioSemFoto = 0;
  private queixaEm = Number.NEGATIVE_INFINITY;
  private esperandoDesde: number | null = null;
  private passos = 0;
  private mudouDesdeAFoto = false;
  private fotografadoEm = 0;
  private diaReal = -1;
  private readonly medidas: Omit<MedidasDoAtor, "mundoId" | "tick" | "jogadores" | "moradores">;

  constructor(private readonly op: OpcoesDoAtor) {
    this.mundoId = op.mundoId;
    this.medidas = {
      passos: 0,
      simulandoMs: 0,
      piorPassoMs: 0,
      gravandoMs: 0,
      bytesEnviados: 0,
      quadrosEnviados: 0,
      fatos: 0,
      fotografias: 0,
      bytesDaUltimaFotografia: 0,
    };
  }

  get tick(): number {
    return this.mundo?.estado.relogio.tick ?? 0;
  }

  /** Para os testes olharem o mundo. Não é para mudar nada por aqui. */
  get simulacao(): Mundo | null {
    return this.mundo;
  }

  medir(): MedidasDoAtor {
    return {
      mundoId: this.mundoId,
      tick: this.tick,
      jogadores: this.ligacoes.size,
      moradores: this.mundo?.estado.moradores.ordem.length ?? 0,
      ...this.medidas,
    };
  }

  /** Põe um trabalho na fila do ator. Uma queda simulada derruba o ator, como a de verdade. */
  private emSerie<T>(trabalho: () => Promise<T>): Promise<T | undefined> {
    const resultado = this.fila.then(async () => {
      if (this.estado === "fechado" || this.estado === "perdido") return undefined;
      try {
        return await trabalho();
      } catch (erro) {
        if (erro instanceof QuedaSimulada) {
          this.cair();
          throw erro;
        }
        if (
          ehErroDoRecreio(erro, "POSSE_PERDIDA") ||
          ehErroDoRecreio(erro, "POSSE_DE_OUTRA_INSTANCIA")
        ) {
          this.perder("posse");
          return undefined;
        }
        throw erro;
      }
    });
    this.fila = resultado.then(
      () => undefined,
      () => undefined,
    );
    return resultado;
  }

  // --- Abrir ---

  private async abrir(): Promise<void> {
    const { host, mundoId } = this.op;
    const pedidoEm = this.op.agora();
    const posse = await host.reivindicarPosse(mundoId);
    this.cerca = posse.cerca;
    this.validaAte = pedidoEm + this.op.posseTtlMs;
    this.revisao = posse.revisao;

    const guardada = posse.fotografia
      ? await host.lerFotografia({ mundoId, cerca: this.cerca })
      : null;
    const coberto = guardada?.meta.diarioSeq ?? 0;
    const diario = await host.lerDiario({ mundoId, cerca: this.cerca, apos: coberto });
    const fatos = diario.map((entrada) => JSON.parse(leitura.decode(entrada.bytes)) as Fato);
    this.diarioSeq = diario.at(-1)?.seq ?? Math.max(coberto, posse.diarioSeq);
    this.diarioSemFoto = diario.reduce((total, entrada) => total + entrada.bytes.length, 0);

    // Sem fotografia, o mundo nasce de novo do mesmo jeito: a semente vem do id.
    const base = guardada
      ? (JSON.parse(gunzipSync(guardada.bytes).toString("utf8")) as unknown)
      : criarMundo({
          mundoId,
          semente: resumoDoTexto(mundoId),
          definicao: this.op.definicao ?? BAIRRO_DA_PROVA,
          fundadores: [],
          regras: this.op.regras,
        }).fotografar();
    this.mundo = restaurar(base, fatos);
    this.tickConfirmado = this.mundo.estado.relogio.tick;
    this.estado = "ativo";
    this.fotografadoEm = this.op.agora();
    this.op.registrar("mundo_aberto", {
      mundoId,
      cerca: this.cerca,
      revisao: this.revisao,
      fatosReaplicados: fatos.length,
      novo: !guardada,
      diarioSeq: this.diarioSeq,
      tick: this.tickConfirmado,
    });
    // A simulação volta parada no tick do último fato do diário, e o id de um
    // fato leva o tick: um pedido feito agora poderia gerar um fato com o id de
    // um que já está gravado, que o diário recusaria para sempre. Um passo
    // antes de qualquer pedido põe o mundo adiante desse tick.
    if (fatos.length > 0) await this.concluirPasso(this.mundo.avancar(100), []);
    // Um mundo novo, ou um que voltou só do diário, ganha logo a sua fotografia.
    if (!guardada || fatos.length > 0) await this.fotografar("checkpoint");
  }

  // --- Entrar ---

  /** Dá a quem entra o acesso à família, se ainda não tem. */
  private garantirAcesso(jogadorId: string, entrada: EntradaPermitida): void {
    const mundo = this.mundo as Mundo;
    if (mundo.estado.acessos.some((acesso) => acesso.perfilId === jogadorId)) return;
    const familias = listar(mundo.estado.familias);
    if (entrada.papel === "steward") {
      // Quem responde pelo mundo joga todas as famílias dele.
      for (const familia of familias) {
        mundo.aplicar({
          t: "conceder_acesso",
          perfilId: jogadorId,
          familiaId: familia.id,
          permissoes: [...PERMISSOES_DO_FUNDADOR],
        });
      }
      return;
    }
    // Quem foi convidado divide a família indicada no convite; sem indicação, a primeira.
    const indicada = entrada.participacao?.startsWith("familia:")
      ? entrada.participacao.slice("familia:".length)
      : null;
    const familia = familias.find((f) => f.id === indicada) ?? familias[0];
    if (!familia) return;
    mundo.aplicar({
      t: "conceder_acesso",
      perfilId: jogadorId,
      familiaId: familia.id,
      permissoes: [...PERMISSOES_DE_QUEM_DIVIDE],
    });
  }

  entrar(ligacao: Ligacao, sessao: SessaoVerificada): Promise<void> {
    return this.emSerie(async () => {
      if (this.estado === "novo") {
        try {
          await this.abrir();
        } catch (erro) {
          // Um ator que não abriu não fica na memória esperando: a próxima entrada tenta do zero.
          this.estado = "fechado";
          this.mundo = null;
          this.op.aoFechar(this);
          if (
            ehErroDoRecreio(erro, "POSSE_DE_OUTRA_INSTANCIA") ||
            ehErroDoRecreio(erro, "POSSE_PERDIDA")
          ) {
            // O mundo é de outra instância ou a posse venceu: o cliente reabre pelo Recreio.
            this.despedir(ligacao, FECHAMENTO.posse, "aguarde");
            return;
          }
          throw erro;
        }
      }
      const mundo = this.mundo as Mundo;

      let entrada: EntradaPermitida;
      try {
        entrada = await this.op.host.verificarEntrada({
          mundoId: this.mundoId,
          cerca: this.cerca,
          sid: sessao.sid,
          perfilId: sessao.perfilId,
        });
      } catch (erro) {
        if (ehErroDoRecreio(erro, "POSSE_PERDIDA")) throw erro;
        // Só uma recusa de verdade manda a pessoa embora. Recreio que não respondeu
        // não é falta de acesso: a entrada falha e o cliente reabre o mundo.
        if (ehErroDoRecreio(erro) && !ehPassageiro(erro)) {
          this.op.registrar("entrada_recusada", { mundoId: this.mundoId, codigo: erro.codigo });
          this.despedir(ligacao, FECHAMENTO.semAcesso);
          this.fecharSeVazio();
          return;
        }
        this.fecharSeVazio();
        throw erro;
      }
      if (ligacao.fase === "fechada") return;

      const jogadorId = entrada.membroId;
      // O mesmo jogador por outra conexão: a nova toma o lugar da antiga.
      for (const [sid, outra] of this.ligacoes) {
        if (outra !== ligacao && (sid === sessao.sid || outra.jogadorId === jogadorId)) {
          this.ligacoes.delete(sid);
          this.despedir(outra, FECHAMENTO.substituida);
        }
      }

      this.garantirAcesso(jogadorId, entrada);
      // O apelido fica na presença do mundo, que é replicada e nunca gravada.
      const apelido = apelidoParaOMundo(entrada.apelido);
      const conhecida = mundo.presenca.sessoes.some((s) => s.sessaoId === sessao.sid);
      mundo.aplicar(
        conhecida
          ? { t: "sessao_voltou", sessaoId: sessao.sid, apelido }
          : { t: "sessao_entrou", sessaoId: sessao.sid, perfilId: jogadorId, apelido },
      );

      // A fase continua `entrando` até a pessoa receber o mundo: antes disso ela
      // não recebe passo nem pulso, e o que mandar é ignorado.
      ligacao.ator = this;
      ligacao.sid = sessao.sid;
      ligacao.jogadorId = jogadorId;
      ligacao.perfilId = sessao.perfilId;
      ligacao.expiraEm = sessao.expiraEm;
      this.ligacoes.set(sessao.sid, ligacao);

      // Quem chega só vê o mundo quando o diário confirmou tudo: o acesso dela,
      // que é um fato, e qualquer passo que já esperava. Com o diário fora do
      // ar, a entrada fica na fila atrás deles.
      this.chegando.push(() => {
        if (ligacao.fase !== "entrando" || this.ligacoes.get(sessao.sid) !== ligacao) return;
        ligacao.fase = "dentro";
        this.enviar(ligacao, {
          t: "bem_vindo",
          v: VERSAO_DO_PROTOCOLO,
          jogadorId,
          apelido: apelido ?? "",
          papel: entrada.papel,
          tick: mundo.estado.relogio.tick,
          passoMs: 100,
          janelaDeGracaMs: mundo.estado.regras.janelaDeGracaMs,
        });
        this.enviar(ligacao, {
          t: "fotografia",
          seq: ++ligacao.seq,
          visao: mundo.visao(jogadorId),
        });
        this.op.registrar("jogador_entrou", {
          mundoId: this.mundoId,
          papel: entrada.papel,
          jogadores: this.ligacoes.size,
        });
      });
      await this.concluirPasso(mundo.avancar(0), []);
    }).then(() => undefined);
  }

  // --- Entradas dos jogadores ---

  receber(entrada: EntradaNaCaixa): void {
    if (this.estado !== "ativo") return;
    this.caixa.push(entrada);
  }

  /**
   * A sessão de jogo acabou no Recreio: quem estava com ela sai sem espera.
   * Vale também para quem tinha caído e ainda era esperado: uma sessão
   * encerrada não volta, então a reserva dela é liberada já.
   */
  encerrarSessao(sid: string): void {
    const ligacao = this.ligacoes.get(sid);
    if (ligacao) {
      this.ligacoes.delete(sid);
      this.despedir(ligacao, FECHAMENTO.semAcesso, "acesso_encerrado");
    }
    const conhecida = this.mundo?.presenca.sessoes.some((sessao) => sessao.sessaoId === sid);
    if (ligacao || conhecida) this.receber({ t: "encerrada", sid });
  }

  private aplicarCaixa(respostas: (() => void)[]): void {
    const mundo = this.mundo as Mundo;
    for (const entrada of this.caixa.splice(0)) {
      switch (entrada.t) {
        case "intencao": {
          const { ligacao, intencao } = entrada;
          if (ligacao.fase !== "dentro" || !ligacao.sid) break;
          const resultado = mundo.aplicar({ t: "intencao", sessaoId: ligacao.sid, intencao });
          // A resposta só sai depois que o passo estiver gravado.
          respostas.push(() => this.enviar(ligacao, { t: "resultado", resultado }));
          break;
        }
        case "caiu":
          mundo.aplicar({ t: "sessao_caiu", sessaoId: entrada.sid, agoraMs: this.op.agora() });
          break;
        case "encerrada":
          mundo.aplicar({ t: "sessao_saiu", sessaoId: entrada.sid });
          break;
        case "sair": {
          const { ligacao } = entrada;
          if (!ligacao.sid) break;
          mundo.aplicar({ t: "sessao_saiu", sessaoId: ligacao.sid });
          this.ligacoes.delete(ligacao.sid);
          respostas.push(() => {
            this.enviar(ligacao, { t: "saiu", salvo: true });
            this.despedir(ligacao, FECHAMENTO.normal);
          });
          break;
        }
      }
    }
  }

  // --- Passo ---

  /** Um passo de 100 ms. Quem chama é o relógio da instância. */
  passo(): Promise<void> {
    return this.emSerie(async () => {
      if (this.estado !== "ativo" || !this.mundo) return;
      const agora = this.op.agora();
      // Posse perto de vencer sem batimento confirmado: não simula nem escreve.
      if (agora >= this.validaAte - FOLGA_DE_AUTOCERCA_MS) return;

      // O contador segue o relógio real, com o mundo andando ou esperando: é ele que marca o pulso.
      this.passos++;
      const umSegundo = this.passos % 10 === 0;

      // Um passo anterior ainda não foi para o diário: tenta de novo antes de qualquer coisa.
      if (this.pendentes.length > 0) {
        const gravou = await this.escoar();
        // O mundo espera, mas o servidor está vivo: o pulso continua, com o tick
        // do último passo que os clientes puderam saber.
        if (!gravou && umSegundo && this.estado === "ativo") this.pulsar(agora);
        return;
      }

      const mundo = this.mundo;
      const inicio = performance.now();
      const respostas: (() => void)[] = [];
      this.aplicarCaixa(respostas);

      if (umSegundo) this.acadaSegundo(agora);

      const tickAntes = mundo.estado.relogio.tick;
      const saida = mundo.avancar(100);
      const gasto = performance.now() - inicio;
      this.medidas.passos++;
      this.medidas.simulandoMs += gasto;
      if (gasto > this.medidas.piorPassoMs) this.medidas.piorPassoMs = gasto;
      if (saida.tick !== tickAntes || saida.mudancas.length > 0) this.mudouDesdeAFoto = true;

      await this.concluirPasso(saida, respostas);
      if (this.estado !== "ativo") return;
      // O pulso sai depois do passo, com o tick em que o mundo ficou. Com o
      // diário por confirmar, o tick é o do último passo confirmado: os
      // clientes ainda não sabem deste.
      if (umSegundo) this.pulsar(agora);

      const marcante = saida.fatos.some((fato) => FATOS_MARCANTES.has(fato.dados.tipo));
      const venceu = this.op.agora() - this.fotografadoEm >= this.op.checkpointMs;
      // Diário grande sem fotografia: fotografa já, antes de o Recreio parar de aceitar entradas.
      const diarioGrande =
        this.diarioSemFoto >=
        (this.op.diarioParaFotografarBytes ?? DIARIO_SEM_FOTO_PARA_FOTOGRAFAR);
      if ((this.mudouDesdeAFoto && (marcante || venceu)) || diarioGrande) {
        await this.semDerrubar("fotografia", () => this.fotografar("checkpoint"));
      }

      // Ninguém conectado nem para voltar: o mundo salva, hiberna e sai da memória.
      if (
        this.estado === "ativo" &&
        this.ligacoes.size === 0 &&
        mundo.presenca.sessoes.length === 0
      ) {
        await this.semDerrubar("hibernacao", () => this.hibernar());
      }
    }).then(() => undefined);
  }

  /**
   * Fotografar e hibernar dependem do Recreio. Se ele não responde, o mundo
   * continua aberto e a tentativa se repete em alguns segundos; o que é
   * crítico já está no diário. Queda simulada e posse perdida seguem adiante.
   */
  private async semDerrubar(oQue: string, trabalho: () => Promise<void>): Promise<void> {
    try {
      await trabalho();
    } catch (erro) {
      if (erro instanceof QuedaSimulada) throw erro;
      if (
        ehErroDoRecreio(erro, "POSSE_PERDIDA") ||
        ehErroDoRecreio(erro, "POSSE_DE_OUTRA_INSTANCIA")
      ) {
        throw erro;
      }
      this.op.registrar(`${oQue}_indisponivel`, {
        mundoId: this.mundoId,
        codigo: ehErroDoRecreio(erro) ? erro.codigo : "erro",
      });
      // Tenta de novo em cinco segundos, não a cada passo.
      this.fotografadoEm = this.op.agora() - this.op.checkpointMs + 5000;
    }
  }

  private acadaSegundo(agora: number): void {
    const mundo = this.mundo as Mundo;
    mundo.aplicar({ t: "expirar", agoraMs: agora });
    const dia = Math.floor(agora / 86_400_000);
    if (dia !== this.diaReal) {
      this.diaReal = dia;
      mundo.aplicar({ t: "dia_real", dia });
    }
    for (const [sid, ligacao] of this.ligacoes) {
      // Sessão de jogo vencida sem renovação: a conexão fecha e a reserva espera a volta.
      if (sessaoVencida(ligacao.expiraEm, agora)) {
        this.ligacoes.delete(sid);
        this.despedir(ligacao, FECHAMENTO.sessao);
        mundo.aplicar({ t: "sessao_caiu", sessaoId: sid, agoraMs: agora });
      } else if (ligacao.conexao.pendente() > ATRASO_MAXIMO_BYTES) {
        this.ligacoes.delete(sid);
        this.despedir(ligacao, FECHAMENTO.atrasado);
        mundo.aplicar({ t: "sessao_caiu", sessaoId: sid, agoraMs: agora });
      }
    }
  }

  /**
   * O sinal de vida de uma vez por segundo: diz a quem já está no mundo em que
   * tick ele está. Enquanto um passo espera o diário, é o tick do último passo
   * confirmado.
   */
  private pulsar(agora: number): void {
    const tick =
      this.pendentes.length > 0 ? this.tickConfirmado : (this.mundo as Mundo).estado.relogio.tick;
    for (const ligacao of this.ligacoes.values()) {
      if (ligacao.fase !== "dentro") continue;
      this.enviar(ligacao, { t: "pulso", n: this.passos, tick, agoraMs: agora });
    }
  }

  /**
   * Põe o passo na fila dos que esperam o diário e conclui o que der, em
   * ordem. Um passo novo nunca passa na frente de um que ainda não gravou.
   */
  private concluirPasso(saida: SaidaDoPasso, respostas: (() => void)[]): Promise<boolean> {
    this.pendentes.push({ saida, respostas });
    return this.escoar();
  }

  /**
   * Conclui os passos que esperam, do mais antigo para o mais novo: grava os
   * fatos e, só depois, responde a quem pediu e conta aos clientes o que
   * mudou. Se o diário não responde, para no primeiro que não gravou e o
   * mundo espera. Devolve se não sobrou nenhum.
   */
  private async escoar(): Promise<boolean> {
    while (this.pendentes.length > 0) {
      const passo = this.pendentes[0] as PassoPorConcluir;
      const { saida } = passo;
      if (saida.fatos.length > 0) {
        const inicio = performance.now();
        try {
          await this.gravarFatos(saida.fatos);
        } catch (erro) {
          if (erro instanceof QuedaSimulada) throw erro;
          if (
            ehErroDoRecreio(erro, "POSSE_PERDIDA") ||
            ehErroDoRecreio(erro, "POSSE_DE_OUTRA_INSTANCIA")
          ) {
            throw erro;
          }
          const recusa = RECUSAS_DO_DIARIO.find((codigo) => ehErroDoRecreio(erro, codigo));
          if (recusa) {
            this.recomecar(recusa);
            return false;
          }
          // Rede ou diário fora do ar: tenta de novo no próximo passo, sem avisar ninguém.
          const agora = this.op.agora();
          this.esperandoDesde ??= agora;
          if (agora - this.queixaEm >= REPETIR_QUEIXA_MS) {
            this.queixaEm = agora;
            this.op.registrar("diario_indisponivel", {
              mundoId: this.mundoId,
              codigo: ehErroDoRecreio(erro) ? erro.codigo : "erro",
              passosEmEspera: this.pendentes.length,
            });
          }
          return false;
        } finally {
          this.medidas.gravandoMs += performance.now() - inicio;
        }
        this.medidas.fatos += saida.fatos.length;
        if (this.esperandoDesde !== null) {
          this.op.registrar("diario_voltou", {
            mundoId: this.mundoId,
            esperouMs: this.op.agora() - this.esperandoDesde,
          });
          this.esperandoDesde = null;
          this.queixaEm = Number.NEGATIVE_INFINITY;
        }
        this.op.falhas.atingir("depois_do_diario", { fatos: saida.fatos });
      }
      this.pendentes.shift();
      this.tickConfirmado = saida.tick;

      for (const responder of passo.respostas) responder();
      if (saida.mudancas.length > 0 || saida.apresentacao.length > 0) {
        for (const ligacao of this.ligacoes.values()) {
          // Quem ainda está entrando recebe a visão inteira depois, e não este passo.
          if (ligacao.fase !== "dentro") continue;
          this.enviar(ligacao, {
            t: "passo",
            seq: ++ligacao.seq,
            tick: saida.tick,
            mudancas: saida.mudancas,
            eventos: saida.apresentacao,
          });
        }
      }
      if (saida.fatos.length > 0) {
        this.op.falhas.atingir("depois_de_avisar", { fatos: saida.fatos });
      }
    }
    // Tudo gravado: quem esperava para entrar vê o mundo agora.
    for (const receber of this.chegando.splice(0)) receber();
    return true;
  }

  /**
   * Manda os fatos de um passo ao diário, em lotes que cabem nos tetos do
   * Recreio. Repetir um lote já gravado (a resposta se perdeu no caminho) não
   * faz nada lá, então uma nova tentativa recomeça do primeiro que falta.
   */
  private async gravarFatos(fatos: readonly Fato[]): Promise<void> {
    this.op.falhas.atingir("antes_do_diario", { fatos });
    const lotes: EntradaDoDiario[][] = [];
    let lote: EntradaDoDiario[] = [];
    let tamanho = 0;
    for (const [i, fato] of fatos.entries()) {
      const entrada: EntradaDoDiario = {
        seq: this.diarioSeq + 1 + i,
        tick: fato.tick,
        fatoId: fato.id,
        bytes: texto.encode(JSON.stringify(fato)),
      };
      const cheio =
        lote.length >= ENTRADAS_POR_LOTE ||
        tamanho + entrada.bytes.length > LIMITES.diarioLoteMaxBytes;
      if (lote.length > 0 && cheio) {
        lotes.push(lote);
        lote = [];
        tamanho = 0;
      }
      lote.push(entrada);
      tamanho += entrada.bytes.length;
    }
    if (lote.length > 0) lotes.push(lote);
    for (const parte of lotes) {
      const { confirmadoAte } = await this.op.host.anexarAoDiario({
        mundoId: this.mundoId,
        cerca: this.cerca,
        entradas: parte,
      });
      // Um lote repetido volta com o diário onde já estava: só conta o que entrou agora.
      if (confirmadoAte > this.diarioSeq) {
        this.diarioSemFoto += parte.reduce((total, entrada) => total + entrada.bytes.length, 0);
      }
      this.diarioSeq = Math.max(this.diarioSeq, confirmadoAte);
    }
  }

  // --- Fotografia, hibernação, fim ---

  private resumo(): { titulo: string; subtitulo: string } {
    const estado = (this.mundo as Mundo).estado;
    const familias = listar(estado.familias);
    const moradores = listar(estado.moradores).filter((m) => m.familiaId !== null).length;
    const dia = Math.floor(estado.relogio.tick / ticksPorDia(estado.relogio)) + 1;
    return {
      titulo: familias
        .map((f) => `Família ${f.nome}`)
        .join(" e ")
        .slice(0, 60),
      subtitulo: `Dia ${dia} · ${moradores} ${moradores === 1 ? "morador" : "moradores"}`,
    };
  }

  private async fotografar(tipo: "checkpoint" | "hibernate"): Promise<void> {
    const mundo = this.mundo as Mundo;
    // Um passo com fatos por gravar não entra na fotografia: ela cobre só o que está no diário.
    if (this.pendentes.length > 0) return;
    const bytes = gzipSync(JSON.stringify(mundo.fotografar()));
    this.op.falhas.atingir("antes_da_fotografia");
    const inicio = performance.now();
    try {
      const { revisao } = await this.op.host.gravarFotografia({
        mundoId: this.mundoId,
        cerca: this.cerca,
        revisaoEsperada: this.revisao,
        diarioSeq: this.diarioSeq,
        tick: mundo.estado.relogio.tick,
        schemaVersion: VERSAO_DO_MUNDO,
        tipo,
        bytes,
        resumo: this.resumo(),
      });
      this.revisao = revisao;
    } catch (erro) {
      // Outra escrita passou na frente: esta instância não é mais a dona do mundo.
      if (ehErroDoRecreio(erro, "REVISAO_DIVERGENTE")) {
        this.perder("revisao");
        return;
      }
      throw erro;
    } finally {
      this.medidas.gravandoMs += performance.now() - inicio;
    }
    this.mudouDesdeAFoto = false;
    this.diarioSemFoto = 0;
    this.fotografadoEm = this.op.agora();
    this.medidas.fotografias++;
    this.medidas.bytesDaUltimaFotografia = bytes.length;
    this.op.registrar("fotografia_gravada", {
      mundoId: this.mundoId,
      tipo,
      revisao: this.revisao,
      diarioSeq: this.diarioSeq,
      tick: mundo.estado.relogio.tick,
      bytes: bytes.length,
    });
  }

  private async hibernar(): Promise<void> {
    if (this.estado !== "ativo") return;
    await this.fotografar("hibernate");
    if (this.estado !== "ativo" || this.pendentes.length > 0) return;
    await this.op.host.liberarPosse({ mundoId: this.mundoId, cerca: this.cerca, motivo: "vazio" });
    this.estado = "fechado";
    this.mundo = null;
    this.op.registrar("mundo_hibernou", { mundoId: this.mundoId, ...this.medidas });
    this.op.aoFechar(this);
  }

  private fecharSeVazio(): void {
    if (this.ligacoes.size === 0 && this.mundo?.presenca.sessoes.length === 0) {
      // Sem o Recreio a hibernação fica para o próximo passo; daqui não sai erro sem dono.
      this.emSerie(() => this.semDerrubar("hibernacao", () => this.hibernar())).catch(() => {});
    }
  }

  /**
   * Desligamento da instância: salva, solta a posse e manda os clientes
   * reabrirem. O que ainda esperava o diário tem uma última tentativa; se ela
   * falha, nada é fotografado nem solto (a fotografia só cobre o que está no
   * diário), e a próxima instância recupera o que estava gravado quando a
   * posse vencer. Ninguém chegou a saber do que não gravou.
   */
  encerrar(): Promise<void> {
    return this.emSerie(async () => {
      if (this.estado !== "ativo") return;
      for (const ligacao of this.ligacoes.values()) {
        this.enviar(ligacao, { t: "aviso", codigo: "servidor_reiniciando" });
      }
      try {
        if (await this.escoar()) {
          await this.fotografar("checkpoint");
          if (this.estado === "ativo") {
            await this.op.host.liberarPosse({
              mundoId: this.mundoId,
              cerca: this.cerca,
              motivo: "drenagem",
            });
            this.op.registrar("posse_solta", {
              mundoId: this.mundoId,
              cerca: this.cerca,
              motivo: "drenagem",
            });
          }
        }
      } catch (erro) {
        if (erro instanceof QuedaSimulada) throw erro;
        if (
          ehErroDoRecreio(erro, "POSSE_PERDIDA") ||
          ehErroDoRecreio(erro, "POSSE_DE_OUTRA_INSTANCIA")
        ) {
          throw erro;
        }
        this.op.registrar("encerramento_sem_salvar", {
          mundoId: this.mundoId,
          codigo: ehErroDoRecreio(erro) ? erro.codigo : "erro",
        });
      }
      if (this.estado !== "ativo") return;
      if (this.pendentes.length > 0) {
        this.op.registrar("encerramento_sem_salvar", {
          mundoId: this.mundoId,
          codigo: "diario_indisponivel",
          passosEmEspera: this.pendentes.length,
        });
      }
      this.largar(FECHAMENTO.reiniciando);
      this.estado = "fechado";
      this.op.aoFechar(this);
    }).then(() => undefined);
  }

  /**
   * O diário recusou o passo de um jeito que tentar de novo não resolve. O
   * caso previsto é o Recreio exigir uma fotografia (`CHECKPOINT_NECESSARIO`),
   * que não pode ser tirada agora: a memória já tem o passo que não gravou. Os
   * outros (`RECUSAS_DO_DIARIO`) dizem que a memória e o diário não batem. O
   * ator larga o que tem e fecha as conexões; a posse continua desta
   * instância. Quem reabre o mundo cai aqui de novo, e a abertura recarrega o
   * que está gravado e fotografa antes de qualquer pedido.
   */
  private recomecar(motivo: string): void {
    this.op.registrar("mundo_recomeca", {
      mundoId: this.mundoId,
      motivo,
      passosDescartados: this.pendentes.length,
    });
    this.largar(FECHAMENTO.reiniciando);
    this.estado = "fechado";
    this.op.aoFechar(this);
  }

  /** A posse não é mais desta instância: para tudo, sem escrever mais nada. */
  perder(motivo: string): void {
    if (this.estado === "perdido" || this.estado === "fechado") return;
    this.op.registrar("posse_perdida", { mundoId: this.mundoId, cerca: this.cerca, motivo });
    this.largar(FECHAMENTO.posse);
    this.estado = "perdido";
    this.op.aoFechar(this);
  }

  /** Como uma queda do processo: o estado some e ninguém é avisado. */
  cair(): void {
    this.estado = "perdido";
    this.mundo = null;
    this.caixa.length = 0;
    this.pendentes.length = 0;
    this.chegando.length = 0;
    for (const ligacao of this.ligacoes.values()) ligacao.fase = "fechada";
    this.ligacoes.clear();
    this.op.aoFechar(this);
  }

  private largar(codigo: number): void {
    for (const ligacao of this.ligacoes.values()) this.despedir(ligacao, codigo);
    this.ligacoes.clear();
    this.caixa.length = 0;
    this.pendentes.length = 0;
    this.chegando.length = 0;
    this.mundo = null;
  }

  // --- Envio ---

  private enviar(ligacao: Ligacao, mensagem: MensagemDoServidor): void {
    if (ligacao.fase === "fechada") return;
    const quadro = JSON.stringify(mensagem);
    this.medidas.bytesEnviados += quadro.length;
    this.medidas.quadrosEnviados++;
    ligacao.conexao.enviar(quadro);
  }

  private despedir(ligacao: Ligacao, codigo: number, aviso?: "aguarde" | "acesso_encerrado"): void {
    if (ligacao.fase === "fechada") return;
    if (aviso) this.enviar(ligacao, { t: "aviso", codigo: aviso });
    ligacao.fase = "fechada";
    ligacao.conexao.fechar(codigo);
  }
}
