import {
  distancia,
  type EstadoDoMundo,
  type Morador,
  type MoradorId,
  type Movimento,
  type Navegador,
  obter,
  type PontoMm,
  partidaDe,
  podeSerInterrompido,
} from "@informach/morada-sim";
import { MM_POR_TICK } from "@informach/morada-sim/conteudo";

/**
 * Previsão do "ir até aqui" do próprio morador, e a suavização do que a cena
 * desenha.
 *
 * O servidor decide tudo; a previsão só adianta o que ele vai dizer. Ao
 * clicar, o cliente calcula a rota com o mesmo navegador do servidor e começa
 * a andar. Quando a rota do servidor chega, o desenho desliza da posição
 * prevista para a curva do servidor em 150 ms. Se o servidor recusa, a
 * previsão é cancelada e o desenho desliza de volta.
 */

export const TEMPO_DE_AJUSTE_MS = 150;
/** Sem notícia do servidor por este tempo, a previsão desiste. */
export const PRAZO_DA_PREVISAO_MS = 2500;
/** Acima disto não é correção, é teleporte (chegou uma visita, mudou de casa): sem deslizar. */
const SALTO_MAXIMO_MM = 4000;

export type PontoReal = [x: number, y: number];

export type NoCaminho = {
  pos: PontoReal;
  /** Para onde aponta o trecho em que está; `null` se a rota não tem trecho. */
  direcao: PontoReal | null;
  /** Ainda não chegou ao fim. */
  andando: boolean;
};

/** Onde se está depois de andar `percorrido` milímetros pela rota. */
export function pontoNaRota(rota: readonly PontoMm[], percorrido: number): NoCaminho {
  const primeiro = rota[0] ?? [0, 0];
  let resto = Math.max(0, percorrido);
  let direcao: PontoReal | null = null;
  for (let i = 1; i < rota.length; i++) {
    const a = rota[i - 1] as PontoMm;
    const b = rota[i] as PontoMm;
    // O comprimento inteiro, como na simulação, para os dois lados trocarem de trecho no mesmo tick.
    const trecho = distancia(a, b);
    if (trecho <= 0) continue;
    direcao = [(b[0] - a[0]) / trecho, (b[1] - a[1]) / trecho];
    if (resto < trecho) {
      return {
        pos: [a[0] + ((b[0] - a[0]) * resto) / trecho, a[1] + ((b[1] - a[1]) * resto) / trecho],
        direcao,
        andando: true,
      };
    }
    resto -= trecho;
  }
  const ultimo = rota[rota.length - 1] ?? primeiro;
  return { pos: [ultimo[0], ultimo[1]], direcao, andando: false };
}

/**
 * A posição em um tick com parte fracionária. Nos ticks inteiros é a mesma de
 * `posicaoNoMovimento` da simulação, a menos do arredondamento de um milímetro.
 */
export function posicaoFracionada(movimento: Movimento, tick: number): NoCaminho {
  return pontoNaRota(
    movimento.rota,
    Math.max(0, tick - movimento.inicioTick) * movimento.mmPorTick,
  );
}

/**
 * O servidor começaria uma ação nova deste morador no próximo passo: não há
 * pedido de jogador na fila dele e o que ele faz agora pode ceder o lugar, pela
 * regra da simulação. `ignorar` é uma ação que o cliente acabou de mandar
 * cancelar e que o espelho ainda mostra.
 */
export function comecariaJa(estado: EstadoDoMundo, morador: Morador, ignorar?: string): boolean {
  for (const id of morador.fila) {
    if (obter(estado.acoes, id)?.origem === "jogador") return false;
  }
  return morador.acaoAtual === ignorar || podeSerInterrompido(estado, morador);
}

/** A rota que o servidor daria a este clique, ou `null` se ele recusaria. */
export function rotaPrevista(
  estado: EstadoDoMundo,
  navegador: Navegador,
  morador: Morador,
  destino: PontoMm,
  tick: number,
): PontoMm[] | null {
  if (MM_POR_TICK[morador.fase] <= 0 || !navegador.livre(destino)) return null;
  // De onde o servidor parte: de onde o morador está, ou de onde ele se levanta.
  const partida = partidaDe(estado, navegador, morador, tick);
  if (!partida) return null;
  return navegador.rota(partida, destino);
}

type EmCurso = {
  moradorId: MoradorId;
  comandoId: string;
  rota: PontoMm[];
  mmPorTick: number;
  inicioMs: number;
  /** O servidor aceitou o comando; falta a rota dele chegar. */
  aceito: boolean;
};

export class PrevisaoDeAndar {
  private emCurso: EmCurso | null = null;

  constructor(private readonly passoMs = 100) {}

  get comandoId(): string | null {
    return this.emCurso?.comandoId ?? null;
  }

  /** A rota prevista em curso, para quem quer conferir. */
  get rota(): readonly PontoMm[] | null {
    return this.emCurso?.rota ?? null;
  }

