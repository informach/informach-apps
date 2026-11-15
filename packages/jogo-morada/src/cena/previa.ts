import { Group } from "three";
import type {
  Ativos,
  DescricaoDoMorador,
  EnquadramentoDoMorador,
  VisualDoMorador,
} from "../ativos/ativos";

export type EstadoDaPrevia = "fechada" | "carregando" | "pronto" | "simples" | "falha";
export type QuadroDaPrevia = {
  visual: VisualDoMorador;
  descricao: string;
  estado: VisualDoMorador["estadoDaArte"];
  enquadramento: EnquadramentoDoMorador | null;
};

/** Uma única prévia visual, sem entidades no espelho e sem renderer próprio. */
export class PreviaDoMorador {
  readonly raiz = new Group();
  private visual: VisualDoMorador | null = null;
  private descricao: DescricaoDoMorador | null = null;
  private pendente: DescricaoDoMorador | null | undefined;
  private repetir = false;
  private giroPendente = 0;
  private desenhado: QuadroDaPrevia | null = null;
  private enquadramentoAtual: EnquadramentoDoMorador | null = null;

  constructor(private readonly ativos: Ativos) {
    this.raiz.position.set(-5, 0, 4);
  }

  get aberta(): boolean {
    return this.visual !== null;
  }
  get altura(): number {
    return this.visual?.altura ?? 1.7;
  }
  get enquadramento(): EnquadramentoDoMorador | null {
    return this.enquadramentoAtual;
  }
  get estado(): EstadoDaPrevia {
    if (this.pendente) return "carregando";
    if (!this.visual) return "fechada";
    if (this.visual.estadoDaArte === "falha") return "falha";
    if (
      this.desenhado?.visual !== this.visual ||
      this.desenhado.enquadramento !== this.enquadramentoAtual ||
      this.desenhado.estado !== this.visual.estadoDaArte ||
      this.desenhado.descricao !== this.assinaturaAtual()
    )
      return "carregando";
    return this.visual.estadoDaArte ?? "simples";
  }

  capturarQuadro(): QuadroDaPrevia | null {
    return this.visual
      ? {
          visual: this.visual,
          descricao: this.assinaturaAtual(),
          estado: this.visual.estadoDaArte,
          enquadramento: this.enquadramentoAtual,
        }
      : null;
  }
  confirmarQuadro(quadro: QuadroDaPrevia | null): void {
    this.desenhado = quadro;
  }
  private assinaturaAtual(): string {
    return JSON.stringify(this.descricao);
  }

  estadoPara(esperado?: DescricaoDoMorador): EstadoDaPrevia {
    if (
      esperado &&
      (!this.descricao ||
        esperado.fase !== this.descricao.fase ||
        JSON.stringify(esperado.aparencia) !== JSON.stringify(this.descricao.aparencia))
    )
      return "carregando";
    return this.estado;
  }

  /** Coalesce alterações do formulário; toda montagem acontece dentro do quadro admitido. */
  definir(descricao: DescricaoDoMorador | null): void {
    this.pendente = descricao;
  }
  recarregar(): void {
    if (this.descricao) {
      this.pendente = this.descricao;
      this.repetir = true;
    }
  }
  girar(sentido: -1 | 1): void {
    this.giroPendente += (sentido * Math.PI) / 8;
  }

  atualizar(agoraMs: number, dtMs: number): void {
    this.raiz.rotation.y += this.giroPendente;
    this.giroPendente = 0;
    const pedido = this.pendente;
    if (pedido === null) {
      this.soltarVisual();
      this.pendente = undefined;
    } else if (pedido !== undefined) {
      const mesmaMalha =
        this.descricao !== null && chaveDaMalha(this.descricao) === chaveDaMalha(pedido);
      // Uma escolha nova substitui a pendente enquanto o pacote anterior carrega.
      // O formulário continua respondendo sem iniciar uma fila de downloads de prévias.
      if (mesmaMalha || this.visual?.estadoDaArte !== "carregando") {
        if (!this.visual || !mesmaMalha || this.repetir || !this.visual.definirAparencia) {
          this.soltarVisual();
          this.visual = this.ativos.criarMorador(pedido);
          this.raiz.add(this.visual.raiz);
        } else this.visual.definirAparencia?.(pedido.aparencia);
        this.descricao = pedido;
        this.pendente = undefined;
        this.repetir = false;
      }
    }
    this.visual?.aplicar({
      postura: "em_pe",
      andando: false,
      agindo: false,
      animacao: null,
      carregando: false,
      gravidez: 0,
      agoraMs,
      dtMs,
    });
    if (this.visual) {
      this.enquadramentoAtual = this.visual.enquadramentoDaPrevia?.() ??
        this.enquadramentoAtual ?? { centro: [0, this.altura / 2, 0], tamanho: this.altura };
    }
  }

  private soltarVisual(): void {
    this.visual?.dispose();
    this.visual = null;
    this.descricao = null;
    this.desenhado = null;
    this.enquadramentoAtual = null;
  }
  dispose(): void {
    this.soltarVisual();
    this.pendente = undefined;
    this.raiz.removeFromParent();
  }
}

function chaveDaMalha(d: DescricaoDoMorador): string {
  return [d.fase, d.aparencia.linha, d.aparencia.corpo, d.aparencia.cabelo, d.aparencia.roupa].join(
    ":",
  );
}
