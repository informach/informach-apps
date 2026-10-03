import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ToolFamilyId, ToolLaunch, ToolModule } from "../types";
import { AlgebraTool } from "./components";
import { equationsTool, parseEquation } from "./equations";
import { functionPoint, functionsTool, graphSegments, parseFunction } from "./functions";
import { algebraTools } from "./index";
import {
  affineCoefficients,
  evaluateExpression,
  exactAnswer,
  expressionPoint,
  modularPower,
  numericAnswer,
  parseExpression,
  primeFactors,
  quadraticRoots,
  readFraction,
  systemSolution,
  triangleFromSides,
} from "./math";
import { numbersTool, parseNumber, simultaneousRemainder } from "./numbers";
import { parseSequence, sequenceSum, sequencesTool, sequenceTerm } from "./sequences";
import { parseTriangle, triangleMeasures, trianglesTool } from "./triangles";

function launch(family: ToolFamilyId, mode: string, variant: 0 | 1 = 0, grade = 10): ToolLaunch {
  return { family, mode, variant, grade };
}
function assess(tool: ToolModule, mode: string, answer: string, changes = {}, variant: 0 | 1 = 0) {
  const setup = launch(tool.family, mode, variant);
  return tool.assess(setup, { ...tool.activity(setup).initialState, ...changes }, answer);
}

describe("contract and curriculum coverage", () => {
  it("supports every promised mode in these five families", () => {
    const catalogSchema = z.object({ skills: z.array(z.object({ modes: z.array(z.string()) })) });
    const catalog = catalogSchema.parse(
      JSON.parse(
        readFileSync(
          resolve(
            process.cwd(),
            "../../docs/propostas/missao-saber-laboratorio-2026-10-03/catalogo-proposto.json",
          ),
          "utf8",
        ),
      ),
    );
    const expected = new Set(
      catalog.skills
        .flatMap((skill) => skill.modes.flatMap((mode) => mode.split("+")))
        .filter((mode) => /^(L08|L09|L10|L11|L18)\./.test(mode)),
    );
    const actual = new Set(
      algebraTools.flatMap((tool) => tool.modes.map((mode) => `${tool.family}.${mode}`)),
    );
    expect([...expected].filter((mode) => !actual.has(mode))).toEqual([]);
    expect(actual.size).toBe(algebraTools.reduce((total, tool) => total + tool.modes.length, 0));
  });
  for (const tool of algebraTools)
    for (const mode of tool.modes)
      for (const variant of [0, 1] satisfies (0 | 1)[]) {
        it(`${tool.family}.${mode} variant ${variant} has valid state, response and accessible interactive rendering`, () => {
          const setup = launch(tool.family, mode, variant);
          const activity = tool.activity(setup);
          expect(tool.parse(setup, activity.initialState)).toEqual(activity.initialState);
          expect(tool.summarize(setup, activity.initialState).length).toBeGreaterThan(15);
          expect(activity.prompt.length).toBeGreaterThan(60);
          expect(activity.rubric.length).toBeGreaterThanOrEqual(3);
          expect(activity.initialState).not.toEqual(
            tool.activity({ ...setup, variant: variant === 0 ? 1 : 0 }).initialState,
          );
          expect(tool.assess(setup, activity.initialState, "999999999").correct).toBe(false);
          const html = renderToStaticMarkup(
            createElement(AlgebraTool, {
              launch: setup,
              state: activity.initialState,
              onChange: () => {},
            }),
          );
          expect(html).toMatch(/<fieldset[^>]*>[\s\S]*<legend[^>]*>[^<]+<\/legend>/);
          expect(html).toMatch(/<label[^>]*>/);
          expect(html).toMatch(/<input[^>]*type="range"|<select|<button/);
          const summaryText = renderToStaticMarkup(
            createElement("span", null, tool.summarize(setup, activity.initialState)),
          ).slice(6, -7);
          expect(html).toContain(summaryText);
          expect(html).not.toMatch(/<title[^>]*>\s*<\/title>/);
          expect(html).not.toMatch(/NaN|Infinity|undefined/);
          expect(() => tool.parse(setup, { ...activity.initialState, forged: true })).toThrow();
        });
      }
  it("rejects mismatched tool, mode and unbounded data", () => {
    expect(() => equationsTool.activity(launch("L10", "comparar-pratos"))).toThrow();
    expect(() => functionsTool.activity(launch("L11", "inventado"))).toThrow();
    const setup = launch("L09", "recorrencia");
    expect(() =>
      parseSequence(setup, { ...sequencesTool.activity(setup).initialState, position: 1000000 }),
    ).toThrow();
  });
});

