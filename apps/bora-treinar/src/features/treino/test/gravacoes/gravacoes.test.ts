import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carregarGravacoes, contarGravacao } from "./carregar";

const gravacoes = carregarGravacoes(fileURLToPath(new URL(".", import.meta.url)));

describe("gravações de gente de verdade", () => {
  it("as gravações da pasta estão no formato do README", () => {
    // carregarGravacoes já recusa arquivo fora do formato; sem nenhum, nada a conferir
    expect(gravacoes.every(({ gravacao }) => gravacao.frames.length > 0)).toBe(true);
  });

  for (const { arquivo, gravacao } of gravacoes)
    it(`${arquivo}: ${gravacao.expected.reps} repetições e ${gravacao.expected.partials} parciais`, () => {
      const { reps, partials } = contarGravacao(gravacao);
      expect({ reps, partials }).toEqual(gravacao.expected);
    });
});
