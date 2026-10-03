import { describe, expect, it } from "vitest";
import type { ToolFamilyId, ToolLaunch } from "../types";
import {
  budgetInitial,
  budgetTool,
  coinTotal,
  ledgerMetrics,
  offerMetrics,
  parseBudget,
} from "./budget";
import {
  adaptLegacyGroups,
  combinatoricsTool,
  countCases,
  countExpected,
  countInitial,
  parseCount,
} from "./combinatorics";
import { readNumber } from "./common";
import { dataInitial, dataMetrics, dataTool, parseData } from "./data";
import {
  compoundCents,
  contributionBalance,
  financeInitial,
  financeTool,
  financialMetrics,
  parseFinance,
  presentValue,
  simpleCents,
} from "./finance";
import { reasoningTools } from "./index";
import {
  allOrders,
  counterexample,
  logicInitial,
  logicTool,
  orderValid,
  parseLogic,
  truthValue,
} from "./logic";
import {
  probabilityInitial,
  probabilityModel,
  probabilityTool,
  simulateProbability,
} from "./probability";

const launch = (family: ToolFamilyId, mode: string, variant: 0 | 1 = 0): ToolLaunch => ({
  family,
  mode,
  grade: 8,
  variant,
});

describe("contratos das seis famílias de raciocínio", () => {
  for (const tool of reasoningTools)
    for (const mode of tool.modes)
      for (const variant of [0, 1] satisfies (0 | 1)[]) {
        it(`${tool.family}.${mode}: variante ${variant} é serializável e estritamente validada`, () => {
          const context = launch(tool.family, mode, variant);
          const scenario = tool.activity(context);
          expect(tool.parse(context, JSON.parse(JSON.stringify(scenario.initialState)))).toEqual(
            scenario.initialState,
          );
          expect(tool.summarize(context, scenario.initialState).length).toBeGreaterThan(20);
          expect(() =>
            tool.parse(context, { ...scenario.initialState, unrecognized: 42 }),
          ).toThrow();
          expect(tool.assess(context, scenario.initialState, "ainda não sei").correct).not.toBe(
            true,
          );
        });
      }
  it("recusa modo desconhecido e aceita fração, vírgula e decimal sem unidade", () => {
    expect(() => combinatoricsTool.activity(launch("L12", "nao-publicado"))).toThrow();
    expect(readNumber("1/2")).toBe(0.5);
    expect(readNumber("0,5")).toBe(0.5);
    expect(readNumber(".5")).toBe(0.5);
    expect(readNumber("1/0")).toBeNull();
    expect(readNumber("1/2/3")).toBeNull();
    expect(readNumber("Infinity")).toBeNull();
    expect(readNumber("1e9")).toBeNull();
  });
});

describe("enumeração, repetições e garantias", () => {
  it.each([
    ["produto", 6],
    ["soma-ou-produto", 5],
    ["casos-e-complementar", 4],
    ["restricoes-e-exaustao", 4],
    ["escolhas-sem-ordem", 6],
    ["arranjo-combinacao", 12],
    ["filas-anagramas", 3],
    ["contagem-dupla", 6],
    ["complementar-inclusao-exclusao", 8],
    ["repeticoes-distribuicoes", 15],
    ["restricoes-caminhos-e-distribuicoes", 3],
  ])("%s conta resultados matematicamente distintos", (mode, expected) => {
    const context = launch("L12", mode);
    expect(countExpected(context, countInitial(context))).toBe(expected);
  });
  it("a transferência usa outra restrição de passos e aceita todas as rotas válidas", () => {
    const context = launch("L12", "restricoes-caminhos-e-distribuicoes", 1);
    const cases = countCases(context, countInitial(context)).filter((item) => item.allowed);
    expect(cases.map((item) => item.label).sort()).toEqual(["CDDD", "DCDD", "DDCD", "DDDC"]);
  });
  it("distingue repetição possível de repetição garantida", () => {
    const context = launch("L12", "possivel-ou-garantido");
    const state = { kind: "drawers", boxes: 3, positions: [0, 0] };
    expect(combinatoricsTool.assess(context, state, "2").correct).toBe(false);
    expect(combinatoricsTool.assess(context, state, "4").correct).toBe(true);
    const worst = launch("L12", "pior-caso");
    expect(
      combinatoricsTool.assess(
        worst,
        { kind: "drawers", boxes: 3, positions: [0, 0, 0, 0, 0, 0, 0] },
        "3",
      ).correct,
    ).toBe(false);
  });
  it("uma lista incompleta ou proibida não se torna correta só pelo total digitado", () => {
    const context = launch("L12", "casos-e-complementar");
    expect(
      combinatoricsTool.assess(context, { ...countInitial(context), selected: ["1,1"] }, "4")
        .correct,
    ).toBe(false);
    expect(() => parseCount(context, { ...countInitial(context), selected: ["99,99"] })).toThrow();
    expect(() =>
      parseCount(context, { ...countInitial(context), selected: ["1,2", "1,2"] }),
    ).toThrow();
  });
  it("preserva ocupação de grupos legado e impede fichas em caixas inexistentes", () => {
    expect(
      adaptLegacyGroups({
        kind: "groups",
        groups: 3,
        tokens: [
          { id: 4, box: 2 },
          { id: 10, box: 0 },
        ],
        previsao: "antes",
        observacao: "depois",
      }),
    ).toEqual({ kind: "drawers", boxes: 3, positions: [2, 0] });
    expect(() =>
      adaptLegacyGroups({ kind: "groups", groups: 2, tokens: [{ id: 1, box: 2 }] }),
    ).toThrow();
    expect(() =>
      parseCount(launch("L12", "pior-caso"), { kind: "drawers", boxes: 2, positions: [2] }),
    ).toThrow();
  });
});

