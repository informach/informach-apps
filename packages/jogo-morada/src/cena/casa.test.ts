import type { Lote } from "@informach/morada-sim";
import type { DocumentoDeImovel } from "@informach/morada-sim/formatos";
import { MeshLambertMaterial } from "three";
import { describe, expect, it } from "vitest";
import { montarCasa, trechosDeAcabamento } from "./casa";

const imovel: DocumentoDeImovel = {
  formato: "morada.imovel",
  versao: 1,
  id: "casa",
  modelo: null,
  revisao: 1,
  fundacao: 0,
  andares: [
    {
      n: 0,
      z: 0,
      contorno: [
        [0, 0],
        [4000, 0],
        [4000, 3000],
        [0, 3000],
      ],
      paredes: [{ id: "p1", a: [0, 0], b: [4000, 0] }],
      aberturas: [
        {
          id: "porta",
          parede: "p1",
          centro: [1000, 0],
          largura: 900,
          altura: 2100,
          peitoril: 0,
          tipo: "porta",
          externa: true,
        },
      ],
      comodos: [
        { nome: "um", tipo: "sala", ret: [[0, 0, 2000, 3000]], piso: "piso", parede: "azul" },
        { nome: "dois", tipo: "sala", ret: [[2000, 0, 4000, 3000]], piso: "piso", parede: "rosa" },
      ],
    },
  ],
};
const lote = { origem: [0, 0] } as Lote;
describe("acabamentos da planta", () => {
  it("divide os cômodos sem fechar o vão e mantém UV em metros e faces para dentro", () => {
    const materiais = new Map(
      ["piso", "azul", "rosa"].map((id) => [id, new MeshLambertMaterial()]),
    );
    const fixo = new MeshLambertMaterial();
    const casa = montarCasa(imovel, lote, 1000, fixo, (id) => materiais.get(id) ?? null);
    const andar = imovel.andares[0];
    const parede = andar?.paredes[0];
    if (!andar || !parede) throw new Error("planta sem parede");
    expect(trechosDeAcabamento(andar, parede)).toEqual([0, 2000, 4000]);
    expect(casa.revestimentos).toHaveLength(3);
    const azul = casa.revestimentos.find((m) => m.material === materiais.get("azul"));
    if (!azul) throw new Error("falta a face azul");
    const pos = azul.geometry.getAttribute("position");
    const normal = azul.geometry.getAttribute("normal");
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBeLessThanOrEqual(1);
      expect(normal.getZ(i)).toBeCloseTo(-1);
      // O vão da porta é de 550 a 1450 mm.
      expect(pos.getX(i) <= 0.55001 || pos.getX(i) >= 1.44999).toBe(true);
    }
    const piso = casa.revestimentos.find((m) => m.material === materiais.get("piso"));
    if (!piso) throw new Error("falta o piso");
    expect(piso.geometry.getAttribute("uv").getX(1)).toBe(2);
    for (const malha of [casa.pisos, casa.paredes, ...casa.revestimentos])
      malha?.geometry.dispose();
    for (const mat of materiais.values()) mat.dispose();
    fixo.dispose();
  });
  it("sem material mantém a geometria procedural da casa", () => {
    const mat = new MeshLambertMaterial();
    const casa = montarCasa(imovel, lote, null, mat, () => null);
    expect(casa.revestimentos).toEqual([]);
    expect(casa.pisos).not.toBeNull();
    expect(casa.paredes).not.toBeNull();
    casa.pisos?.geometry.dispose();
    casa.paredes?.geometry.dispose();
    mat.dispose();
  });
});
