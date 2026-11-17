import type { ObjetoDoManifesto } from "@informach/morada-arte/manifesto";
import type { ObjetoId } from "@informach/morada-sim";
import {
  Color,
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
import { PinturaDosMoveis } from "./pintura-dos-moveis";

export type ModeloDeObjeto = { entrada: ObjetoDoManifesto; cena: Object3D };
type Lote = {
  malha: InstancedMesh;
  itens: ObjetoDaCena[];
  visiveis: ObjetoDaCena[];
  local: Matrix4;
  pintado: boolean;
};

/** Uma instância por primitiva do modelo; geometria e material pertencem ao cache dos ativos. */
export class ObjetosDeArte implements VisualDosObjetos {
  readonly raiz = new Group();
  private readonly lotes: Lote[] = [];
  private readonly porId = new Map<ObjetoId, { item: ObjetoDaCena; modelo: ModeloDeObjeto }>();
  private readonly pinturas = new Set<PinturaDosMoveis>();
  private descartado = false;

  constructor(
    itens: readonly ObjetoDaCena[],
    modelos: ReadonlyMap<string, ModeloDeObjeto>,
    private readonly provisorios: VisualDosObjetos,
  ) {
    this.raiz.add(provisorios.raiz);
    try {
      const grupos = new Map<
        ModeloDeObjeto,
        { originais: ObjetoDaCena[]; pintados: ObjetoDaCena[] }
      >();
      for (const item of itens) {
        const modelo = modelos.get(`${item.objeto.catalogo}@${item.objeto.versao}`);
        if (!modelo) continue;
        this.porId.set(item.objeto.id, { item, modelo });
        if (item.objeto.pintura && item.objeto.pintura.perfil !== modelo.entrada.pintura?.perfil)
          throw new Error("A pintura da peça não corresponde ao modelo carregado");
        const grupo = grupos.get(modelo) ?? { originais: [], pintados: [] };
        (item.objeto.pintura ? grupo.pintados : grupo.originais).push(item);
        grupos.set(modelo, grupo);
      }
      for (const [modelo, grupo] of grupos) {
        for (const [pintado, objetos] of [
          [false, grupo.originais],
          [true, grupo.pintados],
        ] as const) {
          if (objetos.length === 0) continue;
          const pintura =
            pintado && modelo.entrada.pintura ? new PinturaDosMoveis(modelo.entrada.pintura) : null;
          if (pintura) {
            this.pinturas.add(pintura);
            pintura.conferir(modelo.cena);
          }
          modelo.cena.updateMatrixWorld(true);
          modelo.cena.traverse((no) => {
            if (!(no instanceof Mesh)) return;
            const material = !pintura
              ? no.material
              : Array.isArray(no.material)
                ? no.material.map((m) => pintura.material(m, no.geometry))
                : pintura.material(no.material, no.geometry);
            const malha = new InstancedMesh(no.geometry, material, objetos.length);
            malha.castShadow = true;
            malha.receiveShadow = true;
            this.lotes.push({
              malha,
              itens: objetos,
              visiveis: [],
              local: no.matrixWorld.clone(),
              pintado,
            });
            this.raiz.add(malha);
          });
        }
      }
      this.definirVisiveis(() => true);
    } catch (erro) {
      this.dispose();
      throw erro;
    }
  }

  definirVisiveis(visivel: (item: ObjetoDaCena) => boolean): void {
    this.provisorios.definirVisiveis(visivel);
    const matriz = new Matrix4();
    const cor = new Color();
    for (const lote of this.lotes) {
      lote.visiveis = lote.itens.filter(visivel);
      lote.malha.count = lote.visiveis.length;
      lote.visiveis.forEach((item, i) => {
        matriz.makeRotationY(giroParaCena(item.objeto.giro));
        matriz.setPosition(...item.posicao);
        matriz.multiply(lote.local);
        lote.malha.setMatrixAt(i, matriz);
        if (lote.pintado) {
          if (!item.objeto.pintura) throw new Error("Uma instância pintada perdeu seu perfil");
          lote.malha.setColorAt(i, cor.setHex(item.objeto.pintura.cor));
        }
      });
      lote.malha.instanceMatrix.needsUpdate = true;
      if (lote.malha.instanceColor) lote.malha.instanceColor.needsUpdate = true;
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
    if (this.descartado) return;
    this.descartado = true;
    this.raiz.removeFromParent();
    this.provisorios.dispose();
    for (const lote of this.lotes) lote.malha.dispose();
    for (const pintura of this.pinturas) pintura.dispose();
    this.pinturas.clear();
    this.raiz.clear();
  }
}
