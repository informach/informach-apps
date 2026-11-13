import type { ObjetoDoManifesto } from "@informach/morada-arte/manifesto";
import type { ObjetoId } from "@informach/morada-sim";
import {
  Group,
  InstancedMesh,
  type Intersection,
  Matrix4,
  Mesh,
  type Object3D,
  Vector3,
} from "three";
import { giroParaCena, type PontoDaCena } from "../cena/espaco";
import type { ObjetoDaCena, VisualDosObjetos } from "./ativos";

export type ModeloDeObjeto = { entrada: ObjetoDoManifesto; cena: Object3D };
type Lote = {
  malha: InstancedMesh;
  itens: ObjetoDaCena[];
  visiveis: ObjetoDaCena[];
  local: Matrix4;
};

/** Uma instância por primitiva do modelo; geometria e material pertencem ao cache dos ativos. */
export class ObjetosDeArte implements VisualDosObjetos {
  readonly raiz = new Group();
  private readonly lotes: Lote[] = [];
  private readonly porId = new Map<ObjetoId, { item: ObjetoDaCena; modelo: ModeloDeObjeto }>();

  constructor(
    itens: readonly ObjetoDaCena[],
    modelos: ReadonlyMap<string, ModeloDeObjeto>,
    private readonly provisorios: VisualDosObjetos,
  ) {
    this.raiz.add(provisorios.raiz);
    const grupos = new Map<ModeloDeObjeto, ObjetoDaCena[]>();
    for (const item of itens) {
      const modelo = modelos.get(`${item.objeto.catalogo}@${item.objeto.versao}`);
      if (!modelo) continue;
      this.porId.set(item.objeto.id, { item, modelo });
      const grupo = grupos.get(modelo) ?? [];
      grupo.push(item);
      grupos.set(modelo, grupo);
    }
    for (const [modelo, objetos] of grupos) {
      modelo.cena.updateMatrixWorld(true);
      modelo.cena.traverse((no) => {
        if (!(no instanceof Mesh)) return;
        const malha = new InstancedMesh(no.geometry, no.material, objetos.length);
        malha.castShadow = true;
        malha.receiveShadow = true;
        this.lotes.push({ malha, itens: objetos, visiveis: [], local: no.matrixWorld.clone() });
        this.raiz.add(malha);
      });
    }
    this.definirVisiveis(() => true);
  }

  definirVisiveis(visivel: (item: ObjetoDaCena) => boolean): void {
    this.provisorios.definirVisiveis(visivel);
    const matriz = new Matrix4();
    for (const lote of this.lotes) {
      lote.visiveis = lote.itens.filter(visivel);
      lote.malha.count = lote.visiveis.length;
      lote.visiveis.forEach((item, i) => {
        matriz.makeRotationY(giroParaCena(item.objeto.giro));
        matriz.setPosition(...item.posicao);
        matriz.multiply(lote.local);
        lote.malha.setMatrixAt(i, matriz);
      });
      lote.malha.instanceMatrix.needsUpdate = true;
      lote.malha.computeBoundingBox();
      lote.malha.computeBoundingSphere();
    }
  }

  objetoDe(intersecao: Intersection): ObjetoId | null {
    const lote = this.lotes.find((x) => x.malha === intersecao.object);
    if (lote && intersecao.instanceId !== undefined)
      return lote.visiveis[intersecao.instanceId]?.objeto.id ?? null;
    return this.provisorios.objetoDe(intersecao);
  }

  topoDe(id: ObjetoId): PontoDaCena | null {
    const achado = this.porId.get(id);
    if (!achado) return this.provisorios.topoDe(id);
    const { item, modelo } = achado;
    const [min, max] = modelo.entrada.limites;
    const topo = new Vector3((min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2);
    topo.applyAxisAngle(new Vector3(0, 1, 0), giroParaCena(item.objeto.giro));
    return [topo.x + item.posicao[0], topo.y + item.posicao[1], topo.z + item.posicao[2]];
  }

  dispose(): void {
    this.raiz.removeFromParent();
    this.provisorios.dispose();
    for (const lote of this.lotes) lote.malha.dispose();
    this.raiz.clear();
  }
}