describe("mathematical input and safe expression grammar", () => {
  it("accepts equivalent exact fractions and decimal comma without demanding a unit", () => {
    for (const value of ["1/2", "2/4", "0,5", ".5", "0.500", "-1/-2"])
      expect(exactAnswer(value, 1, 2)).toBe(true);
    expect(exactAnswer("0,333333333333", 1, 3)).toBe(false);
    expect(exactAnswer("1/3", 1, 3)).toBe(true);
    for (const value of ["1/0", "NaN", "1e2", "0.5m", "1/2/3", "Infinity"])
      expect(readFraction(value)).toBeNull();
    expect(numericAnswer("1,414", Math.sqrt(2), 0.001)).toBe(true);
    expect(numericAnswer("1,41", Math.sqrt(2), 0.001)).toBe(false);
  });
  it("respects mathematical precedence, domain and bounded exponentiation", () => {
    expect(evaluateExpression("-x^2+2*x", 3)).toBe(-3);
    expect(evaluateExpression("2^3^2", 0)).toBe(512);
    expect(evaluateExpression("2^-2", 0)).toBe(0.25);
    expect(evaluateExpression("sqrt(x)+abs(-2)+log(100)", 9)).toBe(7);
    expect(() => evaluateExpression("1/(x-1)", 1)).toThrow(/denominador/);
    expect(() => evaluateExpression("sqrt(x)", -1)).toThrow(/não negativo/);
    expect(() => evaluateExpression("log(x)", 0)).toThrow(/positivo/);
    expect(() => evaluateExpression("0^-1", 2)).toThrow();
    expect(() => evaluateExpression("2^100", 0)).toThrow();
    expect(() => evaluateExpression("2*x; process.exit()", 1)).toThrow();
    expect(() => parseExpression("sqrt(-1)+evil()")).toThrow(/Função desconhecida/);
    expect(expressionPoint("1/x", 0).error).toMatch(/denominador/);
  });
  it("checks affine identities structurally, without assuming agreement on samples is proof", () => {
    expect(affineCoefficients("3+2*(x-1)")).toEqual({ slope: 2, intercept: 1 });
    expect(affineCoefficients("(6*x+3)/3")).toEqual({ slope: 2, intercept: 1 });
    expect(() => affineCoefficients("x*x")).toThrow();
    expect(() => affineCoefficients("1/x")).toThrow();
    expect(() => affineCoefficients("1/0")).toThrow();
  });
});

