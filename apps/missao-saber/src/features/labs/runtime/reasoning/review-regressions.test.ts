import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ToolFamilyId, ToolLaunch, ToolState } from "../types";
import { budgetInitial, budgetTool, coinPrice, ledgerMetrics, parseBudget } from "./budget";
import { cardModel, cardSchema } from "./cards";
import { combinatoricsTool, countCases, countInitial } from "./combinatorics";
import { money, readNumber } from "./common";
import { ReasoningTool } from "./components";
import { dataInitial, dataMissingTotal, dataTool } from "./data";
import { enumeratedCases, parseEnumeration } from "./enumeration";
import { financeInitial, financeTool } from "./finance";
import { reasoningTools } from "./index";
import { logicTool, proofScene } from "./logic";
import { probabilityInitial, probabilityTool } from "./probability";

function launch(family: ToolFamilyId, mode: string, grade = 8, variant: 0 | 1 = 0): ToolLaunch {
  return { family, mode, grade, variant };
}
function render(context: ToolLaunch, hideResults = false, raw?: ToolState) {
  const module = reasoningTools.find((tool) => tool.family === context.family);
  if (!module) throw new Error("Família ausente no teste.");
  return renderToStaticMarkup(
    createElement(ReasoningTool, {
      launch: context,
      state: raw ?? module.activity(context).initialState,
      hideResults,
      onChange: () => {
        throw new Error("Renderizar não modifica a montagem.");
      },
    }),
  );
}

describe("unidades e casos de fronteira encontrados na revisão", () => {
  it("interpreta percentuais em probabilidades e não apaga sua escala", () => {
    const context = launch("L13", "favoraveis-e-possiveis");
    const state = probabilityInitial(context);
    for (const answer of ["2/5", "0,4", "40%"])
      expect(probabilityTool.assess(context, state, answer).correct).toBe(true);
    expect(probabilityTool.assess(context, state, "0,4%").correct).toBe(false);
    expect(probabilityTool.assess(context, state, "R$ 0,40").correct).toBe(false);
    expect(readNumber("1/2%", "ratio")).toBe(0.005);
  });
  it("mantém percentuais e reais nas unidades declaradas, recusando unidades incompatíveis", () => {
    const percent = launch("L14", "percentuais-em-dados");
    expect(dataTool.assess(percent, dataInitial(percent), "40%").correct).toBe(true);
    expect(dataTool.assess(percent, dataInitial(percent), "0,4%").correct).toBe(false);
    const coins = launch("L16", "moedas-preco-troco");
    expect(budgetTool.assess(coins, budgetInitial(coins), "R$ 1,25").correct).toBe(true);
    expect(budgetTool.assess(coins, budgetInitial(coins), "1,25%").correct).toBe(false);
    const count = launch("L12", "produto");
    expect(combinatoricsTool.assess(count, countInitial(count), "6%").correct).toBe(false);
    expect(combinatoricsTool.assess(count, countInitial(count), "R$ 6").correct).toBe(false);
  });
  it("aceita moeda brasileira formatada, com agrupamento e sinal, sem reinterpretar ponto decimal", () => {
    for (const cents of [0, 125, 123456, -100000, 123456789, -123456789])
      expect(readNumber(money(cents), "money")).toBe(cents / 100);
    expect(readNumber("1.234,56", "money")).toBe(1234.56);
    expect(readNumber("R$ -1.234,56", "money")).toBe(-1234.56);
    expect(readNumber("R$ 1.25", "money")).toBe(1.25);
    expect(readNumber("1.25", "money")).toBe(1.25);
    expect(readNumber("R$ 1.000,00 / 2", "money")).toBe(500);
    for (const answer of ["R$ 12.34,56", "R$ 1,234.56", "R$ 1.2345,67", "-R$ -1.000,00"])
      expect(readNumber(answer, "money")).toBeNull();
    expect(readNumber("R$ 1.234,56", "number")).toBeNull();
    expect(readNumber("1.234,56", "ratio")).toBeNull();
    expect(readNumber("R$ 1.234,56%", "money")).toBeNull();
    const context = launch("L16", "entradas-e-saidas");
    const state = parseBudget(context, budgetInitial(context));
    if (state.kind !== "budget") throw new Error("Esperado orçamento.");
    const metrics = ledgerMetrics(state);
    expect(budgetTool.assess(context, state, money(metrics.balanceCents)).correct).toBe(true);
  });
  it("distingue margem de zero e inexistência de imprevisto que caiba", () => {
    const context = launch("L16", "imprevistos-e-margem");
    const state = parseBudget(context, budgetInitial(context));
    if (state.kind !== "budget") throw new Error("Esperado orçamento.");
    const expenses = ledgerMetrics(state).expensesCents + state.contributionCents;
    const balanced = { ...state, incomeCents: expenses };
    const deficit = { ...state, incomeCents: expenses - 1 };
    expect(budgetTool.assess(context, balanced, "0").correct).toBe(true);
    expect(budgetTool.assess(context, balanced, "não existe").correct).toBe(false);
    expect(budgetTool.assess(context, deficit, "0").correct).toBe(false);
    expect(budgetTool.assess(context, deficit, "não existe").correct).toBe(true);
  });
  it("o recorte do gráfico preserva a reta que cruza o limite inferior", () => {
    const context = launch("L14", "graficos");
    const markup = render(context, false, {
      ...dataInitial(context),
      values: [0, 0, 10, 10, 0, 0],
      baseline: 5,
      chart: "line",
    });
    expect(markup).toContain('points="90,390 210,30 330,390"');
    expect(markup).toMatch(/<svg[^>]*><defs><clipPath/);
    expect(markup).toContain('clip-path="url(#');
    expect(markup).not.toContain('points="90,210 210,30 330,210"');
  });
  it("só mostra valores financeiros com os parâmetros publicados pelo modo", () => {
    const nominal = render(launch("L17", "entrada-e-parcelas"));
    expect(nominal).toContain("Total nominal:");
    expect(nominal).not.toContain("Valor presente:");
    expect(nominal).not.toContain("Hoje:");
    expect(render(launch("L17", "credito-garantias"))).not.toContain("Curvas financeiras");
    expect(render(launch("L17", "valor-presente-parcelas"))).not.toContain("Preço à vista:");
    expect(render(launch("L17", "comparar-objetivos"))).toContain("Líquido:");
  });
  it("a trajetória de um valor presente termina no valor futuro informado", () => {
    const context = launch("L17", "presente-futuro");
    const state = { ...financeInitial(context), principalCents: 12100, periods: 2, rateBps: 100 };
    const markup = render(context, false, state);
    // The top of the only curve is the given future payment, not that payment capitalized again.
    expect(markup).toContain('points="65,');
    expect(markup).toContain(',35"');
    expect(markup).not.toContain("Simples</th>");
    expect(financeTool.assess(context, state, String(121 / 1.01 ** 2)).correct).toBe(true);
  });
});

