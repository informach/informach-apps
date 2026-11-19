import { describe, expect, it } from "vitest";
import { classificarTrocaDePlano } from "./troca-regras";

describe("aumento e redução do contrato Recreio", () => {
  it.each([
    ["individual_monthly", "family_monthly", "upgrade", "immediate"],
    ["individual_monthly", "family_annual", "upgrade", "immediate"],
    ["individual_annual", "family_monthly", "upgrade", "immediate"],
    ["individual_annual", "family_annual", "upgrade", "immediate"],
    ["family_monthly", "individual_monthly", "downgrade", "period_end"],
    ["family_monthly", "individual_annual", "downgrade", "period_end"],
    ["family_annual", "individual_monthly", "downgrade", "period_end"],
    ["family_annual", "individual_annual", "downgrade", "period_end"],
    ["individual_monthly", "individual_annual", "upgrade", "immediate"],
    ["family_monthly", "family_annual", "upgrade", "immediate"],
    ["individual_annual", "individual_monthly", "downgrade", "period_end"],
    ["family_annual", "family_monthly", "downgrade", "period_end"],
  ])("%s → %s exige %s/%s", (de, para, tipo, vigencia) => {
    const troca = classificarTrocaDePlano(`recreio_${de}`, `recreio_${para}`);
    expect(troca).toMatchObject({ tipo, vigencia });
    expect(troca.atual.productId).toBe(`recreio_${de}`);
    expect(troca.destino.productId).toBe(`recreio_${para}`);
  });
  it.each(["individual_monthly", "individual_annual", "family_monthly", "family_annual"])(
    "a mesma oferta %s não é uma troca autorizada",
    (oferta) => {
      expect(() => classificarTrocaDePlano(`recreio_${oferta}`, `recreio_${oferta}`)).toThrow(
        "oferta diferente",
      );
    },
  );
  it("não aceita produto externo ou inexistente como origem ou destino", () => {
    for (const produto of ["edi_suite_monthly", "compasso_annual", "recreio_unknown"])
      for (const [de, para] of [
        [produto, "recreio_family_monthly"],
        ["recreio_individual_monthly", produto],
      ]) {
        if (!de || !para) throw new Error("Invalid test scenario");
        expect(() => classificarTrocaDePlano(de, para)).toThrow("oferta diferente");
      }
  });
});
