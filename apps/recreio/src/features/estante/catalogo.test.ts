import { JOGOS } from "@informach/config/jogos";
import { describe, expect, it } from "vitest";
import { cartoesDaEstante, rotuloDosAparelhos } from "./catalogo";

describe("estante", () => {
  it("mostra o Morada do catálogo, em alfa fechado, no computador", () => {
    expect(cartoesDaEstante(JOGOS)).toEqual([
      { id: "morada", nome: "Morada", estado: "alfa fechado", aparelhos: "computador" },
    ]);
  });
  it("mantém a ordem do catálogo", () => {
    const [morada] = JOGOS;
    const cartoes = cartoesDaEstante([
      { ...morada, nome: "Segundo", estado: "em_breve" },
      { ...morada, nome: "Primeiro", estado: "lancado" },
    ]);
    expect(cartoes.map((cartao) => [cartao.nome, cartao.estado])).toEqual([
      ["Segundo", "em breve"],
      ["Primeiro", "disponível"],
    ]);
  });
  it.each([
    [[], ""],
    [["computador"], "computador"],
    [["computador", "tablet"], "computador e tablet"],
    [["computador", "tablet", "celular"], "computador, tablet e celular"],
  ] as const)("escreve os aparelhos %j como %s", (aparelhos, esperado) => {
    expect(rotuloDosAparelhos(aparelhos)).toBe(esperado);
  });
});