describe("equations and polynomials", () => {
  it("compares whole masses and accepts exact algebraic solutions", () => {
    expect(assess(equationsTool, "comparar-pratos", "equilibrados").correct).toBe(true);
    expect(assess(equationsTool, "comparar-pratos", "esquerdo", { a: 3 }).correct).toBe(true);
    expect(assess(equationsTool, "trocas-equivalentes", "3/2").correct).toBe(true);
    expect(assess(equationsTool, "ordenar-pesos", "empate", { p: 7, q: 7, d: 3 }).correct).toBe(
      true,
    );
    expect(assess(equationsTool, "traduzir-e-resolver", "4").correct).toBe(true);
    expect(assess(equationsTool, "traduzir-e-resolver", "8/3", { a: 3 }).correct).toBe(true);
    expect(
      assess(equationsTool, "dois-lados-e-parenteses", "4", { added: -6, scale: 3 }).correct,
    ).toBe(true);
    expect(assess(equationsTool, "modelar", "todos", { a: 2, b: 3, c: 2, d: 3 }).correct).toBe(
      true,
    );
    expect(assess(equationsTool, "modelar", "nenhuma", { a: 2, b: 3, c: 2, d: 4 }).correct).toBe(
      true,
    );
  });
  it("handles null polynomials, repeated roots, division and transformed equations", () => {
    expect(
      assess(equationsTool, "termos-grau-coeficientes", "indefinido", { a: 0, b: 0, c: 0 }).correct,
    ).toBe(true);
    expect(
      assess(equationsTool, "termos-grau-coeficientes", "0", { a: 0, b: 0, c: 4 }).correct,
    ).toBe(true);
    expect(assess(equationsTool, "fatoracao-raizes", "3; 2").correct).toBe(true);
    expect(assess(equationsTool, "fatoracao-raizes", "2", { p: 2, q: 2 }).correct).toBe(true);
    expect(assess(equationsTool, "divisao-e-resto", "-2", { p: 1 }).correct).toBe(false);
    expect(assess(equationsTool, "divisao-e-resto", "2", { p: 1 }).correct).toBe(true);
    expect(assess(equationsTool, "girard", "5").correct).toBe(true);
    expect(assess(equationsTool, "identidades", "4").correct).toBe(true);
    expect(
      assess(equationsTool, "quadraticas-e-substituicao", "-2; 2", { a: 1, b: 0, c: -4 }).correct,
    ).toBe(true);
    expect(
      assess(equationsTool, "quadraticas-e-substituicao", "nenhuma", { a: 1, b: 0, c: 4 }).correct,
    ).toBe(true);
    expect(
      assess(equationsTool, "quadraticas-e-substituicao", "todos", { a: 0, b: 0, c: 0 }).correct,
    ).toBe(true);
    expect(quadraticRoots(1, -2, 1)).toEqual([1]);
    expect(quadraticRoots(0, 2, -6)).toEqual([3]);
  });
  it("distinguishes inconsistent, dependent and unique systems including zero rows", () => {
    expect(systemSolution(1, 1, 7, 1, -1, 1)).toEqual({ x: 4, y: 3 });
    expect(assess(equationsTool, "sistemas", "4; 3").correct).toBe(true);
    expect(assess(equationsTool, "sistemas", "3; 4").correct).toBe(false);
    expect(
      assess(equationsTool, "sistemas", "infinitas", { a: 0, b: 0, c: 0, d: 1, e: 2, f: 3 })
        .correct,
    ).toBe(true);
    expect(
      assess(equationsTool, "sistemas", "nenhuma", { a: 0, b: 0, c: 1, d: 1, e: 2, f: 3 }).correct,
    ).toBe(true);
    expect(
      assess(equationsTool, "sistemas", "nenhuma", { a: 1, b: 2, c: 3, d: 2, e: 4, f: 7 }).correct,
    ).toBe(true);
  });
  it("rejects extraneous radical solutions and respects modulus, logarithms and inequality direction", () => {
    expect(assess(equationsTool, "modulo-radicais-e-dominio", "4").correct).toBe(true);
    expect(assess(equationsTool, "modulo-radicais-e-dominio", "4", { b: -3 }).correct).toBe(false);
    expect(assess(equationsTool, "modulo-radicais-e-dominio", "nenhuma", { b: -3 }).correct).toBe(
      true,
    );
    expect(
      assess(equationsTool, "modulo-radicais-e-dominio", "-8; -2", {
        domainKind: "modulo",
        a: 5,
        b: 3,
      }).correct,
    ).toBe(true);
    expect(
      assess(equationsTool, "modulo-radicais-e-dominio", "-5", { domainKind: "modulo", a: 5, b: 0 })
        .correct,
    ).toBe(true);
    expect(assess(equationsTool, "exponenciais-logaritmos", "4").correct).toBe(true);
    expect(assess(equationsTool, "inequacoes", "x < 4").correct).toBe(true);
    expect(assess(equationsTool, "inequacoes", "x > -4", { a: -2 }).correct).toBe(true);
    expect(assess(equationsTool, "inequacoes", "x >= -4", { a: -2 }).correct).toBe(false);
    const setup = launch("L08", "massas");
    expect(() =>
      parseEquation(setup, { ...equationsTool.activity(setup).initialState, p: -1 }),
    ).toThrow(/massa/);
  });
});