describe("transferência conserva dados e retira respostas prontas", () => {
  const cases: { family: ToolFamilyId; mode: string; result: string; given: string }[] = [
    { family: "L12", mode: "produto", result: "A lista completa tem", given: "primeira lista" },
    {
      family: "L12",
      mode: "mesa-redonda",
      result: "resultados válidos",
      given: "Pessoas disponíveis",
    },
    {
      family: "L12",
      mode: "relacoes-contagem-dupla",
      result: "<tfoot>",
      given: "Cada marca é uma participação",
    },
    { family: "L13", mode: "reposicao-e-ordem", result: "Modelo teórico:", given: "Fichas R" },
    { family: "L13", mode: "dados-condicional", result: "Modelo:", given: "Soma conhecida" },
    {
      family: "L13",
      mode: "cartas-eventos-condicionais",
      result: "Modelo:",
      given: "Copas e ouros",
    },
    { family: "L13", mode: "frequencia-relativa", result: "Frequência", given: "apareceu" },
    { family: "L14", mode: "totais-diferencas", result: "<tfoot>", given: "Livros emprestados" },
    { family: "L15", mode: "inducao", result: "Acrescentar: Base:", given: "1 + 2 + ... + n" },
    {
      family: "L15",
      mode: "processo-soma",
      result: "A soma total é preservada",
      given: "Aplicar uma operação",
    },
    {
      family: "L15",
      mode: "conectivos-basicos",
      result: ">Resultado</th>",
      given: "P é verdadeiro",
    },
    {
      family: "L16",
      mode: "preco-unitario",
      result: "Preço por kg:",
      given: "Preço de um pacote A",
    },
    { family: "L16", mode: "custo-por-uso", result: "por uso</p>", given: "Preço fixo do passe" },
    {
      family: "L16",
      mode: "entradas-e-saidas",
      result: "Saldo após reservas",
      given: "Renda mensal",
    },
    { family: "L17", mode: "juros-compostos", result: "Curvas financeiras", given: "Taxa por mês" },
    {
      family: "L17",
      mode: "fluxos-em-datas",
      result: "Valor presente líquido:",
      given: "Fluxos com sinais e datas",
    },
    {
      family: "L17",
      mode: "pesos-carteira",
      result: "Variação ponderada:",
      given: "Peso inicial do grupo A",
    },
  ];
  it.each(cases)("$mode retém a tarefa sem a resposta derivada", ({
    family,
    mode,
    result,
    given,
  }) => {
    const context = launch(family, mode);
    expect(render(context)).toContain(result);
    expect(render(context, true)).not.toContain(result);
    expect(render(context, true)).toContain(given);
  });
  it("a lacuna conserva o total dado mesmo sem totais calculados", () => {
    expect(render(launch("L14", "completar-valores"), true)).toContain("20 (objetivo)");
  });
});

