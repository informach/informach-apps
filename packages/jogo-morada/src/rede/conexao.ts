import {
  type CodigoDeAviso,
  FECHAMENTO,
  FECHAMENTOS_QUE_REABREM,
  type MensagemDoCliente,
  type MensagemDoServidor,
  SUBPROTOCOLO,
  VERSAO_DO_PROTOCOLO,
} from "@informach/morada-sim/protocolo";
import type { FonteDoMundo } from "../fonte";

/**
 * A conexão com o servidor do jogo: abre o mundo pela fonte, apresenta a
 * sessão no primeiro quadro, confere a sequência do que chega e decide, pelo
 * motivo do fechamento, se reabre ou para.
 *
 * Não sabe do espelho nem da cena: entrega as mensagens a quem ouve.
 */

export type MotivoDoFim =
  /** A pessoa saiu de propósito. */
  | "saiu"
  /** Sessão de jogo ausente, vencida ou que não confere. */
  | "sessao"
  /** A sessão vale, mas não dá direito a este mundo. */
  | "sem_acesso"
  /** O direito de jogar acabou no Recreio. */
  | "acesso_encerrado"
  /** O mesmo jogador entrou por outra conexão. */
  | "substituida"
  /** O servidor recusou um quadro: cliente e servidor de versões diferentes. */
  | "protocolo";

export type MotivoDeReabertura =
  | "rede"
  | "posse"
  | "reiniciando"
  | "atrasado"
  | "cheio"
  | "lacuna"
  | "sem_sinal"
  | "fonte";

export type EstadoDaConexao =
  | { fase: "conectando" }
  | { fase: "entrando" }
  | { fase: "montando" }
  | { fase: "pronto" }
  | { fase: "reconectando"; tentativa: number; motivo: MotivoDeReabertura }
  | { fase: "encerrado"; motivo: MotivoDoFim; detalhe?: string };

