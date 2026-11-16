import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Texture,
  Vector2,
} from "three";
import { describe, expect, it } from "vitest";
import { CoresParametricas } from "./cores-parametricas";
import { MateriaisSimples } from "./materiais-simples";

describe("material leve do corpo", () => {
  it("conserva mapas, alpha, faces e cor sem compartilhar mutações ou descartar o pacote", () => {
    const textura = new Texture();
    const original = new MeshStandardMaterial({
      color: 0x123456,
      emissive: 0x112233,
      emissiveIntensity: 0.4,
      map: textura,
      alphaMap: textura,
      normalMap: textura,
      normalScale: new Vector2(0.5, 0.7),
      alphaTest: 0.25,
      opacity: 0.6,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      vertexColors: true,
    });
    original.userData.moradaCor = { tipo: "vertices" };
    const geometria = new BufferGeometry();
    const raiz = new Group();
    const a = new Mesh<BufferGeometry, Material>(geometria, original),
      b = new Mesh<BufferGeometry, Material>(geometria, original);
    raiz.add(a, b);
    const politica = new MateriaisSimples();
    politica.aplicar(raiz);
    politica.aplicar(raiz);
    if (!(a.material instanceof MeshLambertMaterial)) throw new Error("Material leve ausente");
    expect(a.material).toBe(b.material);
    expect(a.material.color.getHex()).toBe(0x123456);
    expect(a.material.emissive.getHex()).toBe(0x112233);
    expect(a.material).toMatchObject({
      map: textura,
      alphaMap: textura,
      normalMap: textura,
      alphaTest: 0.25,
      transparent: true,
      opacity: 0.6,
      side: DoubleSide,
      depthWrite: false,
      vertexColors: true,
      emissiveIntensity: 0.4,
    });
    expect(a.material.userData).toEqual(original.userData);
    a.material.color.setHex(0xffffff);
    a.material.normalScale.set(1, 1);
    expect(original.color.getHex()).toBe(0x123456);
    expect(original.normalScale.toArray()).toEqual([0.5, 0.7]);
    expect(a.geometry).toBe(geometria);
    const descartes = { local: 0, original: 0, textura: 0, geometria: 0 };
    a.material.addEventListener("dispose", () => descartes.local++);
    original.addEventListener("dispose", () => descartes.original++);
    textura.addEventListener("dispose", () => descartes.textura++);
    geometria.addEventListener("dispose", () => descartes.geometria++);
    politica.dispose();
    politica.dispose();
    expect(descartes).toEqual({ local: 1, original: 0, textura: 0, geometria: 0 });
    original.dispose();
    textura.dispose();
    geometria.dispose();
  });

  it("isola dois corpos e conserva a aplicação posterior da paleta", () => {
    const original = new MeshStandardMaterial({ vertexColors: true });
    original.userData.moradaCor = { tipo: "vertices" };
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
    g.setAttribute("_morada_canal_cor", new Float32BufferAttribute([0], 1));
    g.setAttribute("_morada_mascara_cor", new Float32BufferAttribute([1], 1));
    g.setAttribute("_morada_peso_cor", new Float32BufferAttribute([1, 1, 1], 3));
    const a = new Group(),
      b = new Group();
    const primeira = new Mesh(g, original),
      segunda = new Mesh(g, original);
    a.add(primeira);
    b.add(segunda);
    const leveA = new MateriaisSimples(),
      leveB = new MateriaisSimples();
    leveA.aplicar(a);
    leveB.aplicar(b);
    expect(primeira.material).not.toBe(segunda.material);
    const paleta = new CoresParametricas(a, {
      referenciaDePele: "#ffffff",
      canais: [{ id: "pele", origem: "pele", parte: null, inicial: [1, 1, 1] }],
    });
    paleta.definir(new Map<string, readonly [number, number, number]>([["pele", [0.2, 0.3, 0.4]]]));
    expect(primeira.material).toBeInstanceOf(MeshLambertMaterial);
    expect(primeira.material.customProgramCacheKey()).toContain("morada-cor-v3:vertices");
    expect(segunda.material.customProgramCacheKey()).not.toContain("morada-cor-v3:vertices");
    expect(primeira.geometry).toBe(segunda.geometry);
    paleta.dispose();
    leveA.dispose();
    leveB.dispose();
    original.dispose();
    g.dispose();
  });

  it("conserva material sem iluminação e o físico com transmissão", () => {
    const simples = new MeshBasicMaterial();
    const vidro = new MeshPhysicalMaterial({ transmission: 1, roughness: 0.1 });
    const malha = new Mesh(new BufferGeometry(), [simples, vidro]);
    const politica = new MateriaisSimples();
    politica.aplicar(malha);
    expect(malha.material).toEqual([simples, vidro]);
    politica.dispose();
    simples.dispose();
    vidro.dispose();
    malha.geometry.dispose();
  });
});
