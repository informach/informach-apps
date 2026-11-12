import {
  type AcaoPedida,
  criarNavegador,
  type EstadoDoMundo,
  type LoteId,
  type MoradorId,
  type Navegador,
  objetosDoLote,
  obter,
  ondeEsta,
  type PontoMm,
  type Resultado,
} from "@informach/morada-sim";
import { MM_POR_TICK } from "@informach/morada-sim/conteudo";
import type { FonteDoMundo } from "../fonte";
import { textoDoEvento } from "../modelo/eventos";
import { textoDaRecusa } from "../modelo/textos";
import { Conexao, type ConstrutorDeSoquete } from "../rede/conexao";
import { RelogioDoServidor } from "../rede/relogio";
import { Comandos } from "./comandos";
import { Loja } from "./loja";
import { comecariaJa, PrevisaoDeAndar, rotaPrevista } from "./previsao";

/**
 * Uma sessão de jogo do lado do cliente: liga a conexão ao espelho, ao
 * relógio, aos comandos e à previsão. Não sabe de tela: a cena e o HUD leem
 * daqui e pedem por aqui.
 */

export type OpcoesDaSessao = {
  fonte: FonteDoMundo;
  /** Para os testes. */
  Soquete?: ConstrutorDeSoquete;
  agora?(): number;
  agendar?(chamar: () => void, emMs: number): () => void;
  aleatorio?(): number;
  novoId?(): string;
};

export class Sessao {
  readonly loja: Loja;
  readonly relogio = new RelogioDoServidor();
  readonly previsao = new PrevisaoDeAndar();
  readonly comandos: Comandos;
  readonly conexao: Conexao;
  private readonly agora: () => number;
  private readonly navegadores = new Map<LoteId, { chave: string; navegador: Navegador }>();

  constructor(opcoes: OpcoesDaSessao) {
    const agora = opcoes.agora ?? (() => Date.now());
    this.agora = agora;
    this.loja = new Loja({ agora });
    this.conexao = new Conexao({
      fonte: opcoes.fonte,
      Soquete: opcoes.Soquete,
      agora,
      agendar: opcoes.agendar,
      aleatorio: opcoes.aleatorio,
      ouvintes: {
        estado: (estado) => {
          if (estado.fase === "encerrado") {
            this.previsao.cancelar();
            this.comandos.desistir();
          }
          this.loja.definirConexao(estado);
        },
        bemVindo: (mensagem) => {
          this.loja.jogador = {
            jogadorId: mensagem.jogadorId,
            apelido: mensagem.apelido,
            papel: mensagem.papel,
            janelaDeGracaMs: mensagem.janelaDeGracaMs,
          };
          this.loja.tocar();
        },
        fotografia: (mensagem) => {
          const { visao } = mensagem;
          this.relogio.reiniciar(visao.tick, agora(), visao.relogio.velocidade);
          this.previsao.cancelar();
          this.navegadores.clear();
          this.loja.receberFotografia(visao);
          // O que ficou sem resposta na conexão anterior vai de novo, com o mesmo id.
          this.comandos.reenviar();
        },
        passo: (mensagem) => {
          const visao = this.loja.visao;
          if (!visao) return;
          this.loja.receberPasso(mensagem.tick, mensagem.mudancas);
          const quando = agora();
          this.relogio.definirVelocidade(visao.relogio.velocidade, quando);
          this.relogio.amostra(mensagem.tick, quando);
          const estado = this.estado();
          if (!estado) return;
          const meu = this.loja.meuMoradorId();
          for (const evento of mensagem.eventos) {
            const aviso = textoDoEvento(estado, evento, meu);
            if (aviso) this.loja.avisar(aviso.tom, aviso.texto);
          }
          const previsto = this.previsao.comandoId !== null;
          if (previsto && meu) this.previsao.conferir(estado, this.previsao.ativaPara(meu), quando);
          else if (previsto) this.previsao.cancelar();
        },
        resultado: (mensagem) => {
          this.comandos.receber(mensagem.resultado);
        },
        pulso: (mensagem) => {
          this.relogio.amostra(mensagem.tick, agora());
        },
      },
    });
    this.comandos = new Comandos({
      enviar: (intencao) => this.conexao.enviar({ t: "intencao", intencao }),
      mundoId: () => this.conexao.mundoId,
      novoId: opcoes.novoId,
    });
  }

  iniciar(): void {
    this.conexao.iniciar();
  }

  /** O relógio local desta sessão, em milissegundos: a mesma base da previsão. */
  agoraMs(): number {
    return this.agora();
  }

  /** O tick do servidor agora, com parte fracionária. */
  tickFracionado(): number {
    return this.relogio.estimar(this.agora());
  }

