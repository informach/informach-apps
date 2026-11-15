import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from "three";
import { describe, expect, it } from "vitest";
import { medirEnquadramento } from "./enquadramento";

function geometria(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 2, 0, 1, 0, 0], 3));
  return g;
}

describe("enquadramento da pose visível", () => {
  it("ignora peças e materiais ocultos e mede no referencial da raiz", () => {
    const raiz = new Group();
    raiz.position.set(25, 3, -9);
    raiz.rotation.y = Math.PI / 2;
    const modelo = new Group();
    const g = geometria();
    const material = new MeshBasicMaterial();
    modelo.add(new Mesh(g, material));
    const oculto = new Mesh(g, material);
    oculto.position.y = 100;
    oculto.visible = false;
    modelo.add(oculto);
    const invisivel = new MeshBasicMaterial({ visible: false });
    const auxiliar = new Mesh(g, invisivel);
    auxiliar.position.y = -100;
    modelo.add(auxiliar);
    raiz.add(modelo);
    const medida = medirEnquadramento(modelo, raiz);
    expect(medida.centro[0]).toBeCloseTo(0.5);
    expect(medida.centro[1]).toBeCloseTo(1);
    expect(medida.centro[2]).toBeCloseTo(0);
    expect(medida.tamanho).toBeCloseTo(2);
    g.dispose();
    material.dispose();
    invisivel.dispose();
  });

  it("considera a pose dos ossos, sem confundir altura em pé ou transformação do cenário", () => {
    const raiz = new Group();
    const modelo = new Group();
    raiz.add(modelo);
    const osso = new Bone();
    const g = geometria();
    g.setAttribute("skinIndex", new Uint16BufferAttribute(new Array(12).fill(0), 4));
    g.setAttribute(
      "skinWeight",
      new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
    );
    const material = new MeshBasicMaterial();
    const malha = new SkinnedMesh(g, material);
    modelo.add(osso, malha);
    const esqueleto = new Skeleton([osso]);
    malha.bind(esqueleto);
    osso.scale.y = 0.5;
    raiz.position.set(25, 3, -9);
    const medida = medirEnquadramento(modelo, raiz);
    expect(medida.centro[0]).toBeCloseTo(0.5);
    expect(medida.centro[1]).toBeCloseTo(0.5);
    expect(medida.centro[2]).toBeCloseTo(0);
    expect(medida.tamanho).toBeCloseTo(1);
    esqueleto.dispose();
    g.dispose();
    material.dispose();
  });

  it("inclui a deformação de morph ativa", () => {
    const raiz = new Group();
    const g = geometria();
    g.morphTargetsRelative = true;
    g.morphAttributes.position = [new Float32BufferAttribute([0, 0, 0, 0, 2, 0, 0, 0, 0], 3)];
    const material = new MeshBasicMaterial();
    const modelo = new Mesh(g, material);
    if (!modelo.morphTargetInfluences) throw new Error("Fixture sem morph");
    modelo.morphTargetInfluences[0] = 0.5;
    raiz.add(modelo);
    expect(medirEnquadramento(modelo, raiz)).toEqual({ centro: [0.5, 1.5, 0], tamanho: 3 });
    g.dispose();
    material.dispose();
  });
});