describe("cartas e tabela de eliminação", () => {
  it("união conta cada carta uma vez e a informação altera o denominador", () => {
    const state = cardSchema.parse({ ranks: 5, event: "either", given: "all", selected: [] });
    const model = cardModel(state);
    expect(model.eligible).toHaveLength(20);
    expect(model.favorable).toHaveLength(14);
    expect(model.probability).toBe(0.7);
    const conditional = cardModel({ ...state, event: "both", given: "red" });
    expect(conditional.eligible).toHaveLength(10);
    expect(conditional.favorable).toHaveLength(4);
    expect(conditional.probability).toBe(0.4);
  });
  it("a correção verifica a construção de cartas além do número digitado", () => {
    const context = launch("L13", "cartas-eventos-condicionais");
    const state = cardSchema.parse({
      ranks: 5,
      event: "both",
      given: "red",
      selected: ["ouros-4", "copas-2", "ouros-2", "copas-4"],
    });
    expect(probabilityTool.assess(context, state, "40%").correct).toBe(true);
    expect(probabilityTool.assess(context, { ...state, selected: [] }, "40%").correct).toBe(false);
    expect(
      probabilityTool.assess(
        context,
        { ...state, selected: ["ouros-4", "copas-2", "paus-2", "copas-4"] },
        "40%",
      ).correct,
    ).toBe(false);
    expect(() => probabilityTool.parse(context, { ...state, selected: ["copas-6"] })).toThrow();
    expect(() =>
      probabilityTool.parse(context, { ...state, selected: ["copas-2", "copas-2"] }),
    ).toThrow();
  });
  it("não aceita riscar uma associação válida mesmo com a resposta certa", () => {
    const context = launch("L15", "associacoes-por-pistas");
    const pets = ["cão", "peixe", "gato"];
    expect(
      logicTool.assess(context, { pets, eliminated: [0, 2, 3, 4, 7, 8] }, "Caio").correct,
    ).toBe(true);
    expect(logicTool.assess(context, { pets, eliminated: [6] }, "Caio").correct).toBe(false);
    const variant = launch("L15", "associacoes-por-pistas", 8, 1);
    expect(
      logicTool.assess(
        variant,
        { pets: ["peixe", "cão", "gato"], eliminated: [0, 1, 3, 5, 7, 8] },
        "Fábio",
      ).correct,
    ).toBe(true);
  });
});

