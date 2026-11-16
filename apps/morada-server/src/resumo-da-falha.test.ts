import { ErroDoRecreio } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { resumoDaFalha } from "./resumo-da-falha";

describe("falhas sem conteúdo nos logs", () => {
  it("ignora mensagem, nome, causa e stack com conteúdo de fora", () => {
    const erro = new Error("Bearer segredo", { cause: { email: "pessoa@example.test" } });
    erro.name = "nome privado";
    erro.stack = "conteúdo da família";
    expect(resumoDaFalha(erro)).toEqual({ nome: "Error", codigo: "INTERNO" });
    Object.defineProperty(erro, "name", {
      get() {
        throw new Error("nome não deve ser lido");
      },
    });
    expect(resumoDaFalha(erro)).toEqual({ nome: "Error", codigo: "INTERNO" });
  });

  it.each([SyntaxError, TypeError, RangeError, ReferenceError, URIError, AggregateError])(
    "conserva somente a classe nativa %s",
    (Tipo) => {
      const erro =
        Tipo === AggregateError
          ? new AggregateError([new Error("segredo")], "privado")
          : new Tipo("privado");
      expect(resumoDaFalha(erro)).toEqual({ nome: Tipo.name, codigo: "INTERNO" });
    },
  );

  it("conserva o código admitido do Recreio, sem serializar seu detalhe", () => {
    const erro = new ErroDoRecreio("POSSE_PERDIDA");
    erro.message = "token privado";
    erro.name = "apelido privado";
    expect(resumoDaFalha(erro)).toEqual({ nome: "ErroDoRecreio", codigo: "POSSE_PERDIDA" });
  });

  it("não converte nem lê propriedades de um valor desconhecido", () => {
    const estranho = {
      toString() {
        throw new Error("conversão proibida");
      },
      toJSON() {
        throw new Error("serialização proibida");
      },
    };
    expect(resumoDaFalha(estranho)).toEqual({ nome: "desconhecido", codigo: "INTERNO" });
    expect(resumoDaFalha("Bearer segredo")).toEqual({ nome: "desconhecido", codigo: "INTERNO" });
  });
});
