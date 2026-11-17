import {
  type AlvoDaObra,
  canonico,
  copiar,
  PRAZO_DA_TRAVA_DE_EDICAO_MS,
  type RascunhoDaObra,
  type ReferenciaDaTrava,
  ReferenciaDaTravaSchema,
  type Resultado,
} from "@informach/morada-sim";

type RespostaComObra = Extract<Resultado, { ok: true }> & {
  obra: NonNullable<Extract<Resultado, { ok: true }>["obra"]>;
};
type Desejo = { chave: string; rascunho: RascunhoDaObra; alvo: AlvoDaObra };
type FonteDaReserva = {
  autor(): string | null;
  alvo(rascunho: RascunhoDaObra): AlvoDaObra | null;
  preparar(rascunho: RascunhoDaObra): Promise<Resultado>;
  renovar(referencia: ReferenciaDaTrava): Promise<Resultado>;
  liberar(referencia: ReferenciaDaTrava): Promise<Resultado>;
  aoMudar(): void;
  aoRecusar(resultado: Extract<Resultado, { ok: false }>): void;
  agora?(): number;
  agendar?(chamar: () => void, emMs: number): () => void;
};

const negada = (): Resultado => ({
  ok: false,
  comandoId: "preparacao-local",
  motivo: "versao_antiga",
  detalhe: "edicao_cancelada",
});

/** Uma chamada em voo, último rascunho desejado e um prazo local de apresentação. */
export class ReservaDaObra {
  private desejo: Desejo | null = null;
  private guardada: { chave: string; resposta: RespostaComObra; ateMs: number } | null = null;
  private trabalho: { id: symbol; promessa: Promise<Resultado> } | null = null;
  private rodada = Symbol();
  private recusada: string | null = null;
  private cancelarPrazo: (() => void) | null = null;
  private encerrada = false;
  private readonly agora: () => number;
  private readonly agendar: (chamar: () => void, emMs: number) => () => void;

  constructor(private readonly fonte: FonteDaReserva) {
    this.agora = fonte.agora ?? (() => performance.now());
    this.agendar =
      fonte.agendar ??
      ((chamar, emMs) => {
        const id = setTimeout(chamar, emMs);
        return () => clearTimeout(id);
      });
  }

  private definir(rascunho: RascunhoDaObra): Desejo | null {
    const autor = this.fonte.autor();
    const alvo = autor ? this.fonte.alvo(rascunho) : null;
    if (!autor || !alvo || this.encerrada) return null;
    const chave = `${autor}/${canonico(alvo)}`;
    if (this.desejo?.chave !== chave) {
      this.rodada = Symbol();
      this.recusada = null;
    }
    this.desejo = { chave, alvo: copiar(alvo), rascunho: copiar(rascunho) };
    return this.desejo;
  }

  atualizar(rascunho: RascunhoDaObra | null): void {
    if (!rascunho || !this.definir(rascunho)) {
      this.cancelar();
      return;
    }
    this.tentarDesejo();
  }

  private tentarDesejo(): void {
    const desejo = this.desejo;
    if (!desejo || this.encerrada || this.trabalho || this.recusada === desejo.chave) return;
    if (this.guardada?.chave === desejo.chave && this.guardada.ateMs > this.agora()) return;
    void this.pedir(desejo, false);
  }

  /** A confirmação é um gesto novo; uma recusa anterior não autoriza repetição automática. */
  async obter(rascunho: RascunhoDaObra): Promise<Resultado> {
    const desejo = this.definir(rascunho);
    if (!desejo) return negada();
    const rodada = this.rodada;
    this.recusada = null;
    for (;;) {
      if (this.encerrada || rodada !== this.rodada || this.desejo?.chave !== desejo.chave)
        return negada();
      if (this.guardada?.chave === desejo.chave && this.guardada.ateMs > this.agora())
        return copiar(this.guardada.resposta);
      const emCurso = this.trabalho;
      if (emCurso) {
        await emCurso.promessa;
        continue;
      }
      return this.pedir(desejo, false);
    }
  }

  private pedir(desejo: Desejo, renovar: boolean): Promise<Resultado> {
    const id = Symbol(),
      rodada = this.rodada;
    const anterior = this.guardada;
    this.cancelarPrazo?.();
    this.cancelarPrazo = null;
    const operacao =
      renovar && anterior
        ? this.fonte.renovar(copiar(anterior.resposta.obra.referencia))
        : this.fonte.preparar(copiar(desejo.rascunho));
    const promessa = operacao
      .then((resposta) => {
        if (!resposta.ok) {
          if (this.desejo?.chave === desejo.chave && rodada === this.rodada) {
            this.recusada = desejo.chave;
            if (renovar) this.guardada = null;
            this.fonte.aoRecusar(resposta);
          }
          return resposta;
        }
        const obra = resposta.obra;
        if (
          !obra ||
          !ReferenciaDaTravaSchema.safeParse(obra.referencia).success ||
          !Number.isSafeInteger(obra.prazoMs) ||
          obra.prazoMs <= 0 ||
          obra.prazoMs > PRAZO_DA_TRAVA_DE_EDICAO_MS ||
          canonico(obra.alvo) !== canonico(desejo.alvo)
        )
          throw new Error("Resposta de preparação da obra inválida");
        if (this.encerrada || rodada !== this.rodada || this.desejo?.chave !== desejo.chave) {
          void this.fonte.liberar(copiar(obra.referencia));
          return negada();
        }
        this.guardada = {
          chave: desejo.chave,
          resposta: { ...resposta, obra: copiar(obra) },
          ateMs: this.agora() + obra.prazoMs,
        };
        this.recusada = null;
        this.agendarRenovacao();
        this.fonte.aoMudar();
        return resposta;
      })
      .catch((erro) => {
        if (this.desejo?.chave === desejo.chave && rodada === this.rodada)
          this.recusada = desejo.chave;
        throw erro;
      })
      .finally(() => {
        if (this.trabalho?.id === id) this.trabalho = null;
        this.tentarDesejo();
      });
    this.trabalho = { id, promessa };
    return promessa;
  }

  private agendarRenovacao(): void {
    this.cancelarPrazo?.();
    this.cancelarPrazo = this.agendar(() => {
      this.cancelarPrazo = null;
      const desejo = this.desejo;
      if (this.encerrada || !desejo || !this.guardada || this.guardada.chave !== desejo.chave)
        return;
      if (this.trabalho) {
        this.agendarRenovacao();
        return;
      }
      if (this.guardada.ateMs <= this.agora()) {
        this.guardada = null;
        this.recusada = desejo.chave;
        this.fonte.aoMudar();
        return;
      }
      void this.pedir(desejo, true);
    }, 5000);
  }

  cancelar(): void {
    this.rodada = Symbol();
    this.desejo = null;
    this.recusada = null;
    this.cancelarPrazo?.();
    this.cancelarPrazo = null;
    const antiga = this.guardada;
    this.guardada = null;
    if (antiga) void this.fonte.liberar(copiar(antiga.resposta.obra.referencia));
  }

  dispose(): void {
    this.encerrada = true;
    this.cancelar();
  }
}
