import { hexParaLinear, tomDePeleLivre } from "@informach/morada-arte/cores";
import type { Aparencia } from "@informach/morada-sim";
import { describe, expect, it } from "vitest";
import { personagem } from "../testes/manifesto-de-arte";
import { coresDaAparencia } from "./cores-da-aparencia";

describe("receita RGB para uniformes", () => {
  it("conserva HDR da pele, deriva o rosto e converte cabelo/roupa em espaço linear", () => {
    const modelo = personagem("criacao", {
      criacao: {
        rotuloDoCabelo: "Natural",
        rotuloDaRoupa: "Casual",
        corDoCabelo: 0,
        coresDaRoupa: { cima: 0 },
      },
      cores: {
        referenciaDePele: "#808080",
        canais: [
          { id: "pele", origem: "pele", parte: null, inicial: [1, 1, 1] },
          { id: "rosto", origem: "rosto", parte: null, inicial: [1, 1, 1] },
          { id: "cabelo", origem: "cabelo", parte: null, inicial: [1, 1, 1] },
          { id: "roupa_cima", origem: "roupa", parte: "cima", inicial: [1, 1, 1] },
        ],
      },
    });
    const aparencia: Aparencia = {
      linha: "f",
      corpo: "adulta",
      pele: 0xffffff,
      cabelo: "natural",
      roupa: "casual",
      semente: 1,
      edicao: { versao: 1, corDoCabelo: 0x804020, coresDaRoupa: { cima: 0x102030 } },
    };
    const cores = coresDaAparencia(modelo, aparencia);
    expect(cores.get("pele")).toEqual(tomDePeleLivre("#808080", "#FFFFFF").pele);
    expect(cores.get("pele")?.every((v) => v > 1)).toBe(true);
    expect(cores.get("rosto")).toEqual([1, 1, 1]);
    expect(cores.get("cabelo")).toEqual(hexParaLinear("#804020"));
    expect(cores.get("roupa_cima")).toEqual(hexParaLinear("#102030"));
    expect(coresDaAparencia(modelo, { ...aparencia, edicao: undefined }).size).toBe(0);
    expect(() =>
      coresDaAparencia(modelo, {
        ...aparencia,
        edicao: { versao: 1, corDoCabelo: 0, coresDaRoupa: {} },
      }),
    ).toThrow(/parte/);
  });
});
