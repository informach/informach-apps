import { FASES } from "@informach/morada-sim";
import { corpoDaFase } from "@informach/morada-sim/conteudo";
import { describe, expect, it } from "vitest";
import { elencoDaCriacao } from "../src/personagem/criacao";

describe("matriz fechada da criação", () => {
  it("descreve 48 combinações únicas sobre os corpos canônicos sem copiar tabelas da arte", () => {
    const elenco = elencoDaCriacao();
    expect(elenco).toHaveLength(48);
    expect(new Set(elenco.map((p) => p.id)).size).toBe(48);
    for (const fase of FASES)
      for (const linha of ["f", "m"] as const) {
        const porCorpo = elenco.filter((p) => p.corpo === corpoDaFase(linha, fase));
        expect(porCorpo).toHaveLength(4);
        expect(new Set(porCorpo.map((p) => p.sim?.cabelo))).toEqual(new Set(["natural", "careca"]));
        expect(new Set(porCorpo.map((p) => p.sim?.roupa))).toEqual(
          new Set(["cotidiano", "macacao"]),
        );
        expect(porCorpo.every((p) => p.criacao !== undefined && p.sim?.corpo === p.corpo)).toBe(
          true,
        );
      }
    // Nenhum catálogo/pacote foi lido: a existência e qualidade reais exigem o gate privado.
    expect(elenco.every((p) => p.pele.startsWith("#") && p.cabelo.cor?.startsWith("#"))).toBe(true);
  });
});