describe("construções exigidas pela atividade de contagem", () => {
  it.each([
    "subconjuntos",
    "anagramas-com-repeticao",
  ])("%s exige todos os casos marcados e aceita qualquer ordem", (mode) => {
    for (const variant of [0, 1] as const) {
      const context = launch("L12", mode, 8, variant);
      const state = parseEnumeration(context, combinatoricsTool.activity(context).initialState);
      const selected = enumeratedCases(state).reverse();
      const answer = String(selected.length);
      expect(combinatoricsTool.assess(context, state, answer).correct).toBe(false);
      expect(
        combinatoricsTool.assess(context, { ...state, selected: selected.slice(1) }, answer)
          .correct,
      ).toBe(false);
      expect(combinatoricsTool.assess(context, { ...state, selected }, answer).correct).toBe(true);
    }
  });
  it("permutações explica filas sem exibir condições de senhas", () => {
    const markup = render(launch("L12", "permutacoes"));
    expect(markup).toContain("Todos os objetos participam uma única vez");
    expect(markup).not.toContain("Senhas admitem zero");
  });
  it.each([
    "arvore-de-escolhas",
    "combinacoes-visuais",
    "listar-sem-repetir",
    "restricoes-e-exaustao",
    "multiplas-restricoes",
  ])("%s exige a enumeração completa, em qualquer ordem", (mode) => {
    const context = launch("L12", mode);
    const state = countInitial(context);
    const selected = countCases(context, state)
      .filter((item) => item.allowed)
      .map((item) => item.id)
      .reverse();
    const answer = String(selected.length);
    expect(combinatoricsTool.assess(context, state, answer).correct).toBe(false);
    expect(combinatoricsTool.assess(context, { ...state, selected }, answer).correct).toBe(true);
    expect(
      combinatoricsTool.assess(context, { ...state, selected: selected.slice(1) }, answer).correct,
    ).toBe(false);
  });
  it.each(["gavetas", "pior-caso"])("%s aceita diferentes distribuições ótimas", (mode) => {
    const context = launch("L12", mode);
    for (const positions of [
      [0, 0, 0, 1, 1, 2, 2],
      [0, 0, 0, 1, 1, 1, 2],
    ])
      expect(
        combinatoricsTool.assess(context, { kind: "drawers", boxes: 3, positions }, "3").correct,
      ).toBe(true);
    expect(combinatoricsTool.assess(context, countInitial(context), "3").correct).toBe(false);
  });
});

describe("faixa escolar e indução", () => {
  it("revisar uma prova preserva seus passos como dados e oculta a identificação do erro", () => {
    for (const variant of [0, 1] as const) {
      const context = launch("L15", "revisar-prova", 12, variant);
      const markup = render(context, true);
      expect(markup).toContain("Suposta prova a revisar");
      expect(markup).toContain(`a = b = ${1 + variant}`);
      expect(markup).toContain("Dividindo os dois lados por a − b, obtemos a + b = b.");
      expect(markup).not.toContain("Passo inválido");
      expect(markup).not.toContain("divisão por zero");
      expect(render(context)).toContain("Passo inválido");
      expect(
        logicTool.assess(context, logicTool.activity(context).initialState, "a − b = 0").correct,
      ).toBeNull();
    }
  });
  it("contagem inicial usa nomes concretos e conjuntos menores", () => {
    const context = launch("L12", "combinacoes-visuais", 2, 1);
    const state = countInitial(context);
    expect(countCases(context, state)).toHaveLength(9);
    expect(countCases(context, state)[0]?.label).toBe("Camiseta 1 + boné 1");
    expect(render(context)).toContain('max="3"');
  });
  it("a tabela inicial admite contagem visível e a lacuna mantém seu total", () => {
    const context = launch("L14", "completar-valores", 3);
    expect(dataMissingTotal(context)).toBe(7);
    const state = { ...dataInitial(context), values: [3, 4, 2, 5, 4, 2] };
    expect(dataTool.assess(context, state, "4").correct).toBe(true);
    const markup = render(context, false, state);
    expect(markup).toContain("● ● ●");
    expect(markup).not.toContain("Ver linhas ao longo dos dias");
    expect(markup).toContain('max="10"');
  });
  it("troco inicial usa preços menores sem exigir uma montagem única", () => {
    const context = launch("L16", "moedas-preco-troco", 2);
    expect(coinPrice(context)).toBe(150);
    expect(
      budgetTool.assess(context, { kind: "coins", counts: [0, 0, 4, 0, 0] }, "0,50").correct,
    ).toBe(true);
    expect(
      budgetTool.assess(context, { kind: "coins", counts: [0, 0, 0, 0, 1] }, "0,50").correct,
    ).toBe(true);
  });
  it("a variante de desigualdade declara domínio e sinal sem certificar texto livre", () => {
    const context = launch("L15", "inducao-somas-desigualdades", 12, 1);
    const scene = proofScene(context);
    expect(scene.claim).toContain("2ⁿ ≥ n + 1");
    expect(scene.cards.join(" ")).toContain("que é positivo");
    expect(scene.cards.join(" ")).toContain("n ≥ 0");
    expect(
      logicTool.assess(context, logicTool.activity(context).initialState, "Testei doze casos")
        .correct,
    ).toBeNull();
  });
});
