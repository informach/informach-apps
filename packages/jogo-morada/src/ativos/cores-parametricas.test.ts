import type { CoresDoPersonagem } from "@informach/morada-arte/manifesto";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Texture,
} from "three";
import { describe, expect, it } from "vitest";
import { CoresParametricas } from "./cores-parametricas";

const cores: CoresDoPersonagem = {
  referenciaDePele: "#ffffff",
  canais: [{ id: "pele", origem: "pele", parte: null, inicial: [1, 1, 1] }],
};

function cena() {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute("_morada_canal_cor", new Float32BufferAttribute([0], 1));
  geometry.setAttribute("_morada_mascara_cor", new Float32BufferAttribute([1], 1));
  geometry.setAttribute("_morada_peso_cor", new Float32BufferAttribute([1, 1, 1], 3));
  const material = new MeshBasicMaterial({ vertexColors: true });
  material.userData.moradaCor = { tipo: "vertices" };
  const raiz = new Group();
  raiz.add(new Mesh(geometry, material), new Mesh(geometry, material));
  return { raiz, geometry, material };
}

describe("materiais de cor por morador", () => {
  it("divide geometria e textura, isola material e descarta somente seus próprios recursos", () => {
    const { raiz, geometry, material } = cena();
    const textura = new Texture();
    material.map = textura;
    const outra = raiz.clone();
    const a = new CoresParametricas(raiz, cores);
    const b = new CoresParametricas(outra, cores);
    const [primeira, segunda] = raiz.children;
    const terceira = outra.children[0];
    if (
      !(primeira instanceof Mesh) ||
      !(segunda instanceof Mesh) ||
      !(terceira instanceof Mesh) ||
      Array.isArray(primeira.material)
    )
      throw new Error("Malhas ausentes");
    expect(primeira.material).toBe(segunda.material);
    expect(primeira.material).not.toBe(material);
    expect(primeira.material).not.toBe(terceira.material);
    expect(primeira.geometry).toBe(geometry);
    expect(primeira.material).toMatchObject({ map: textura });
    const descartes = { proprio: 0, geometria: 0, textura: 0, original: 0, outro: 0 };
    primeira.material.addEventListener("dispose", () => descartes.proprio++);
    geometry.addEventListener("dispose", () => descartes.geometria++);
    textura.addEventListener("dispose", () => descartes.textura++);
    material.addEventListener("dispose", () => descartes.original++);
    if (Array.isArray(terceira.material)) throw new Error("Material inesperado");
    terceira.material.addEventListener("dispose", () => descartes.outro++);
    a.definir(new Map([["pele", [1.8, 0.2, 0.1]]]));
    a.dispose();
    a.dispose();
    expect(descartes).toEqual({ proprio: 1, geometria: 0, textura: 0, original: 0, outro: 0 });
    b.definir(new Map([["pele", [0.2, 0.4, 0.8]]]));
    b.dispose();
    expect(descartes.outro).toBe(1);
    geometry.dispose();
    textura.dispose();
    material.dispose();
  });

  it("recusa canais inexistentes, valores inválidos e atributos corrompidos", () => {
    const { raiz, geometry, material } = cena();
    const controle = new CoresParametricas(raiz, cores);
    expect(() => controle.definir(new Map([["inventado", [1, 1, 1]]]))).toThrow(/desconhecido/);
    for (const valor of [NaN, Infinity, -1, 4097])
      expect(() => controle.definir(new Map([["pele", [valor, 0, 0]]]))).toThrow(/fora/);
    controle.dispose();
    geometry.getAttribute("_morada_canal_cor").setX(0, 16);
    expect(() => new CoresParametricas(raiz, cores)).toThrow(/fora do perfil/);
    geometry.dispose();
    material.dispose();
  });
});