describe("sequences", () => {
  it("counts from one, evaluates sums and handles ratio one", () => {
    expect(assess(sequencesTool, "pa-termo", "12").correct).toBe(true);
    expect(assess(sequencesTool, "pa-soma", "42").correct).toBe(true);
    expect(assess(sequencesTool, "pg-termo-soma", "64").correct).toBe(true);
    expect(assess(sequencesTool, "pg-termo-soma", "126", { showSum: true }).correct).toBe(true);
    expect(assess(sequencesTool, "pg-termo-soma", "12", { ratio: 1, showSum: true }).correct).toBe(
      true,
    );
    expect(assess(sequencesTool, "recorrencia", "21").correct).toBe(true);
    expect(assess(sequencesTool, "figuras-crescentes", "36").correct).toBe(true);
    expect(assess(sequencesTool, "padrao-repetido", "triângulo").correct).toBe(true);
    expect(assess(sequencesTool, "termo-geral", "2*n").correct).toBe(true);
    expect(assess(sequencesTool, "termo-geral", "2+(n-1)*2").correct).toBe(true);
    expect(assess(sequencesTool, "termo-geral", "2*n+(n-1)*(n-2)*(n-3)").correct).toBe(false);
  });
  it("reveals genuinely different rules after identical initial examples", () => {
    const setup = launch("L09", "testar-regras"),
      state = parseSequence(setup, sequencesTool.activity(setup).initialState);
    for (const n of [1, 2, 3]) expect(sequenceTerm(state, n)).toBe(sequenceTerm(state, n, true));
    expect(sequenceTerm(state, 4)).toBe(8);
    expect(sequenceTerm(state, 4, true)).toBe(14);
    expect(assess(sequencesTool, "testar-regras", "72").correct).toBe(true);
    const recurrence = launch("L09", "recorrencia"),
      recurrenceState = parseSequence(recurrence, sequencesTool.activity(recurrence).initialState);
    expect(sequenceSum(recurrenceState, 4)).toBe(18);
    expect(assess(sequencesTool, "maquina-de-instrucoes", "16").correct).toBe(true);
    expect(
      assess(sequencesTool, "maquina-de-instrucoes", "14", { multiplyFirst: true }).correct,
    ).toBe(true);
  });
});

describe("integer structures", () => {
  it("uses Euclidean remainders, modular powers, factorization and base notation", () => {
    expect(assess(numbersTool, "quociente-e-resto", "3").correct).toBe(true);
    expect(assess(numbersTool, "paridade", "ímpar").correct).toBe(true);
    expect(assess(numbersTool, "divisibilidade", "não").correct).toBe(true);
    expect(assess(numbersTool, "classes-e-multiplos", "3").correct).toBe(true);
    expect(assess(numbersTool, "modulo-potencias", "1").correct).toBe(true);
    expect(modularPower(7, 100, 10)).toBe(1);
    expect(primeFactors(360)).toEqual([2, 2, 2, 3, 3, 5]);
    expect(assess(numbersTool, "primos-divisores", "1", { n: 1 }).correct).toBe(true);
    expect(assess(numbersTool, "primos-divisores", "24", { n: 240 }).correct).toBe(false);
    expect(assess(numbersTool, "primos-divisores", "20", { n: 240 }).correct).toBe(true);
    expect(assess(numbersTool, "mdc-mmc", "6", { n: 24, other: 18 }).correct).toBe(true);
    expect(assess(numbersTool, "mdc-mmc", "72", { n: 24, other: 18, findLcm: true }).correct).toBe(
      true,
    );
    expect(assess(numbersTool, "digitos-bases", "10111").correct).toBe(true);
    expect(assess(numbersTool, "digitos-bases", "f0", { n: 240, base: 16 }).correct).toBe(true);
    expect(assess(numbersTool, "digitos-bases", "0", { n: 0 }).correct).toBe(true);
  });
  it("checks compatible and impossible simultaneous congruences and process invariants", () => {
    expect(assess(numbersTool, "multiplas-condicoes", "13").correct).toBe(true);
    const setup = launch("L10", "multiplas-condicoes"),
      state = parseNumber(setup, {
        ...numbersTool.activity(setup).initialState,
        divisor: 4,
        modulus: 6,
        remainderA: 1,
        remainderB: 2,
      });
    expect(simultaneousRemainder(state)).toBeNull();
    expect(numbersTool.assess(setup, state, "nenhum").correct).toBe(true);
    expect(assess(numbersTool, "processos-invariantes", "não").correct).toBe(true);
    expect(assess(numbersTool, "processos-invariantes", "sim", { other: 3 }).correct).toBe(true);
    expect(() => parseNumber(setup, { ...state, remainderA: 4 })).toThrow(/resto/);
  });
});