  ativaPara(moradorId: MoradorId): boolean {
    return this.emCurso?.moradorId === moradorId;
  }

  iniciar(dados: {
    moradorId: MoradorId;
    comandoId: string;
    rota: PontoMm[];
    mmPorTick: number;
    agoraMs: number;
  }): void {
    this.emCurso = {
      moradorId: dados.moradorId,
      comandoId: dados.comandoId,
      rota: dados.rota,
      mmPorTick: dados.mmPorTick,
      inicioMs: dados.agoraMs,
      aceito: false,
    };
  }

  /** Onde o morador previsto está agora. `velocidade` é o ritmo do mundo (0 a 3). */
  posicao(agoraMs: number, velocidade: number): NoCaminho | null {
    const previsao = this.emCurso;
    if (!previsao) return null;
    const ticks = (Math.max(0, agoraMs - previsao.inicioMs) / this.passoMs) * velocidade;
    return pontoNaRota(previsao.rota, ticks * previsao.mmPorTick);
  }

  /** A resposta do servidor ao comando previsto. Devolve `false` se a previsão foi cancelada. */
  resultado(comandoId: string, ok: boolean): boolean {
    if (this.emCurso?.comandoId !== comandoId) return true;
    if (!ok) {
      this.emCurso = null;
      return false;
    }
    this.emCurso.aceito = true;
    return true;
  }

  /**
   * Confere o espelho depois de cada passo. A previsão termina quando a ação
   * do servidor para este comando começa (a rota dele passa a valer), quando
   * a ação some sem ter começado, quando a pessoa deixa de dirigir o morador
   * ou quando o prazo passa. Devolve `true` se terminou agora.
   */
  conferir(estado: EstadoDoMundo, dirigeAinda: boolean, agoraMs: number): boolean {
    const previsao = this.emCurso;
    if (!previsao) return false;
    const morador = obter(estado.moradores, previsao.moradorId);
    const acao = morador?.acaoAtual ? obter(estado.acoes, morador.acaoAtual) : undefined;
    const comecou = acao?.comandoId === previsao.comandoId && acao.estado !== "na_fila";
    const naFila =
      acao?.comandoId === previsao.comandoId ||
      (morador?.fila ?? []).some((id) => obter(estado.acoes, id)?.comandoId === previsao.comandoId);
    const sumiu = previsao.aceito && !naFila;
    const venceu = agoraMs - previsao.inicioMs > PRAZO_DA_PREVISAO_MS;
    if (!morador || !dirigeAinda || comecou || sumiu || venceu) {
      this.emCurso = null;
      return true;
    }
    return false;
  }

  cancelar(): void {
    this.emCurso = null;
  }
}

/**
 * Tira os trancos do desenho de um morador. Enquanto o alvo anda de modo
 * contínuo, o desenho é o alvo. Quando o alvo salta (a rota do servidor tomou
 * o lugar da prevista, alguém se levantou do sofá), o desenho parte de onde
 * estava e alcança o alvo em 150 ms.
 */
export class Suavizador {
  private ultimoAlvo: PontoReal | null = null;
  private desenhado: PontoReal = [0, 0];
  private desvio: PontoReal = [0, 0];
  private desvioEm = 0;
  private forcado = false;

  /** O próximo alvo é tratado como salto, mesmo que esteja perto. */
  forcar(): void {
    this.forcado = true;
  }

  reiniciar(): void {
    this.ultimoAlvo = null;
    this.desvio = [0, 0];
    this.forcado = false;
  }

  /**
   * `folgaMm` é o quanto o alvo pode andar de um quadro para o outro sem que
   * isso seja um salto: a velocidade de quem anda, com margem.
   */
  passo(alvo: PontoReal, agoraMs: number, folgaMm: number): PontoReal {
    const anterior = this.ultimoAlvo;
    if (anterior) {
      const salto = Math.hypot(alvo[0] - anterior[0], alvo[1] - anterior[1]);
      const longe = Math.hypot(alvo[0] - this.desenhado[0], alvo[1] - this.desenhado[1]);
      if (longe >= SALTO_MAXIMO_MM) {
        this.desvio = [0, 0];
      } else if (this.forcado || salto > folgaMm) {
        this.desvio = [this.desenhado[0] - alvo[0], this.desenhado[1] - alvo[1]];
        this.desvioEm = agoraMs;
      }
    }
    this.forcado = false;
    this.ultimoAlvo = [alvo[0], alvo[1]];
    const resto = 1 - Math.min(1, Math.max(0, (agoraMs - this.desvioEm) / TEMPO_DE_AJUSTE_MS));
    this.desenhado = [alvo[0] + this.desvio[0] * resto, alvo[1] + this.desvio[1] * resto];
    return [this.desenhado[0], this.desenhado[1]];
  }
}