describe("probabilidade teórica e amostras", () => {
  it("conta fichas físicas equiprováveis, não apenas cores", () => {
    const context = launch("L13", "favoraveis-e-possiveis");
    expect(probabilityModel(context, probabilityInitial(context))).toEqual({
      favorable: 2,
      total: 5,
      probability: 0.4,
    });
    expect(probabilityTool.assess(context, probabilityInitial(context), "2/5").correct).toBe(true);
  });
  it("reposição muda a segunda retirada", () => {
    const context = launch("L13", "reposicao-e-ordem");
    const state = probabilityInitial(context);
    expect(probabilityModel(context, state).probability).toBe(4 / 25);
    expect(probabilityModel(context, { ...state, replacement: false }).probability).toBe(1 / 10);
  });
  it("a condição altera o denominador e não vira uma interseção", () => {
    const context = launch("L13", "condicional-arvore-tabela");
    const state = { ...probabilityInitial(context), replacement: false };
    expect(probabilityModel(context, state)).toEqual({ favorable: 6, total: 12, probability: 0.5 });
    expect(probabilityTool.assess(context, state, "1/2").correct).toBe(true);
    expect(probabilityTool.assess(context, state, "6/20").correct).toBe(false);
  });
  it("calcula união, complementar e ganhos líquidos", () => {
    const union = launch("L13", "uniao-complemento-independencia");
    expect(probabilityModel(union, probabilityInitial(union)).probability).toBe(16 / 25);
    const gain = launch("L13", "valor-esperado-e-risco");
    expect(probabilityTool.assess(gain, probabilityInitial(gain), "0,60").correct).toBe(true);
  });
  it("a simulação é reprodutível e não exige que frequência coincida com teoria", () => {
    const context = launch("L13", "frequencia-e-teoria");
    const state = { ...probabilityInitial(context), trials: 10 };
    expect(simulateProbability(context, state)).toEqual(simulateProbability(context, state));
    expect(simulateProbability(context, state).eligible).toBe(10);
    expect(probabilityTool.assess(context, state, "0,4").correct).toBe(true);
    expect(() => probabilityTool.parse(context, { ...state, trials: 1001 })).toThrow();
  });
});

describe("tabelas com base, eixo e valores coerentes", () => {
  it("diferença de totais e percentual usam o denominador certo", () => {
    const difference = launch("L14", "totais-diferencas");
    expect(dataMetrics(difference, dataInitial(difference)).expected).toBe(3);
    const percent = launch("L14", "percentuais-em-dados");
    expect(dataTool.assess(percent, dataInitial(percent), "40").correct).toBe(true);
    expect(() =>
      parseData(percent, { ...dataInitial(percent), values: [0, 0, 6, 9, 14, 10] }),
    ).toThrow();
  });
  it("a lacuna precisa ser construída e o recorte do gráfico não muda os dados", () => {
    const missing = launch("L14", "completar-valores");
    expect(dataTool.assess(missing, dataInitial(missing), "12").correct).toBe(false);
    expect(
      dataTool.assess(missing, { ...dataInitial(missing), values: [8, 12, 6, 9, 14, 10] }, "12")
        .correct,
    ).toBe(true);
    const chart = launch("L14", "graficos");
    expect(dataMetrics(chart, { ...dataInitial(chart), baseline: 5 }).expected).toBe(4);
  });
});

