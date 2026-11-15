import {
  ATRIBUTO_MASCARA_PINTURA,
  ATRIBUTO_PESO_PINTURA,
  type ObjetoDoManifesto,
} from "@informach/morada-arte/manifesto";
import type { Objeto, ObjetoId } from "@informach/morada-sim";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import type { ObjetoDaCena } from "./ativos";
import { ObjetosDeArte } from "./objetos";
import { AtivosProcedurais } from "./procedurais";

describe("instâncias de móveis originais e pintados", () => {
  it("agrupa cores diferentes juntas, preserva vidro/original e descarta somente materiais próprios", () => {
    const perfil = "a".repeat(64);
    const entrada: ObjetoDoManifesto = {
      id: "mesa_sintetica",
      versao: 1,
      arquivo: "mesa.0123456789.glb",
      bytes: 1,
      limites: [
        [0, 0, 0],
        [1, 1, 1],
      ],
      apoios: {},
      desenho: { chamadas: 2, triangulos: 2, vertices: 6, texturas: 0 },
      pintura: {
        perfil,
        rotulo: "Estrutura",
        referencia: 0xc86432,
        mascara: ATRIBUTO_MASCARA_PINTURA,
        pesos: ATRIBUTO_PESO_PINTURA,
      },
    };
    const geometria = new BufferGeometry().setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    geometria.setAttribute(
      ATRIBUTO_MASCARA_PINTURA.toLowerCase(),
      new Float32BufferAttribute([1, 1, 1], 1),
    );
    geometria.setAttribute(
      ATRIBUTO_PESO_PINTURA.toLowerCase(),
      new Float32BufferAttribute([1, 1, 1], 1),
    );
    const atlas = new MeshBasicMaterial();
    atlas.userData.moradaPintura = { perfil };
    const vidro = new MeshBasicMaterial({ transparent: true, opacity: 0.38 });
    const cena = new Group().add(new Mesh(geometria, atlas), new Mesh(geometria, vidro));
    const item = (id: ObjetoId, pintura: Objeto["pintura"]): ObjetoDaCena => ({
      objeto: {
        id,
        catalogo: entrada.id,
        versao: 1,
        revisao: 1,
        loteId: "lote_1",
        pos: [0, 0, 0],
        andar: 0,
        giro: 0,
        cor: 0xffffff,
        pintura,
        ocupacao: {},
      },
      entrada: undefined,
      posicao: [0, 0, 0],
    });
    const itens = [
      item("obj_original", null),
      item("obj_branco", { perfil, cor: 0xffffff }),
      item("obj_preto", { perfil, cor: 0 }),
    ];
    const procedurais = new AtivosProcedurais();
    const visual = new ObjetosDeArte(
      itens,
      new Map([[`${entrada.id}@1`, { entrada, cena }]]),
      procedurais.criarObjetos([]),
    );
    const malhas = visual.raiz.children.filter(
      (m): m is InstancedMesh => m instanceof InstancedMesh && m.geometry === geometria,
    );
    expect(malhas).toHaveLength(4);
    const originais = malhas.filter((m) => m.count === 1),
      pintados = malhas.filter((m) => m.count === 2);
    expect(originais.map((m) => m.material)).toEqual([atlas, vidro]);
    expect(originais.every((m) => m.instanceColor === null)).toBe(true);
    expect(pintados.every((m) => m.geometry === geometria)).toBe(true);
    const cor = new Color();
    for (const malha of pintados) {
      malha.getColorAt(0, cor);
      expect(cor.getHex()).toBe(0xffffff);
      malha.getColorAt(1, cor);
      expect(cor.getHex()).toBe(0);
    }
    let proprios = 0,
      compartilhados = 0;
    for (const malha of pintados)
      for (const m of Array.isArray(malha.material) ? malha.material : [malha.material])
        m.addEventListener("dispose", () => proprios++);
    for (const m of [geometria, atlas, vidro])
      m.addEventListener("dispose", () => compartilhados++);
    visual.definirVisiveis((i) => i.objeto.id === "obj_preto");
    const pintado = pintados[0];
    if (!pintado) throw new Error("Instância ausente");
    expect(pintado.count).toBe(1);
    expect(
      visual.objetoDe({ object: pintado, instanceId: 0, distance: 0, point: new Vector3() }),
    ).toBe("obj_preto");
    visual.dispose();
    visual.dispose();
    expect(proprios).toBe(2);
    expect(compartilhados).toBe(0);
    procedurais.dispose();
    geometria.dispose();
    atlas.dispose();
    vidro.dispose();
  });
});
