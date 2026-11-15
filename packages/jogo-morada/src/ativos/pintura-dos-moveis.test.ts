import {
  ATRIBUTO_MASCARA_PINTURA,
  ATRIBUTO_PESO_PINTURA,
  type PinturaDoObjeto,
} from "@informach/morada-arte/manifesto";
import { BufferGeometry, Float32BufferAttribute, MeshBasicMaterial, Texture } from "three";
import { describe, expect, it } from "vitest";
import { PinturaDosMoveis } from "./pintura-dos-moveis";

const perfil: PinturaDoObjeto = {
  perfil: "a".repeat(64),
  rotulo: "Estrutura",
  referencia: 0xc86432,
  mascara: ATRIBUTO_MASCARA_PINTURA,
  pesos: ATRIBUTO_PESO_PINTURA,
};
function modelo() {
  const geometria = new BufferGeometry();
  geometria.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometria.setAttribute(
    ATRIBUTO_MASCARA_PINTURA.toLowerCase(),
    new Float32BufferAttribute([1, 1, 1], 1),
  );
  geometria.setAttribute(
    ATRIBUTO_PESO_PINTURA.toLowerCase(),
    new Float32BufferAttribute([1, 1, 1], 1),
  );
  const material = new MeshBasicMaterial({ map: new Texture() });
  material.userData.moradaPintura = { perfil: perfil.perfil };
  return { geometria, material };
}

describe("materiais de pintura por grupo de instâncias", () => {
  it("compartilha a geometria e a textura, isolando somente o material pintado", () => {
    const { geometria, material } = modelo();
    const a = new PinturaDosMoveis(perfil),
      b = new PinturaDosMoveis(perfil);
    const pintado = a.material(material, geometria),
      outro = b.material(material, geometria);
    expect(a.material(material, geometria)).toBe(pintado);
    expect(pintado).not.toBe(material);
    expect(pintado).not.toBe(outro);
    expect(pintado).toMatchObject({ map: material.map });
    const descartes = { proprio: 0, original: 0, geometria: 0, textura: 0 };
    pintado.addEventListener("dispose", () => descartes.proprio++);
    material.addEventListener("dispose", () => descartes.original++);
    geometria.addEventListener("dispose", () => descartes.geometria++);
    material.map?.addEventListener("dispose", () => descartes.textura++);
    a.dispose();
    a.dispose();
    expect(descartes).toEqual({ proprio: 1, original: 0, geometria: 0, textura: 0 });
    b.dispose();
    material.map?.dispose();
    material.dispose();
    geometria.dispose();
  });

  it("preserva materiais não pintáveis e recusa perfil divergente e atributos corrompidos", () => {
    const { geometria, material } = modelo();
    const pintura = new PinturaDosMoveis(perfil),
      vidro = new MeshBasicMaterial({ transparent: true, opacity: 0.38 });
    const detalhe = pintura.material(vidro, geometria);
    expect(detalhe).not.toBe(vidro);
    expect(detalhe).toMatchObject({ transparent: true, opacity: 0.38 });
    material.userData.moradaPintura = { perfil: "b".repeat(64) };
    expect(() => pintura.material(material, geometria)).toThrow(/diverge/);
    material.userData.moradaPintura = { perfil: perfil.perfil };
    geometria.getAttribute(ATRIBUTO_PESO_PINTURA.toLowerCase()).setX(0, NaN);
    expect(() => pintura.material(material, geometria)).toThrow(/fora do perfil/);
    pintura.dispose();
    vidro.dispose();
    material.map?.dispose();
    material.dispose();
    geometria.dispose();
  });
});