describe("lógica, contraexemplos e limites de prova", () => {
  it("as pistas determinam filas diferentes nas duas variantes", () => {
    expect(
      allOrders.filter((order) => orderValid(launch("L15", "pistas-com-desenho"), order)),
    ).toEqual([["Gato", "Panda", "Raposa"]]);
    expect(
      allOrders.filter((order) => orderValid(launch("L15", "pistas-com-desenho", 1), order)),
    ).toEqual([["Panda", "Raposa", "Gato"]]);
  });
  it("a afirmação do consequente tem contraexemplo, a contrapositiva é equivalente", () => {
    expect(truthValue(launch("L15", "validade-falacias"), false, true, false)).toBe(false);
    for (const p of [false, true])
      for (const q of [false, true])
        expect(truthValue(launch("L15", "implicacao-reciproca-contrapositiva"), p, q, false)).toBe(
          true,
        );
    expect(truthValue(launch("L15", "verdade-mentira"), true, false, false)).toBe(true);
    expect(truthValue(launch("L15", "verdade-mentira"), false, true, false)).toBe(false);
  });
  it("aceita mais de um contraexemplo correto, mas não um caso favorável", () => {
    const context = launch("L15", "contraexemplos");
    expect(logicTool.assess(context, { kind: "counterexample", value: 0 }, "0").correct).toBe(true);
    expect(logicTool.assess(context, { kind: "counterexample", value: 1 }, "1").correct).toBe(true);
    expect(logicTool.assess(context, { kind: "counterexample", value: 2 }, "2").correct).toBe(
      false,
    );
    expect(counterexample(launch("L15", "conjectura-ou-teorema"), 40).valid).toBe(true);
    expect(counterexample(launch("L15", "conjectura-ou-teorema", 1), 41).valid).toBe(true);
  });
  it("não concede validade automática a provas abertas, nem a peças duplicadas", () => {
    const context = launch("L15", "inducao");
    expect(logicTool.assess(context, logicInitial(context), "Testei 12 casos.").correct).toBeNull();
    expect(() => parseLogic(context, { kind: "proof", steps: [0, 0], example: 3 })).toThrow();
  });
});

describe("preços, centavos, pacotes e orçamento", () => {
  it("custo unitário não se confunde com pacote, frete nem quantidade útil", () => {
    expect(
      offerMetrics({ priceCents: 1200, amount: 750, freightCents: 400, lossPercent: 10 }, 1600, 3),
    ).toEqual({
      unitCentsPerKg: 1600,
      usefulPerPack: 675,
      minimumPacks: 3,
      minimumTotalCents: 4000,
      chosenUseful: 2025,
      chosenTotalCents: 4000,
      surplus: 425,
    });
    const context = launch("L16", "preco-unitario");
    expect(budgetTool.assess(context, budgetInitial(context), "16").correct).toBe(true);
    expect(budgetTool.assess(context, budgetInitial(context), "12").correct).toBe(false);
  });
  it("compra insuficiente é recusada mesmo com total correto digitado", () => {
    const context = launch("L16", "pacotes-sobras-e-total");
    expect(budgetTool.assess(context, budgetInitial(context), "40").correct).toBe(false);
    expect(budgetTool.assess(context, { ...budgetInitial(context), packsA: 3 }, "40").correct).toBe(
      true,
    );
  });
  it("converte períodos e arredonda contribuição para cima ao centavo", () => {
    const context = launch("L16", "meta-prazo-contribuicao");
    const state = parseBudget(context, budgetInitial(context));
    if (state.kind !== "budget") throw new Error("O roteiro exige orçamento.");
    expect(ledgerMetrics(state).balanceCents).toBe(12500);
    expect(
      ledgerMetrics({ ...state, goalCents: 100, alreadySavedCents: 0, months: 3 })
        .contributionNeededCents,
    ).toBe(34);
    expect(budgetTool.assess(context, state, "125").correct).toBe(true);
  });
  it("troco aceita diferentes montagens de moedas", () => {
    const context = launch("L16", "moedas-preco-troco");
    expect(coinTotal({ kind: "coins", counts: [0, 0, 0, 1, 2] })).toBe(500);
    expect(
      budgetTool.assess(context, { kind: "coins", counts: [0, 0, 10, 0, 0] }, "1,25").correct,
    ).toBe(true);
    expect(
      budgetTool.assess(context, { kind: "coins", counts: [0, 0, 0, 0, 0] }, "0").correct,
    ).toBe(false);
  });
});

