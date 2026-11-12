import type { Intencao, Mundo, Resultado } from "@informach/morada-sim";
import {
  FECHAMENTO,
  type MensagemDoCliente,
  type MensagemDoServidor,
  VERSAO_DO_PROTOCOLO,
} from "@informach/morada-sim/protocolo";
import type { FonteDoMundo } from "../fonte";
import type { ConstrutorDeSoquete, SoqueteDeRede } from "../rede/conexao";

/**
 * Apoio dos testes: um servidor do Morada em memória, com a simulação de
 * verdade por trás, falando o protocolo por soquetes de mentira. Segue o que
 * `apps/morada-server` faz, na mesma ordem: a entrada devolve `bem_vindo` e a
 * visão inteira, as intenções entram no passo seguinte, a resposta de cada
 * uma sai antes das mudanças do passo, e o pulso sai uma vez por segundo,
 * depois do passo, com o tick em que o mundo está.
 *
 * O tempo é do teste: nada anda sozinho.
 */

export class RelogioDeTeste {
  agoraMs = 1_000_000;
  private readonly espera: { em: number; chamar: () => void; n: number }[] = [];
  private proximo = 0;

  agora = (): number => this.agoraMs;

  agendar = (chamar: () => void, emMs: number): (() => void) => {
    const item = { em: this.agoraMs + emMs, chamar, n: this.proximo++ };
    this.espera.push(item);
    return () => {
      const indice = this.espera.indexOf(item);
      if (indice >= 0) this.espera.splice(indice, 1);
    };
  };

  /** Anda o relógio e dispara, na ordem, o que venceu. */
  avancar(ms: number): void {
    const ate = this.agoraMs + ms;
    for (;;) {
      const vencidos = this.espera
        .filter((item) => item.em <= ate)
        .sort((a, b) => a.em - b.em || a.n - b.n);
      const proximo = vencidos[0];
      if (!proximo) break;
      this.espera.splice(this.espera.indexOf(proximo), 1);
      this.agoraMs = Math.max(this.agoraMs, proximo.em);
      proximo.chamar();
    }
    this.agoraMs = ate;
  }
}

