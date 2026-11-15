import { Group } from "three";
import type { Ativos, DescricaoDoMorador, VisualDoMorador } from "../ativos/ativos";

export type EstadoDaPrevia = "fechada" | "carregando" | "pronto" | "simples" | "falha";

/** Uma única prévia visual, sem entidades no espelho e sem renderer próprio. */
export class PreviaDoMorador {
  readonly raiz = new Group();
  private visual: VisualDoMorador | null = null;
  private descricao: DescricaoDoMorador | null = null;
  private pendente: DescricaoDoMorador | null | undefined;
  private repetir = false;
  private giroPendente = 0;

  constructor(private readonly ativos: Ativos) {
    this.raiz.position.set(-5, 0, 4);
  }

  get aberta(): boolean {
    return this.visual !== null;
  }
  get altura(): number {
    return this.visual?.altura ?? 1.7;
  }
  get estado(): EstadoDaPrevia {
    if (this.pendente) return "carregando";
    if (!this.visual) return "fechada";
    return this.visual.estadoDaArte ?? "simples";
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
  }

  private soltarVisual(): void {
    this.visual?.dispose();
    this.visual = null;
    this.descricao = null;
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