describe("dinheiro em datas e cenários explícitos", () => {
  it("juros simples e compostos têm bases diferentes", () => {
    expect(simpleCents(10000, 1000, 2)).toBe(12000);
    expect(compoundCents(10000, 1000, 2)).toBeCloseTo(12100, 8);
  });
  it("aportes no início rendem um mês a mais, inclusive quando a taxa é zero", () => {
    const settings = { principalCents: 10000, rateBps: 1000, contributionCents: 1000 };
    expect(contributionBalance({ ...settings, timing: "end" }, 2)).toBeCloseTo(14200, 8);
    expect(contributionBalance({ ...settings, timing: "beginning" }, 2)).toBeCloseTo(14410, 8);
    expect(contributionBalance({ ...settings, rateBps: 0, timing: "beginning" }, 2)).toBe(12000);
  });
  it("fluxos são trazidos à mesma data e mantêm sinais", () => {
    expect(
      presentValue(
        [
          { month: 0, cents: -10000 },
          { month: 1, cents: 11000 },
        ],
        1000,
      ),
    ).toBeCloseTo(0, 8);
    expect(
      presentValue(
        [
          { month: 0, cents: 1000 },
          { month: 1, cents: 1100 },
          { month: 2, cents: 1210 },
        ],
        1000,
      ),
    ).toBeCloseTo(3000, 8);
  });
  it("retorno real usa divisão de fatores; perda e alta iguais não se anulam", () => {
    const state = financeInitial(launch("L17", "nominal-real"));
    const metrics = financialMetrics({
      ...state,
      rateBps: 1000,
      inflationBps: 500,
      periods: 1,
      returnABps: -5000,
      returnBBps: 5000,
    });
    expect(metrics.realPercent).toBeCloseTo(4.7619047619, 8);
    expect(metrics.sequentialPercent).toBe(-25);
    expect(metrics.sequentialFuture).toBe(75000);
  });
  it("pesos, tributação positiva e limite de disponibilidade são explícitos", () => {
    const state = financeInitial(launch("L17", "pesos-carteira"));
    expect(
      financialMetrics({ ...state, portfolioA: 60, returnABps: 1000, returnBBps: -500 })
        .weightedPercent,
    ).toBeCloseTo(4, 8);
    expect(financialMetrics({ ...state, rateBps: -100, periods: 1, feeCents: 500 }).tax).toBe(0);
    expect(financialMetrics({ ...state, liquidityMonths: 4, deadlineMonths: 4 }).liquidInTime).toBe(
      true,
    );
    expect(financialMetrics({ ...state, liquidityMonths: 5, deadlineMonths: 4 }).liquidInTime).toBe(
      false,
    );
  });
  it("ponto de equilíbrio respeita unidades inteiras e inexistência", () => {
    const context = launch("L17", "ponto-equilibrio");
    const state = financeInitial(context);
    expect(
      financialMetrics({ ...state, fixedCostCents: 1001, priceCents: 1000, variableCostCents: 700 })
        .breakEven,
    ).toBe(4);
    expect(
      financeTool.assess(
        context,
        { ...state, priceCents: 1500, variableCostCents: 1500 },
        "não existe",
      ).correct,
    ).toBe(true);
  });
  it("preço final é comparado ao preço inicial, sem pesos de carteira", () => {
    const context = launch("L17", "preco-retorno");
    expect(
      financeTool.assess(
        context,
        { ...financeInitial(context), principalCents: 20000, priceCents: 25000 },
        "25",
      ).correct,
    ).toBe(true);
    expect(() =>
      parseFinance(context, { ...financeInitial(context), principalCents: 0 }),
    ).toThrow();
  });
  it("recusa fluxo sem identidade, repetido e taxa que anula o fator", () => {
    const context = launch("L17", "fluxos-em-datas");
    const state = financeInitial(context);
    expect(() => parseFinance(context, { ...state, rateBps: -10000 })).toThrow();
    expect(() => parseFinance(context, { ...state, flows: [{ month: 1, cents: 100 }] })).toThrow();
    expect(() =>
      parseFinance(context, {
        ...state,
        flows: [
          { id: 1, month: 1, cents: 100 },
          { id: 1, month: 2, cents: 100 },
        ],
      }),
    ).toThrow();
  });
});
