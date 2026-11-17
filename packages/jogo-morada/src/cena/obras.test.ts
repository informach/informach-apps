import { listar, obter, type PresencaVista } from "@informach/morada-sim";
import { BRUNO, criarMundoDaProva, LIA } from "@informach/morada-sim/testes";
import { describe, expect, it } from "vitest";
import { ObrasDaCena } from "./obras";

describe("regiões reservadas na cena", () => {
  it("desenha só a outra pessoa na casa aberta, na altura e origem corretas, reutilizando o buffer", () => {
    const estado = criarMundoDaProva().estado;
    const lote = listar(estado.lotes).find((l) => l.imovelId);
    const imovel = lote?.imovelId ? obter(estado.imoveis, lote.imovelId) : null;
    const piso = imovel?.andares.find((a) => a.n === 0);
    if (!lote || !piso || !lote.familiaId) throw new Error("Casa ausente");
    const familiaId = lote.familiaId;
    const obras: NonNullable<PresencaVista["obras"]> = [LIA, BRUNO].map((perfilId, i) => ({
      perfilId,
      referencia: { geracao: "00000000-0000-4000-8000-000000000001", numero: i + 1 },
      prazoMs: 15_000,
      alvo: {
        familiaId,
        loteId: lote.id,
        peca: null,
        regioes: [{ andar: 0, retangulo: [1000, 2000, 1500, 2500] }],
      },
    }));
    const cena = new ObrasDaCena();
    const geometria = cena.raiz.geometry;
    const atributo = geometria.getAttribute("position");
    cena.definir(estado, obras, LIA, lote.id, 0);
    expect(cena.raiz.visible).toBe(true);
    expect(cena.raiz.layers.mask).toBe(2);
    expect(geometria.drawRange.count).toBe(8);
    expect(atributo.getX(0)).toBeCloseTo((lote.origem[0] + 1000) / 1000);
    expect(atributo.getY(0)).toBeCloseTo((piso.z + 30) / 1000);
    expect(atributo.getZ(0)).toBeCloseTo(-(lote.origem[1] + 2000) / 1000);
    for (let i = 1; i <= 100; i++) {
      cena.definir(estado, [...obras], LIA, lote.id, i);
      expect(cena.raiz.geometry).toBe(geometria);
      expect(cena.raiz.geometry.getAttribute("position")).toBe(atributo);
    }
    cena.definir(estado, obras, LIA, null, 100);
    expect(geometria.drawRange.count).toBe(0);
    expect(cena.raiz.visible).toBe(false);
    let geometriaLiberada = false,
      materialLiberado = false;
    geometria.addEventListener("dispose", () => {
      geometriaLiberada = true;
    });
    cena.raiz.material.addEventListener("dispose", () => {
      materialLiberado = true;
    });
    cena.dispose();
    expect(geometriaLiberada && materialLiberado).toBe(true);
  });
});
