import type { AberturaDoManifesto } from "@informach/morada-arte/manifesto";
import type { Lote } from "@informach/morada-sim";
import type { DocumentoDeImovel } from "@informach/morada-sim/formatos";
import { Group } from "three";
import { describe, expect, it } from "vitest";
import { montarAberturas } from "./aberturas";

describe("encaixes da casa", () => {
  it("encaixa no vão salvo e abre só a folha, sem modificar o modelo compartilhado", () => {
    const modelo = new Group();
    const folha = new Group();
    folha.name = "porta_teste";
    const batente = new Group();
    batente.name = "batente";
    modelo.add(folha, batente);
    const entrada: AberturaDoManifesto = {
      id: "porta_teste",
      tipo: "porta",
      largura: 0.9,
      altura: 2.1,
      peitoril: 0,
      arquivo: "porta.0123456789.glb",
      bytes: 1,
      desenho: { chamadas: 0, triangulos: 0, vertices: 0, texturas: 0 },
    };
    const andar: DocumentoDeImovel["andares"][number] = {
      n: 0,
      z: 450,
      contorno: [],
      comodos: [],
      paredes: [{ id: "p", a: [0, 0], b: [2000, 0] }],
      aberturas: [
        {
          id: "a",
          parede: "p",
          centro: [1000, 0],
          largura: 900,
          altura: 2100,
          peitoril: 0,
          tipo: "porta",
          externa: true,
        },
      ],
    };
    const imovel: DocumentoDeImovel = {
      formato: "morada.imovel",
      versao: 1,
      id: "casa_teste",
      modelo: null,
      revisao: 1,
      fundacao: 450,
      andares: [andar],
    };
    const visual = montarAberturas(
      imovel,
      { origem: [2000, 3000] } as Lote,
      [entrada],
      new Map([[entrada.arquivo, modelo]]),
    );
    expect(visual.children[0]?.position.toArray()).toEqual([3, 0.45, -3]);
    expect(visual.getObjectByName("dobradica-aberta")?.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(visual.getObjectByName("batente")?.rotation.y).toBe(0);
    expect(modelo.getObjectByName("dobradica-aberta")).toBeUndefined();
    expect(folha.position.x).toBe(0);
  });
});