/** Deixa as promessas pendentes andarem (a fonte do mundo é assíncrona). */
export async function assentar(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

export class SoqueteDeMentira implements SoqueteDeRede {
  onopen: (() => void) | null = null;
  onmessage: ((evento: { data: unknown }) => void) | null = null;
  onclose: ((evento: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  /** Tudo o que o cliente mandou por este soquete, na ordem. */
  readonly recebidas: MensagemDoCliente[] = [];
  /** O código com que o cliente fechou, se fechou. */
  fechadoPeloCliente: number | null = null;
  aberto = false;
  encerrado = false;
  /** Quando ligado, o que o servidor manda fica guardado em vez de chegar. */
  retido: MensagemDoServidor[] | null = null;
  /** Quando ligado, o servidor não ouve mais este soquete: como uma rede que engole os quadros. */
  surdo = false;
  seq = 0;
  sessao: string | null = null;
  jogadorId: string | null = null;

  constructor(
    readonly endereco: string,
    readonly subprotocolo: string,
    private readonly servidor: ServidorDeMentira,
  ) {
    servidor.soquetes.push(this);
  }

  send(dados: string): void {
    if (this.encerrado) return;
    const mensagem = JSON.parse(dados) as MensagemDoCliente;
    this.recebidas.push(mensagem);
    if (!this.surdo) this.servidor.receber(this, mensagem);
  }

  close(codigo?: number): void {
    if (this.encerrado) return;
    this.encerrado = true;
    this.fechadoPeloCliente = codigo ?? 1005;
    this.servidor.desconectou(this);
  }

  /** O servidor entrega uma mensagem ao cliente. */
  entregar(mensagem: MensagemDoServidor): void {
    if (this.encerrado) return;
    if (this.retido) {
      this.retido.push(mensagem);
      return;
    }
    this.onmessage?.({ data: JSON.stringify(mensagem) });
  }

  /** Solta o que estava retido, na ordem em que foi mandado. */
  soltar(): void {
    const guardadas = this.retido ?? [];
    this.retido = null;
    for (const mensagem of guardadas) this.entregar(mensagem);
  }

  /** O servidor (ou a rede) fecha a conexão com este código. */
  fechar(codigo: number): void {
    if (this.encerrado) return;
    this.encerrado = true;
    this.servidor.desconectou(this);
    this.onclose?.({ code: codigo });
  }
}

export type OpcoesDoServidorDeMentira = {
  mundo: Mundo;
  /** Token de sessão → quem a pessoa é no mundo. Token fora da lista é recusado com 4001. */
  sessoes: Record<string, { jogadorId: string; apelido: string }>;
  relogio: RelogioDeTeste;
};

export class ServidorDeMentira {
  readonly soquetes: SoqueteDeMentira[] = [];
  readonly mundo: Mundo;
  /** Abre os soquetes novos na hora. Desligado, o teste abre com `abrir`. */
  abrirSozinho = true;
  /** O código com que as próximas conexões são recusadas ao entrar, se houver. */
  recusarCom: number | null = null;
  private readonly sessoes: OpcoesDoServidorDeMentira["sessoes"];
  private readonly relogio: RelogioDeTeste;
  private readonly caixa: { soquete: SoqueteDeMentira; intencao: Intencao }[] = [];
  private passos = 0;
  readonly Soquete: ConstrutorDeSoquete;

  constructor(opcoes: OpcoesDoServidorDeMentira) {
    this.mundo = opcoes.mundo;
    this.sessoes = opcoes.sessoes;
    this.relogio = opcoes.relogio;
    const servidor = this;
    this.Soquete = class extends SoqueteDeMentira {
      constructor(endereco: string, subprotocolo: string) {
        super(endereco, subprotocolo, servidor);
        if (servidor.abrirSozinho) queueMicrotask(() => servidor.abrir(this));
      }
    };
  }

  /** A fonte do mundo que um cliente usaria para chegar aqui com este token. */
  fonte(token: string): FonteDoMundo & { aberturas: number } {
    const fonte = {
      aberturas: 0,
      abrir: async () => {
        fonte.aberturas++;
        return { endereco: "ws://mentira/morada", mundoId: this.mundo.estado.id };
      },
      token: () => token,
    };
    return fonte;
  }

  /** O soquete mais recente. */
  get ultimo(): SoqueteDeMentira {
    const soquete = this.soquetes[this.soquetes.length - 1];
    if (!soquete) throw new Error("Nenhum soquete foi aberto");
    return soquete;
  }

  /** A conexão viva de um jogador, se há uma. */
  de(jogadorId: string): SoqueteDeMentira | undefined {
    return this.soquetes.find((s) => s.jogadorId === jogadorId && !s.encerrado);
  }

  abrir(soquete: SoqueteDeMentira): void {
    if (soquete.aberto || soquete.encerrado) return;
    soquete.aberto = true;
    soquete.onopen?.();
  }

  receber(soquete: SoqueteDeMentira, mensagem: MensagemDoCliente): void {
    if (mensagem.t === "entrar") {
      const quem = this.sessoes[mensagem.sessao];
      // Como o servidor de verdade: sessão que não confere, 4001; mundo que não é este, 4003.
      const recusa =
        this.recusarCom ??
        (!quem || mensagem.v !== VERSAO_DO_PROTOCOLO
          ? FECHAMENTO.sessao
          : mensagem.mundoId !== this.mundo.estado.id
            ? FECHAMENTO.semAcesso
            : null);
      if (recusa !== null || !quem) {
        soquete.fechar(recusa ?? FECHAMENTO.sessao);
        return;
      }
      // O mesmo jogador por outra conexão: a nova toma o lugar da antiga.
      for (const outro of this.soquetes) {
        if (outro !== soquete && !outro.encerrado && outro.jogadorId === quem.jogadorId) {
          outro.jogadorId = null;
          outro.fechar(FECHAMENTO.substituida);
        }
      }
      const conhecida = this.mundo.presenca.sessoes.some((s) => s.sessaoId === mensagem.sessao);
      this.mundo.aplicar(
        conhecida
          ? { t: "sessao_voltou", sessaoId: mensagem.sessao, apelido: quem.apelido }
          : {
              t: "sessao_entrou",
              sessaoId: mensagem.sessao,
              perfilId: quem.jogadorId,
              apelido: quem.apelido,
            },
      );
      soquete.sessao = mensagem.sessao;
      soquete.jogadorId = quem.jogadorId;
      this.difundir(this.mundo.avancar(0), soquete);
      soquete.entregar({
        t: "bem_vindo",
        v: VERSAO_DO_PROTOCOLO,
        jogadorId: quem.jogadorId,
        apelido: quem.apelido,
        papel: "steward",
        tick: this.mundo.estado.relogio.tick,
        passoMs: 100,
        janelaDeGracaMs: this.mundo.estado.regras.janelaDeGracaMs,
      });
      soquete.entregar({
        t: "fotografia",
        seq: ++soquete.seq,
        visao: this.mundo.visao(quem.jogadorId),
      });
      return;
    }
    if (!soquete.sessao) {
      soquete.fechar(FECHAMENTO.protocolo);
      return;
    }
    if (mensagem.t === "intencao") {
      this.caixa.push({ soquete, intencao: mensagem.intencao });
      return;
    }
    if (mensagem.t === "sair") {
      this.mundo.aplicar({ t: "sessao_saiu", sessaoId: soquete.sessao });
      soquete.sessao = null;
      this.difundir(this.mundo.avancar(0), soquete);
      soquete.entregar({ t: "saiu", salvo: true });
      soquete.jogadorId = null;
      soquete.fechar(FECHAMENTO.normal);
    }
  }

  desconectou(soquete: SoqueteDeMentira): void {
    if (!soquete.sessao) return;
    // Uma queda sem aviso: a sessão fica em espera pela janela de graça.
    this.mundo.aplicar({
      t: "sessao_caiu",
      sessaoId: soquete.sessao,
      agoraMs: this.relogio.agoraMs,
    });
    soquete.sessao = null;
  }

  private dentro(): SoqueteDeMentira[] {
    return this.soquetes.filter((s) => s.sessao !== null && !s.encerrado);
  }

  private difundir(
    saida: ReturnType<Mundo["avancar"]>,
    excluir: SoqueteDeMentira | null = null,
  ): void {
    if (saida.mudancas.length === 0 && saida.apresentacao.length === 0) return;
    for (const soquete of this.dentro()) {
      if (soquete === excluir) continue;
      soquete.entregar({
        t: "passo",
        seq: ++soquete.seq,
        tick: saida.tick,
        mudancas: saida.mudancas,
        eventos: saida.apresentacao,
      });
    }
  }

  /** Um passo de 100 ms do servidor: aplica o que chegou, anda e conta o que mudou. */
  passo(): void {
    const respostas: { soquete: SoqueteDeMentira; resultado: Resultado }[] = [];
    for (const { soquete, intencao } of this.caixa.splice(0)) {
      if (!soquete.sessao) continue;
      const resultado = this.mundo.aplicar({ t: "intencao", sessaoId: soquete.sessao, intencao });
      respostas.push({ soquete, resultado });
    }
    this.passos++;
    const umSegundo = this.passos % 10 === 0;
    if (umSegundo) this.mundo.aplicar({ t: "expirar", agoraMs: this.relogio.agoraMs });
    const saida = this.mundo.avancar(100);
    for (const { soquete, resultado } of respostas) soquete.entregar({ t: "resultado", resultado });
    this.difundir(saida);
    if (umSegundo) {
      for (const soquete of this.dentro()) {
        soquete.entregar({
          t: "pulso",
          n: this.passos,
          tick: this.mundo.estado.relogio.tick,
          agoraMs: this.relogio.agoraMs,
        });
      }
    }
  }

  /** Vários passos, com o relógio do teste andando junto. */
  andar(passos: number): void {
    for (let i = 0; i < passos; i++) {
      this.relogio.avancar(100);
      this.passo();
    }
  }

  /** Pula uma mensagem com sequência: o próximo passo chega fora de ordem para este cliente. */
  perderUmQuadro(soquete: SoqueteDeMentira): void {
    soquete.seq++;
  }
}