  tick(): number {
    return Math.floor(this.tickFracionado());
  }

  /** O espelho na forma do estado da simulação, no tick que o cliente estima. */
  estado(): EstadoDoMundo | null {
    return this.loja.estado(this.tick());
  }

  /** O navegador de um lote, o mesmo que o servidor monta. Refeito quando o lote muda. */
  navegador(loteId: LoteId): Navegador | null {
    const estado = this.loja.estado(0);
    const lote = estado ? obter(estado.lotes, loteId) : undefined;
    if (!estado || !lote) return null;
    const imovel = lote.imovelId ? (obter(estado.imoveis, lote.imovelId) ?? null) : null;
    const chave = `${lote.revisaoDoEspaco}/${imovel?.revisao ?? 0}/${this.loja.revisaoDaCasa}`;
    const guardado = this.navegadores.get(loteId);
    if (guardado?.chave === chave) return guardado.navegador;
    const navegador = criarNavegador(lote, imovel, objetosDoLote(estado, loteId));
    this.navegadores.set(loteId, { chave, navegador });
    return navegador;
  }

  /**
   * Faz um pedido e conta à pessoa se ele for recusado. A promessa traz a
   * resposta do servidor nos dois casos.
   */
  comandar(
    moradorId: MoradorId | null,
    acao: AcaoPedida,
    opcoes: { silencioso?: boolean } = {},
  ): Promise<Resultado> {
    const { resultado } = this.comandos.comando(moradorId, acao);
    return resultado.then((resposta) => {
      if (!resposta.ok && !opcoes.silencioso) {
        this.loja.avisar("recusa", textoDaRecusa(resposta.motivo, resposta.detalhe));
      }
      return resposta;
    });
  }

  /**
   * "Ir até aqui" com o morador que a pessoa dirige. Se o servidor começaria a
   * andar no próximo passo, o cliente começa já, pela rota que o servidor vai
   * dar; a resposta confirma ou cancela. Devolve o que foi feito.
   */
  irPara(destino: PontoMm): "enviado" | "previsto" | "sem_morador" | "bloqueado" {
    const estado = this.estado();
    const meu = this.loja.meuMoradorId();
    const morador = estado && meu ? obter(estado.moradores, meu) : undefined;
    if (!estado || !meu || !morador) {
      this.loja.avisar("info", "Escolha um morador pelo retrato para andar pela casa.");
      return "sem_morador";
    }
    const tick = estado.relogio.tick;
    const onde = ondeEsta(estado, morador, tick);
    const navegador = onde ? this.navegador(onde.loteId) : null;
    if (!onde || !navegador?.livre(destino) || MM_POR_TICK[morador.fase] <= 0) {
      this.loja.avisar("recusa", "Não dá para ir até ali.");
      return "bloqueado";
    }

    // Um clique novo troca a caminhada em curso em vez de entrar na fila atrás dela.
    const atual = morador.acaoAtual ? obter(estado.acoes, morador.acaoAtual) : undefined;
    const trocar = atual?.origem === "jogador" && atual.interacao === "andar_ate" ? atual : null;
    if (trocar) {
      void this.comandar(meu, { t: "cancelar_acao", acaoId: trocar.id }, { silencioso: true });
    }

    const quando = this.agora();
    const jaPrevisto = this.previsao.ativaPara(meu)
      ? this.previsao.posicao(quando, this.relogio.velocidade)
      : null;
    const { comandoId, resultado } = this.comandos.comando(meu, {
      t: "ir_para",
      pos: destino,
      andar: onde.andar,
    });

    let previsto = false;
    if (comecariaJa(estado, morador, trocar?.id) || jaPrevisto) {
      // Quem já andava por previsão parte de onde o desenho está, não de onde o servidor o viu por último.
      const rota = jaPrevisto
        ? navegador.rota([Math.round(jaPrevisto.pos[0]), Math.round(jaPrevisto.pos[1])], destino)
        : rotaPrevista(estado, navegador, morador, destino, tick);
      if (rota && rota.length >= 2) {
        this.previsao.iniciar({
          moradorId: meu,
          comandoId,
          rota,
          mmPorTick: MM_POR_TICK[morador.fase],
          agoraMs: quando,
        });
        previsto = true;
      }
    }

    void resultado.then((resposta) => {
      this.previsao.resultado(comandoId, resposta.ok);
      if (!resposta.ok) {
        this.loja.avisar("recusa", textoDaRecusa(resposta.motivo, resposta.detalhe));
      }
    });
    return previsto ? "previsto" : "enviado";
  }

  /** Sai do mundo de propósito. Devolve se o servidor confirmou que salvou. */
  sair(): Promise<boolean> {
    return this.conexao.sair();
  }
}
