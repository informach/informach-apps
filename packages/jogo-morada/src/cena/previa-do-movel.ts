import { type EstadoDoMundo, type ObjetoId, obter, pegadaNoLote } from "@informach/morada-sim";
import { doCatalogo } from "@informach/morada-sim/conteudo";
import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Ativos, ObjetoDaCena, VisualDosObjetos } from "../ativos/ativos";
import type { PreviaDaCasa } from "../modelo/editor-da-casa";
import { paraCena } from "./espaco";

/** Usa os ativos e o renderer da cena; nenhuma alteração entra no espelho. */
export class PreviaDoMovel {
  readonly raiz = new Group();
  private readonly piso = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({
      color: 0x3fd0c3,
      transparent: true,
      opacity: 0.3,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  private visual: VisualDosObjetos | null = null;
  private item: ObjetoDaCena | null = null;
  private chave = "";
  private assinatura = "";
  private oculto: ObjetoId | null = null;

  constructor(private readonly ativos: Ativos) {
    this.piso.rotation.x = -Math.PI / 2;
    this.piso.visible = false;
    this.raiz.add(this.piso);
    this.piso.layers.set(1);
  }

  get originalOculto(): ObjetoId | null {
    return this.oculto;
  }

  invalidar(): void {
    this.chave = "";
  }

  definir(estado: EstadoDoMundo, previa: PreviaDaCasa | null): boolean {
    const antes = this.oculto,
      objeto = previa?.objeto;
    const lote = objeto ? obter(estado.lotes, objeto.loteId) : null;
    if (!previa || !objeto || !lote) {
      this.limpar();
      return antes !== this.oculto;
    }
    const chave = `${objeto.id}/${objeto.catalogo}@${objeto.versao}/${objeto.pintura?.perfil ?? "original"}`;
    const assinatura = `${objeto.pos.join(",")}/${objeto.giro}/${objeto.pintura?.cor ?? "original"}/${previa.valido}/${lote.origem.join(",")}`;
    if (this.chave === chave && this.assinatura === assinatura) return false;
    if (this.chave !== chave) {
      this.limpar();
      this.item = { objeto, entrada: doCatalogo(objeto.catalogo), posicao: [0, 0, 0] };
      this.visual = this.ativos.criarObjetos([this.item]);
      // A câmera enxerga a camada 1; o raycaster da cena conserva a camada 0.
      this.visual.raiz.traverse((no) => no.layers.set(1));
      this.raiz.add(this.visual.raiz);
      this.chave = chave;
    }
    if (!this.item || !this.visual) throw new Error("Prévia do móvel sem visual");
    this.item.objeto = objeto;
    this.item.posicao = paraCena(
      lote.origem[0] + objeto.pos[0],
      lote.origem[1] + objeto.pos[1],
      objeto.pos[2],
    );
    this.visual.definirVisiveis(() => true);
    this.assinatura = assinatura;
    this.oculto = obter(estado.objetos, objeto.id) ? objeto.id : null;
    const pegada = pegadaNoLote(objeto);
    this.piso.visible = pegada !== null;
    if (pegada) {
      const [x0, y0, x1, y1] = pegada;
      this.piso.position.set(
        ...paraCena(
          lote.origem[0] + (x0 + x1) / 2,
          lote.origem[1] + (y0 + y1) / 2,
          objeto.pos[2] + 25,
        ),
      );
      this.piso.scale.set((x1 - x0) / 1000, (y1 - y0) / 1000, 1);
      this.piso.material.color.setHex(previa.valido ? 0x3fd0c3 : 0xff7a76);
    }
    return antes !== this.oculto;
  }

  private limpar(): void {
    this.visual?.dispose();
    this.visual = null;
    this.item = null;
    this.chave = "";
    this.assinatura = "";
    this.oculto = null;
    this.piso.visible = false;
  }

  dispose(): void {
    this.limpar();
    this.raiz.removeFromParent();
    this.piso.geometry.dispose();
    this.piso.material.dispose();
    this.raiz.clear();
  }
}
