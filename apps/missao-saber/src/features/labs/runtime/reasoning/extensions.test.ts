import { describe, expect, it } from "vitest";
import type { ToolLaunch } from "../types";
import { budgetTool } from "./budget";
import { combinatoricsTool } from "./combinatorics";
import { roundedAssessment } from "./common";
import { consumerMetrics, consumerSchema } from "./consumer";
import { diceMetrics, diceSchema } from "./dice";
import { enumeratedCases, enumerationSchema } from "./enumeration";
import { logicTool } from "./logic";
import { probabilityInitial, probabilityTool } from "./probability";
import { processValues } from "./processes";

const launch = (mode: string, variant: 0 | 1 = 0): ToolLaunch => ({
  family: "L15",
  mode,
  variant,
  grade: 8,
});

describe("processos executam somente operações válidas", () => {
  it("soma e diferença absoluta preservam propriedades diferentes", () => {
    const actions = [
      { first: 0, second: 1 },
      { first: 0, second: 1 },
      { first: 0, second: 1 },
    ];
    expect(processValues(launch("processo-soma"), actions).values).toEqual([10]);
    expect(processValues(launch("processo-diferenca-absoluta"), actions).values).toEqual([0]);
    expect(
      processValues(launch("processo-diferenca-absoluta"), actions).history.map(
        (values) => values.reduce((sum, value) => sum + value, 0) % 2,
      ),
    ).toEqual([0, 0, 0, 0]);
  });
  it("retirar de duas pilhas conserva diferença e não permite retirar de pilha vazia", () => {
    const actions = Array.from({ length: 4 }, () => ({ first: 0, second: 1 }));
    expect(processValues(launch("processo-diferenca"), actions).values).toEqual([3, 0]);
    expect(() =>
      processValues(launch("processo-diferenca"), [...actions, { first: 0, second: 1 }]),
    ).toThrow();
  });
  it("copos são virados dois a dois e bolas seguem a tabela de cores", () => {
    expect(processValues(launch("processo-copos"), [{ first: 0, second: 1 }]).values).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    expect(processValues(launch("processo-bolas"), [{ first: 0, second: 1 }]).values).toEqual([
      1, 1, 1, 1,
    ]);
    expect(() => processValues(launch("processo-copos"), [{ first: 0, second: 0 }])).toThrow();
  });
  it("camaleões preservam o total e a diferença módulo 3", () => {
    const initial = launch("processo-camaleoes", 1);
    expect(
      processValues(initial, [
        { first: 0, second: 1 },
        { first: 0, second: 1 },
      ]).values,
    ).toEqual([0, 0, 9]);
    expect(
      logicTool.assess(initial, { actions: [], selected: [] }, "Testei um caso").correct,
    ).toBeNull();
  });
});