describe("functions and graph domains", () => {
  it("respects holes, natural domains, excluded boundaries and finite graph windows", () => {
    const setup = launch("L11", "relacao-dominio-imagem"),
      initial = functionsTool.activity(setup).initialState;
    const state = parseFunction(setup, { ...initial, shape: "expression", expression: "1/(x-1)" });
    expect(functionPoint(setup, state, 1).error).toMatch(/denominador/);
    expect(functionPoint(setup, state, 2).value).toBe(1);
    expect(functionsTool.assess(setup, { ...state, input: 1 }, "fora do domínio").correct).toBe(
      true,
    );
    const segments = graphSegments(setup, state);
    expect(segments.length).toBe(2);
    expect(
      segments.every(
        (points) => !(points.some((point) => point.x < 1) && points.some((point) => point.x > 1)),
      ),
    ).toBe(true);
    expect(
      assess(functionsTool, "relacao-dominio-imagem", "fora do domínio", {
        shape: "sqrt",
        input: -1,
        b: 0,
      }).correct,
    ).toBe(true);
    expect(
      assess(functionsTool, "afim", "fora do domínio", { input: 8, includeMax: false }).correct,
    ).toBe(true);
    expect(() => parseFunction(setup, { ...initial, domainMin: 5, domainMax: 4 })).toThrow();
    expect(() => parseFunction(setup, { ...initial, expression: "sqrt(-1)+evil()" })).toThrow();
    expect(() => parseFunction(setup, { ...initial, expression: "1/(x*x-1)" })).toThrow();
    const narrowPole = parseFunction(setup, {
      ...initial,
      shape: "expression",
      expression: "0.00001/(x-0.01)",
    });
    expect(
      graphSegments(setup, narrowPole).every(
        (points) =>
          !(points.some((point) => point.x < 0.01) && points.some((point) => point.x > 0.01)),
      ),
    ).toBe(true);
  });
  it("handles multiple and repeated roots, intersections and the whole zero polynomial", () => {
    expect(assess(functionsTool, "quadratica", "-2; 2").correct).toBe(true);
    expect(
      assess(functionsTool, "quadratica", "2", { domainMin: -2, includeMin: false }).correct,
    ).toBe(true);
    expect(assess(functionsTool, "raizes-graficas", "1", { a: 1, b: -2, c: 1 }).correct).toBe(true);
    expect(assess(functionsTool, "raizes-graficas", "todos", { a: 0, b: 0, c: 0 }).correct).toBe(
      true,
    );
    expect(assess(functionsTool, "intersecoes", "-2; 2").correct).toBe(true);
    expect(
      assess(functionsTool, "intersecoes-sistemas", "todos", {
        a: 1,
        b: 2,
        secondSlope: 1,
        secondIntercept: 2,
      }).correct,
    ).toBe(true);
    expect(assess(functionsTool, "intervalos-sinais", "zero", { input: 2 }).correct).toBe(true);
    expect(
      assess(functionsTool, "circunferencia", "sobre", {
        a: 0,
        b: 0,
        c: 5,
        input: 3,
        secondIntercept: 4,
      }).correct,
    ).toBe(true);
  });
  it("checks composition at the intermediate value and inverse against the original domain", () => {
    expect(
      assess(functionsTool, "modelar-compor-inverter", "14", {
        a: 2,
        b: 2,
        input: 3,
        secondSlope: 2,
      }).correct,
    ).toBe(true);
    expect(
      assess(functionsTool, "modelar-compor-inverter", "fora do domínio", {
        input: 5,
        secondSlope: 2,
      }).correct,
    ).toBe(true);
    expect(
      assess(functionsTool, "modelar-compor-inverter", "2", {
        a: 2,
        b: 2,
        input: 6,
        operation: "inverse",
      }).correct,
    ).toBe(true);
    expect(
      assess(functionsTool, "modelar-compor-inverter", "sem inversa", {
        a: 0,
        operation: "inverse",
      }).correct,
    ).toBe(true);
  });
});