/** O mínimo de um WebSocket que a conexão usa. O do navegador é adaptado para isto. */
export interface SoqueteDeRede {
  onopen: (() => void) | null;
  onmessage: ((evento: { data: unknown }) => void) | null;
  onclose: ((evento: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(dados: string): void;
  close(codigo?: number): void;
}

export type ConstrutorDeSoquete = new (endereco: string, subprotocolo: string) => SoqueteDeRede;

/** O WebSocket do navegador, na forma que a conexão espera. */
class SoqueteDoNavegador implements SoqueteDeRede {
  onopen: (() => void) | null = null;
  onmessage: ((evento: { data: unknown }) => void) | null = null;
  onclose: ((evento: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly ws: WebSocket;

  constructor(endereco: string, subprotocolo: string) {
    this.ws = new WebSocket(endereco, subprotocolo);
    this.ws.onopen = () => this.onopen?.();
    this.ws.onmessage = (evento) => this.onmessage?.({ data: evento.data });
    this.ws.onclose = (evento) => this.onclose?.({ code: evento.code });
    this.ws.onerror = () => this.onerror?.();
  }

  send(dados: string): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(dados);
  }

  close(codigo?: number): void {
    this.ws.close(codigo);
  }
}

type DoServidor<T extends MensagemDoServidor["t"]> = Extract<MensagemDoServidor, { t: T }>;

export type OuvintesDaConexao = {
  estado(estado: EstadoDaConexao): void;
  bemVindo(mensagem: DoServidor<"bem_vindo">, mundoId: string): void;
  fotografia(mensagem: DoServidor<"fotografia">): void;
  passo(mensagem: DoServidor<"passo">): void;
  resultado(mensagem: DoServidor<"resultado">): void;
  pulso(mensagem: DoServidor<"pulso">): void;
  aviso?(codigo: CodigoDeAviso): void;
};

export type OpcoesDaConexao = {
  fonte: FonteDoMundo;
  ouvintes: OuvintesDaConexao;
  /** Para os testes: um WebSocket de mentira. */
  Soquete?: ConstrutorDeSoquete;
  agora?(): number;
  /** Agenda uma chamada e devolve a função que a cancela. */
  agendar?(chamar: () => void, emMs: number): () => void;
  /** Entre 0 e 1, para espalhar as reaberturas. */
  aleatorio?(): number;
};

export const ESPERA_MINIMA_MS = 500;
export const ESPERA_MAXIMA_MS = 8000;
/** Quanto a entrada pode levar, da abertura do soquete até a visão inteira chegar. */
export const PRAZO_DE_ENTRADA_MS = 10_000;
/** O servidor manda um pulso por segundo; sem nada por este tempo, a rede caiu. */
export const PRAZO_SEM_SINAL_MS = 12_000;
/** Quanto `sair` espera a confirmação do servidor. */
export const PRAZO_PARA_SAIR_MS = 1500;
/** Fechamento local, quando é o cliente que desiste da conexão. */
const FECHAMENTO_LOCAL = 4000;

/**
 * O que fazer com um fechamento. Só os motivos que o servidor declara
 * definitivos param o jogo; o resto, inclusive queda de rede, reabre.
 */
export function destinoDoFechamento(
  codigo: number,
): { reabrir: MotivoDeReabertura } | { fim: MotivoDoFim } {
  if (codigo === FECHAMENTO.sessao) return { fim: "sessao" };
  if (codigo === FECHAMENTO.semAcesso) return { fim: "sem_acesso" };
  if (codigo === FECHAMENTO.substituida) return { fim: "substituida" };
  if (codigo === FECHAMENTO.protocolo) return { fim: "protocolo" };
  if (FECHAMENTOS_QUE_REABREM.includes(codigo)) {
    if (codigo === FECHAMENTO.posse) return { reabrir: "posse" };
    if (codigo === FECHAMENTO.reiniciando) return { reabrir: "reiniciando" };
    return { reabrir: "atrasado" };
  }
  if (codigo === FECHAMENTO.cheio) return { reabrir: "cheio" };
  return { reabrir: "rede" };
}

/** Espera antes da tentativa `n` (a primeira é 1): dobra até o teto, com metade de folga sorteada. */
export function esperaDaTentativa(tentativa: number, sorte: number): number {
  const base = Math.min(ESPERA_MAXIMA_MS, ESPERA_MINIMA_MS * 2 ** Math.max(0, tentativa - 1));
  return Math.round(base * (0.5 + 0.5 * Math.min(1, Math.max(0, sorte))));
}

export class Conexao {
  private readonly fonte: FonteDoMundo;
  private readonly ouvintes: OuvintesDaConexao;
  private readonly Soquete: ConstrutorDeSoquete;
  private readonly agora: () => number;
  private readonly agendar: (chamar: () => void, emMs: number) => () => void;
  private readonly aleatorio: () => number;

  private estadoAtual: EstadoDaConexao = { fase: "conectando" };
  private soquete: SoqueteDeRede | null = null;
  /** Sobe a cada abertura: o que chega de uma conexão antiga é ignorado. */
  private geracao = 0;
  private tentativa = 0;
  private dentro = false;
  private seq: number | null = null;
  private mundo: string | null = null;
  private saindo: ((salvo: boolean) => void) | null = null;
  private acessoEncerrado = false;
  private ultimoQuadroEm = 0;
  private cancelarEspera: (() => void) | null = null;
  private cancelarPrazo: (() => void) | null = null;
  private cancelarVigia: (() => void) | null = null;
  private readonly desligar: (() => void)[] = [];
  private iniciada = false;

  constructor(opcoes: OpcoesDaConexao) {
    this.fonte = opcoes.fonte;
    this.ouvintes = opcoes.ouvintes;
    this.Soquete = opcoes.Soquete ?? SoqueteDoNavegador;
    this.agora = opcoes.agora ?? (() => Date.now());
    this.agendar =
      opcoes.agendar ??
      ((chamar, emMs) => {
        const id = setTimeout(chamar, emMs);
        return () => clearTimeout(id);
      });
    this.aleatorio = opcoes.aleatorio ?? Math.random;
  }

  get estado(): EstadoDaConexao {
    return this.estadoAtual;
  }

  /** O mundo em que a conexão está, depois da primeira abertura. */
  get mundoId(): string | null {
    return this.mundo;
  }

  iniciar(): void {
    if (this.iniciada) return;
    this.iniciada = true;
    const renovar = this.fonte.aoRenovar?.((token) => {
      // Só quem já entrou renova; quem está entrando leva o token novo no primeiro quadro.
      if (this.dentro) this.mandar({ t: "renovar_sessao", sessao: token });
    });
    if (renovar) this.desligar.push(renovar);
    const perder = this.fonte.aoPerderAcesso?.((motivo) => {
      this.terminar("acesso_encerrado", motivo);
    });
    if (perder) this.desligar.push(perder);
    this.vigiar();
    void this.abrir();
  }

  /** Manda um quadro, se já entrou no mundo. Devolve se foi enviado. */
  enviar(mensagem: MensagemDoCliente): boolean {
    if (!this.dentro) return false;
    this.mandar(mensagem);
    return true;
  }

  /**
   * Sai de propósito: avisa o servidor, espera a confirmação por um instante
   * e fecha. Devolve se o servidor confirmou que salvou.
   */
  async sair(prazoMs = PRAZO_PARA_SAIR_MS): Promise<boolean> {
    if (this.estadoAtual.fase === "encerrado") return false;
    let salvo = false;
    if (this.dentro && this.soquete) {
      salvo = await new Promise<boolean>((resolver) => {
        const cancelar = this.agendar(() => resolver(false), prazoMs);
        this.saindo = (confirmado) => {
          cancelar();
          resolver(confirmado);
        };
        this.mandar({ t: "sair" });
      });
    }
    this.terminar("saiu");
    return salvo;
  }

  /** Larga a conexão sem avisar o servidor: a reserva fica em espera, como em uma queda. */
  largar(): void {
    this.terminar("saiu");
  }

  /** Para os testes: perde a conexão como a rede faria e segue a política de reabertura. */
  derrubar(): void {
    this.reabrir("rede");
  }

  private mandar(mensagem: MensagemDoCliente): void {
    this.soquete?.send(JSON.stringify(mensagem));
  }

  private mudar(estado: EstadoDaConexao): void {
    this.estadoAtual = estado;
    this.ouvintes.estado(estado);
  }

  /** Enquanto reabre, o estado continua `reconectando` até a visão inteira chegar de novo. */
  private avancar(fase: "entrando" | "montando"): void {
    if (this.estadoAtual.fase !== "reconectando") this.mudar({ fase });
  }

  private limparSoquete(codigo?: number): void {
    const soquete = this.soquete;
    this.soquete = null;
    this.dentro = false;
    this.seq = null;
    this.cancelarPrazo?.();
    this.cancelarPrazo = null;
    if (!soquete) return;
    soquete.onopen = null;
    soquete.onmessage = null;
    soquete.onclose = null;
    soquete.onerror = null;
    try {
      soquete.close(codigo);
    } catch {
      // Um soquete que nem chegou a abrir pode recusar o código; ele já está descartado.
    }
  }

  private terminar(motivo: MotivoDoFim, detalhe?: string): void {
    if (this.estadoAtual.fase === "encerrado") return;
    this.geracao++;
    this.cancelarEspera?.();
    this.cancelarEspera = null;
    this.cancelarVigia?.();
    this.cancelarVigia = null;
    for (const parar of this.desligar.splice(0)) parar();
    this.limparSoquete(motivo === "saiu" ? FECHAMENTO.normal : FECHAMENTO_LOCAL);
    const saindo = this.saindo;
    this.saindo = null;
    saindo?.(false);
    this.mudar(
      detalhe === undefined
        ? { fase: "encerrado", motivo }
        : { fase: "encerrado", motivo, detalhe },
    );
  }

  private reabrir(motivo: MotivoDeReabertura): void {
    if (this.estadoAtual.fase === "encerrado") return;
    this.geracao++;
    this.limparSoquete(FECHAMENTO_LOCAL);
    this.tentativa++;
    this.mudar({ fase: "reconectando", tentativa: this.tentativa, motivo });
    this.cancelarEspera?.();
    this.cancelarEspera = this.agendar(
      () => {
        this.cancelarEspera = null;
        void this.abrir();
      },
      esperaDaTentativa(this.tentativa, this.aleatorio()),
    );
  }

  /** Confere de tempos em tempos se o servidor ainda dá sinal. */
  private vigiar(): void {
    this.cancelarVigia = this.agendar(() => {
      if (this.estadoAtual.fase === "encerrado") return;
      if (this.dentro && this.agora() - this.ultimoQuadroEm > PRAZO_SEM_SINAL_MS) {
        this.reabrir("sem_sinal");
      }
      this.vigiar();
    }, PRAZO_SEM_SINAL_MS / 3);
  }

  private async abrir(): Promise<void> {
    const geracao = ++this.geracao;
    let alvo: { endereco: string; mundoId: string };
    try {
      alvo = await this.fonte.abrir();
    } catch {
      if (geracao === this.geracao) this.reabrir("fonte");
      return;
    }
    if (geracao !== this.geracao || this.estadoAtual.fase === "encerrado") return;
    this.mundo = alvo.mundoId;

    let soquete: SoqueteDeRede;
    try {
      soquete = new this.Soquete(alvo.endereco, SUBPROTOCOLO);
    } catch {
      this.reabrir("rede");
      return;
    }
    this.soquete = soquete;
    this.ultimoQuadroEm = this.agora();
    this.cancelarPrazo = this.agendar(() => {
      if (geracao === this.geracao && this.estadoAtual.fase !== "pronto") this.reabrir("rede");
    }, PRAZO_DE_ENTRADA_MS);

    soquete.onopen = () => {
      if (geracao !== this.geracao) return;
      this.avancar("entrando");
      this.mandar({
        t: "entrar",
        v: VERSAO_DO_PROTOCOLO,
        sessao: this.fonte.token(),
        mundoId: alvo.mundoId,
      });
    };
    soquete.onmessage = (evento) => {
      if (geracao !== this.geracao || typeof evento.data !== "string") return;
      let mensagem: MensagemDoServidor;
      try {
        mensagem = JSON.parse(evento.data) as MensagemDoServidor;
      } catch {
        this.reabrir("lacuna");
        return;
      }
      this.receber(mensagem, alvo.mundoId);
    };
    soquete.onclose = (evento) => {
      if (geracao !== this.geracao) return;
      this.fechou(evento.code);
    };
    // O erro vem sempre seguido do fechamento, que é quem decide.
    soquete.onerror = () => {};
  }

  private receber(mensagem: MensagemDoServidor, mundoId: string): void {
    this.ultimoQuadroEm = this.agora();
    switch (mensagem.t) {
      case "bem_vindo":
        this.dentro = true;
        this.avancar("montando");
        this.ouvintes.bemVindo(mensagem, mundoId);
        return;
      case "fotografia":
        if (!this.dentro) {
          this.reabrir("lacuna");
          return;
        }
        this.seq = mensagem.seq;
        this.cancelarPrazo?.();
        this.cancelarPrazo = null;
        this.ouvintes.fotografia(mensagem);
        // Só agora a conexão está inteira: as próximas quedas recomeçam a contagem.
        this.tentativa = 0;
        this.mudar({ fase: "pronto" });
        return;
      case "passo":
        // Um passo fora da ordem é uma mudança perdida: só a visão inteira conserta.
        if (this.seq === null || mensagem.seq !== this.seq + 1) {
          this.reabrir("lacuna");
          return;
        }
        this.seq = mensagem.seq;
        this.ouvintes.passo(mensagem);
        return;
      case "resultado":
        this.ouvintes.resultado(mensagem);
        return;
      case "pulso":
        this.ouvintes.pulso(mensagem);
        return;
      case "aviso":
        if (mensagem.codigo === "acesso_encerrado") this.acessoEncerrado = true;
        this.ouvintes.aviso?.(mensagem.codigo);
        return;
      case "saiu": {
        const saindo = this.saindo;
        this.saindo = null;
        saindo?.(mensagem.salvo);
        return;
      }
    }
  }

  private fechou(codigo: number): void {
    this.soquete = null;
    this.dentro = false;
    this.seq = null;
    this.cancelarPrazo?.();
    this.cancelarPrazo = null;
    if (this.saindo) {
      // O servidor fechou depois do `sair`: quem espera a confirmação termina.
      const saindo = this.saindo;
      this.saindo = null;
      saindo(false);
      return;
    }
    const destino = destinoDoFechamento(codigo);
    if ("fim" in destino) {
      const motivo =
        destino.fim === "sem_acesso" && this.acessoEncerrado ? "acesso_encerrado" : destino.fim;
      this.terminar(motivo);
      return;
    }
    this.reabrir(destino.reabrir);
  }
}
