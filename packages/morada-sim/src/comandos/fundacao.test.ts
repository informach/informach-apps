import { describe, expect, it } from "vitest";
import type { Fase } from "../dominio/tipos";
import {
  type ImpedimentoDaFundacao,
  impedimentoDaFundacao,
  type RascunhoDaFamilia,
  RascunhoDaFamiliaSchema,
} from "./fundacao";

function familia(fases: Fase[] = ["adulto"]): RascunhoDaFamilia {
  return {
    nome: "Ipê",
    moradores: fases.map((fase, i) => ({
      nome: `Morador ${i + 1}`,
      fase,
      linha: "f",
      pele: 0xa78261,
      cabelo: "coque_alto",
      roupa: "casual_vestido",
      tracos: [],
    })),
    relacoes: [],
  };
}

describe("rascunho da família fictícia", () => {
  it("aceita um morador ou oito, normaliza nomes e não os usa como identidade", () => {
    const uma = familia();
    uma.nome = "  Ipê  ";
    const lida = RascunhoDaFamiliaSchema.parse(uma);
    expect(lida.nome).toBe("Ipê");
    expect(impedimentoDaFundacao(lida, 8)).toBeNull();
    const oito = familia(Array.from({ length: 8 }, (): Fase => "adulto"));
    for (const morador of oito.moradores) morador.nome = "Mesmo nome";
    expect(impedimentoDaFundacao(RascunhoDaFamiliaSchema.parse(oito), 8)).toBeNull();
  });

  it("aceita casal com dois genitores, crianças e todas as fases", () => {
    const dados = familia(["adulto", "idoso", "adolescente", "crianca", "pequeno", "colo"]);
    dados.relacoes = [
      { a: 0, b: 1, tipo: "casamento" },
      { a: 0, b: 2, tipo: "genitor" },
      { a: 1, b: 2, tipo: "genitor" },
      { a: 0, b: 5, tipo: "genitor" },
    ];
    const antes = JSON.stringify(dados);
    expect(impedimentoDaFundacao(RascunhoDaFamiliaSchema.parse(dados), 8)).toBeNull();
    expect(JSON.stringify(dados)).toBe(antes);
  });

  it("recusa campos de autoridade, dinheiro, habilidades e IDs do cliente", () => {
    const dados = familia();
    for (const extra of [{ fundo: 999999 }, { permissoes: ["comandar"] }, { loteId: "lote_1" }])
      expect(RascunhoDaFamiliaSchema.safeParse({ ...dados, ...extra }).success).toBe(false);
    for (const extra of [{ id: "mor_1" }, { habilidades: { cozinhar: 99 } }])
      expect(
        RascunhoDaFamiliaSchema.safeParse({
          ...dados,
          moradores: [{ ...dados.moradores[0], ...extra }],
        }).success,
      ).toBe(false);
  });

  it("limita o pedido e rejeita texto vazio, controles e aparência malformada", () => {
    const dados = familia();
    for (const nome of [" ", "x".repeat(25), "nome\u0000oculto"])
      expect(RascunhoDaFamiliaSchema.safeParse({ ...dados, nome }).success).toBe(false);
    expect(RascunhoDaFamiliaSchema.safeParse({ ...dados, moradores: [] }).success).toBe(false);
    expect(
      RascunhoDaFamiliaSchema.safeParse(familia(Array.from({ length: 33 }, (): Fase => "adulto")))
        .success,
    ).toBe(false);
    for (const extra of [{ pele: 0x1000000 }, { roupa: "../../arquivo" }, { tracos: ["livre"] }])
      expect(
        RascunhoDaFamiliaSchema.safeParse({
          ...dados,
          moradores: [{ ...dados.moradores[0], ...extra }],
        }).success,
      ).toBe(false);
  });

  const recusas: {
    nome: string;
    fases: Fase[];
    relacoes: RascunhoDaFamilia["relacoes"];
    motivo: ImpedimentoDaFundacao;
  }[] = [
    { nome: "sem adulto fictício", fases: ["crianca"], relacoes: [], motivo: "sem_adulto" },
    {
      nome: "referência ausente",
      fases: ["adulto"],
      relacoes: [{ a: 0, b: 1, tipo: "genitor" }],
      motivo: "referencia_invalida",
    },
    {
      nome: "relação consigo",
      fases: ["adulto"],
      relacoes: [{ a: 0, b: 0, tipo: "casamento" }],
      motivo: "referencia_invalida",
    },
    {
      nome: "mesmo par invertido",
      fases: ["adulto", "adulto"],
      relacoes: [
        { a: 0, b: 1, tipo: "namoro" },
        { a: 1, b: 0, tipo: "casamento" },
      ],
      motivo: "relacao_repetida",
    },
    {
      nome: "casal em fase incompatível",
      fases: ["adulto", "adolescente"],
      relacoes: [{ a: 0, b: 1, tipo: "namoro" }],
      motivo: "fase_incompativel",
    },
    {
      nome: "genitor em fase anterior ao filho",
      fases: ["adulto", "idoso"],
      relacoes: [{ a: 0, b: 1, tipo: "genitor" }],
      motivo: "fase_incompativel",
    },
    {
      nome: "três genitores",
      fases: ["adulto", "adulto", "adulto", "colo"],
      relacoes: [0, 1, 2].map((a) => ({ a, b: 3, tipo: "genitor" })),
      motivo: "genitores_excedidos",
    },
    {
      nome: "ciclo de três gerações",
      fases: ["adulto", "adulto", "adulto"],
      relacoes: [
        { a: 0, b: 1, tipo: "genitor" },
        { a: 1, b: 2, tipo: "genitor" },
        { a: 2, b: 0, tipo: "genitor" },
      ],
      motivo: "parentesco_ciclico",
    },
    {
      nome: "irmãos com relação de genitor",
      fases: ["adulto", "adulto", "adulto"],
      relacoes: [
        { a: 0, b: 1, tipo: "genitor" },
        { a: 0, b: 2, tipo: "genitor" },
        { a: 1, b: 2, tipo: "genitor" },
      ],
      motivo: "parentesco_incompativel",
    },
    {
      nome: "casal de irmãos inferidos",
      fases: ["adulto", "adulto", "adulto"],
      relacoes: [
        { a: 0, b: 1, tipo: "genitor" },
        { a: 0, b: 2, tipo: "genitor" },
        { a: 1, b: 2, tipo: "casamento" },
      ],
      motivo: "parentes_com_casal",
    },
    {
      nome: "casal entre gerações indiretas",
      fases: ["adulto", "adulto", "adulto"],
      relacoes: [
        { a: 0, b: 1, tipo: "genitor" },
        { a: 1, b: 2, tipo: "genitor" },
        { a: 0, b: 2, tipo: "namoro" },
      ],
      motivo: "parentes_com_casal",
    },
    {
      nome: "dois casais do mesmo morador",
      fases: ["adulto", "adulto", "adulto"],
      relacoes: [
        { a: 0, b: 1, tipo: "namoro" },
        { a: 0, b: 2, tipo: "casamento" },
      ],
      motivo: "casal_repetido",
    },
  ];
  it.each(recusas)("recusa $nome", ({ fases, relacoes, motivo }) => {
    const dados = RascunhoDaFamiliaSchema.parse({ ...familia(fases), relacoes });
    expect(impedimentoDaFundacao(dados, 8)).toBe(motivo);
  });

  it("aplica o limite do mundo e impede empilhar o mesmo traço", () => {
    expect(impedimentoDaFundacao(familia(["adulto", "adulto"]), 1)).toBe("limite_de_moradores");
    const dados = familia();
    const primeira = dados.moradores[0];
    if (!primeira) throw new Error("Fixture sem morador");
    primeira.tracos = ["carinhoso", "carinhoso"];
    expect(impedimentoDaFundacao(dados, 8)).toBe("tracos_repetidos");
  });
});