describe("conceitos adicionais têm cálculos próprios", () => {
  it("arredondamento em meio centavo não aceita também o centavo vizinho", () => {
    expect(roundedAssessment("0,13", 0.125, "Custo por uso", "Arredonde ao centavo.").correct).toBe(
      true,
    );
    expect(roundedAssessment("0,12", 0.125, "Custo por uso", "Arredonde ao centavo.").correct).toBe(
      false,
    );
    expect(
      roundedAssessment("1/8", 0.125, "Custo por uso", "Pode conservar o valor exato.").correct,
    ).toBe(true);
    expect(roundedAssessment("-0,13", -0.125, "Variação", "Arredonde ao centavo.").correct).toBe(
      true,
    );
  });
  it("dados condicionais usam apenas cinco pares cuja soma é 8", () => {
    const state = diceSchema.parse({ faces: 6, sum: 8, face: 4, trials: 36, seed: 1 });
    const context: ToolLaunch = { family: "L13", mode: "dados-condicional", variant: 0, grade: 12 };
    const metrics = diceMetrics(context, state);
    expect(metrics.favorable).toBe(1);
    expect(metrics.total).toBe(5);
    expect(probabilityTool.assess(context, state, "1/5").correct).toBe(true);
    expect(diceMetrics({ ...context, mode: "dados-somas" }, { ...state, sum: 7 }).theoretical).toBe(
      1 / 6,
    );
  });
  it("urna representa probabilidade impossível e certa sem denominador zero", () => {
    const context: ToolLaunch = {
      family: "L13",
      mode: "favoraveis-e-possiveis",
      variant: 0,
      grade: 6,
    };
    const state = probabilityInitial(context);
    expect(probabilityTool.assess(context, { ...state, red: 0, blue: 5 }, "0").correct).toBe(true);
    expect(probabilityTool.assess(context, { ...state, red: 5, blue: 0 }, "1").correct).toBe(true);
    expect(() => probabilityTool.parse(context, { ...state, red: 0, blue: 0 })).toThrow();
  });
  it("BANANA tem 60 anagramas, quatro elementos têm 16 subconjuntos", () => {
    expect(
      enumeratedCases(enumerationSchema.parse({ kind: "word", word: "BANANA", selected: [] }))
        .length,
    ).toBe(60);
    expect(
      enumeratedCases(enumerationSchema.parse({ kind: "subsets", count: 4, selected: [] })).length,
    ).toBe(16);
  });
  it("rotações, adjacência e fila sem restrição são contagens diferentes", () => {
    const state = enumerationSchema.parse({ kind: "seating", count: 4 });
    expect(enumeratedCases(state, "mesa-redonda").length).toBe(6);
    expect(enumeratedCases(state, "filas-com-bloco").length).toBe(12);
    expect(enumeratedCases(state, "permutacoes").length).toBe(24);
  });
  it("número não começa com zero, senha pode; todas as restrições são aplicadas", () => {
    const state = enumerationSchema.parse({
      kind: "digits",
      count: 4,
      width: 2,
      repeat: false,
      firstOdd: false,
      lastEven: false,
      required: -1,
      sum: -1,
    });
    expect(enumeratedCases(state, "algarismos-e-restricoes").length).toBe(9);
    expect(enumeratedCases(state, "senhas-e-restricoes").length).toBe(12);
  });
  it("garantir quatro na mesma caixa exige três por caixa e mais uma", () => {
    const context: ToolLaunch = { family: "L12", mode: "cota-nas-gavetas", variant: 0, grade: 7 };
    expect(
      combinatoricsTool.assess(context, { kind: "quota", boxes: 3, quota: 4, extra: true }, "10")
        .correct,
    ).toBe(true);
    expect(
      combinatoricsTool.assess(context, { kind: "quota", boxes: 3, quota: 4, extra: true }, "4")
        .correct,
    ).toBe(false);
  });
  it("leve quatro pague três usa quatro no denominador; custo de uso muda com frequência", () => {
    const context: ToolLaunch = { family: "L16", mode: "leve-pague", variant: 0, grade: 7 };
    const state = consumerSchema.parse(budgetTool.activity(context).initialState);
    expect(consumerMetrics(state).promotionTotal).toBe(1800);
    expect(budgetTool.assess(context, state, "4,50").correct).toBe(true);
    expect(consumerMetrics({ ...state, fixedCents: 7200, uses: 12 }).perUse).toBe(600);
    expect(consumerMetrics({ ...state, fixedCents: 7200, uses: 6 }).perUse).toBe(1200);
  });
  it("associação de animais não se confunde com uma pista de ordem", () => {
    const context = launch("associacoes-por-pistas");
    expect(
      logicTool.assess(context, { pets: ["cão", "peixe", "gato"], eliminated: [] }, "Caio").correct,
    ).toBe(true);
    expect(
      logicTool.assess(context, { pets: ["gato", "peixe", "cão"], eliminated: [] }, "Ana").correct,
    ).toBe(false);
    expect(
      logicTool.assess(launch("contraexemplos-primos"), { kind: "counterexample", value: 9 }, "9")
        .correct,
    ).toBe(true);
    expect(
      logicTool.assess(
        launch("contraexemplos-primos", 1),
        { kind: "counterexample", value: 2 },
        "2",
      ).correct,
    ).toBe(true);
  });
});
