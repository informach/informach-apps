import { PRODUCTS } from "@informach/config";
import { describe, expect, it } from "vitest";
import { ofertas, reais } from "./ofertas";

const bora = PRODUCTS.filter((p) => p.app === "bora-treinar");

describe("planos na tela", () => {
  it("Individual primeiro, depois Família", () => {
    expect(ofertas(bora).map((o) => o.tier)).toEqual(["individual", "family"]);
  });

  it("o anual aparece por mês e pelos meses de graça, calculados do catálogo", () => {
    const [individual, familia] = ofertas(bora);
    expect(reais(individual?.anual.porMes ?? 0)).toBe(reais(2075));
    expect(individual?.anual.mesesGratis).toBe(2);
    expect(reais(familia?.anual.porMes ?? 0)).toBe(reais(2908));
    expect(familia?.anual.mesesGratis).toBe(2);
  });

  it("plano sem preço no catálogo não aparece", () => {
    expect(ofertas([{ id: "x", tier: "individual", interval: "month" }])).toEqual([]);
  });
});