describe("triangles and trigonometry", () => {
  it("preserves right-triangle and area relationships without confusing an inclined side with height", () => {
    expect(assess(trianglesTool, "catetos-hipotenusa-e-quadrados", "5").correct).toBe(true);
    expect(assess(trianglesTool, "cateto-desconhecido", "4").correct).toBe(true);
    expect(assess(trianglesTool, "altura-para-area", "12").correct).toBe(true);
    expect(assess(trianglesTool, "construcoes", "6").correct).toBe(true);
    expect(assess(trianglesTool, "classificar-distancias", "retângulo").correct).toBe(true);
    expect(
      assess(trianglesTool, "classificar-distancias", "obtusângulo", { a: 2, b: 3, c: 4 }).correct,
    ).toBe(true);
    expect(
      assess(trianglesTool, "classificar-distancias", "acutângulo", { a: 3, b: 3, c: 3 }).correct,
    ).toBe(true);
    expect(triangleFromSides(3, 4, 5).area).toBeCloseTo(6);
    expect(() => triangleFromSides(1, 2, 3)).toThrow();
    const setup = launch("L18", "construcoes");
    expect(() =>
      parseTriangle(setup, { ...trianglesTool.activity(setup).initialState, a: 1, b: 2, c: 3 }),
    ).toThrow();
  });
  it("evaluates ratios, included angles, sine law, tangent geometry and navigation", () => {
    expect(assess(trianglesTool, "razoes-triangulo", "3/5").correct).toBe(true);
    expect(assess(trianglesTool, "razoes-triangulo", "4/5", { ratio: "cosseno" }).correct).toBe(
      true,
    );
    expect(assess(trianglesTool, "razoes-triangulo", "3/4", { ratio: "tangente" }).correct).toBe(
      true,
    );
    expect(assess(trianglesTool, "angulos-notaveis", "1/2").correct).toBe(true);
    expect(assess(trianglesTool, "angulos-e-paralelas", "150").correct).toBe(true);
    expect(assess(trianglesTool, "circulos-e-tangentes", "4").correct).toBe(true);
    expect(assess(trianglesTool, "area-seno", "3").correct).toBe(true);
    expect(assess(trianglesTool, "lei-senos-cossenos", "5", { angle: 90 }).correct).toBe(true);
    expect(
      assess(trianglesTool, "lei-senos-cossenos", "5,196", {
        law: "senos",
        angle: 30,
        secondAngle: 60,
      }).correct,
    ).toBe(true);
    expect(assess(trianglesTool, "alturas-distancias-navegacao", "5", { angle: 45 }).correct).toBe(
      true,
    );
    const setup = launch("L18", "lei-senos-cossenos"),
      state = parseTriangle(setup, { ...trianglesTool.activity(setup).initialState, law: "senos" });
    const shape = triangleMeasures(setup, state);
    expect(shape.third).toBeCloseTo(3 * Math.sqrt(3));
    expect(shape.area).toBeCloseTo((9 * Math.sqrt(3)) / 2);
    expect(() => parseTriangle(setup, { ...state, angle: 100, secondAngle: 80 })).toThrow();
    const tangent = launch("L18", "circulos-e-tangentes");
    expect(() =>
      parseTriangle(tangent, {
        ...trianglesTool.activity(tangent).initialState,
        radius: 5,
        distance: 5,
      }),
    ).toThrow();
  });
});
