import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import curriculum from "../curriculum.json";
import { elementaryTools } from "../elementary";
import { reasoningTools } from "../reasoning";
import type { ToolLaunch, ToolModule } from "../types";
import {
  advancedEquationsTool,
  intervalAnswer,
  nonlinearSolutions,
  pairSetAnswer,
  parseAdvancedEquation,
  radicalSolutions,
  substitutedSolutions,
} from "./advanced-equations";
import {
  advancedFunctionsTool,
  intervalText,
  quadraticInequality,
  relationIsFunction,
  vertex,
} from "./advanced-functions";
import {
  advancedSequencesTool,
  affineTrace,
  conditionalTrace,
  hanoiTowers,
  parseAdvancedSequence,
} from "./advanced-sequences";
import {
  advancedTrianglesTool,
  parseAdvancedTriangle,
  projectionMeasures,
  quadrilateralMeasures,
} from "./advanced-triangles";
import { AlgebraTool } from "./components";
import { algebraConceptLinks } from "./concept-links";
import { algebraTools } from "./index";
import { numberSummary, numbersTool, parseNumber } from "./numbers";
import {
  factoredCoefficients,
  fractionText,
  polynomialDegree,
  polynomialDivision,
  rationalRootCandidates,
} from "./polynomial-math";
import { sequencesTool } from "./sequences";

function launch(tool: ToolModule, mode: string, variant: 0 | 1 = 0, grade = 10): ToolLaunch {
  return { family: tool.family, mode, variant, grade };
}
function answer(
  tool: ToolModule,
  mode: string,
  input: string,
  changes: Record<string, unknown> = {},
  variant: 0 | 1 = 0,
) {
  const context = launch(tool, mode, variant);
  return tool.assess(context, { ...tool.activity(context).initialState, ...changes }, input);
}

describe("expanded algebra mathematics", () => {
  it("divides cubic and quadratic polynomials with exact rational coefficients", () => {
    const cubic = polynomialDivision([-5, 2, 0, 1], [-2, 1]);
    expect(cubic.quotient.map(fractionText)).toEqual(["6", "2", "1"]);
    expect(cubic.remainder.map(fractionText)).toEqual(["7"]);
    const half = polynomialDivision([0, 0, 1], [1, 2]);
    expect(half.quotient.map(fractionText)).toEqual(["-1/4", "1/2"]);
    expect(half.remainder.map(fractionText)).toEqual(["1/4"]);
    const quadratic = polynomialDivision([0, 1, 0, 1], [1, 0, 1]);
    expect(quadratic.quotient.map(fractionText)).toEqual(["0", "1"]);
    expect(quadratic.remainder.map(fractionText)).toEqual(["0"]);
    expect(answer(advancedEquationsTool, "polinomios-gerais", "7").correct).toBe(true);
    expect(
      answer(advancedEquationsTool, "polinomios-gerais", "1/4", {
        coefficients: [0, 0, 1, 0, 0, 0],
        divisor: [1, 2, 0],
      }).correct,
    ).toBe(true);
    expect(
      answer(advancedEquationsTool, "polinomios-gerais", "0,25", {
        coefficients: [0, 0, 1, 0, 0, 0],
        divisor: [1, 2, 0],
      }).correct,
    ).toBe(true);
    expect(() => polynomialDivision([1, 2], [0, 0])).toThrow();
  });
  it("evaluates coefficients, degrees and rational-root candidates without a degree-two shortcut", () => {
    expect(polynomialDegree([1, 0, 0, 0, 0, 2])).toBe(5);
    expect(polynomialDegree([0, 0, 0])).toBeNull();
    expect(
      answer(advancedEquationsTool, "polinomios-gerais", "11", {
        coefficients: [1, -3, 0, 2, 0, 0],
        input: 2,
        target: "value",
      }).correct,
    ).toBe(true);
    expect(
      answer(advancedEquationsTool, "polinomios-gerais", "1", {
        coefficients: [1, -3, 0, 2, 0, 1],
        target: "coefficient-sum",
      }).correct,
    ).toBe(true);
    expect(rationalRootCandidates([-6, -7, 1, 2])).toEqual([
      -6, -3, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 3, 6,
    ]);
    expect(rationalRootCandidates([0, -4, 0, 1])).toEqual([-4, -2, -1, 0, 1, 2, 4]);
    const context = launch(advancedEquationsTool, "polinomios-gerais");
    expect(() =>
      parseAdvancedEquation(context, {
        ...advancedEquationsTool.activity(context).initialState,
        coefficients: [0, 0, 0, 0, 0, 0],
        target: "candidates",
      }),
    ).toThrow(/não nulo/);
  });
  it("counts multiplicity in Girard but removes repeated entries from the solution set", () => {
    expect(factoredCoefficients([1, 1, -2])).toEqual([2, -3, 0, 1]);
    expect(answer(advancedEquationsTool, "raizes-e-relacoes", "11").correct).toBe(true);
    expect(answer(advancedEquationsTool, "raizes-e-relacoes", "-3", {}, 1).correct).toBe(true);
    expect(
      answer(advancedEquationsTool, "raizes-e-relacoes", "-2; 1", {
        roots: [1, 1, -2],
        target: "roots",
      }).correct,
    ).toBe(true);
    expect(
      answer(advancedEquationsTool, "raizes-e-relacoes", "-2; 1; 1", {
        roots: [1, 1, -2],
        target: "roots",
      }).correct,
    ).toBe(false);
    expect(
      answer(advancedEquationsTool, "raizes-e-relacoes", "3/2", {
        roots: [1, 2],
        target: "reciprocals",
      }).correct,
    ).toBe(true);
  });
  it("preserves exact large integer remainders and negative-base parity", () => {
    expect(answer(advancedEquationsTool, "potencias-e-restos-polinomiais", "0").correct).toBe(true);
    expect(
      answer(advancedEquationsTool, "potencias-e-restos-polinomiais", "-2", {}, 1).correct,
    ).toBe(true);
    expect(
      answer(
        advancedEquationsTool,
        "potencias-e-restos-polinomiais",
        "1267650600228229401496703205375",
        { root: 2 },
      ).correct,
    ).toBe(true);
    expect(
      answer(
        advancedEquationsTool,
        "potencias-e-restos-polinomiais",
        "1267650600228229401496703205376",
        { root: 2 },
      ).correct,
    ).toBe(false);
    expect(
      answer(advancedEquationsTool, "potencias-e-restos-polinomiais", "1e30", { root: 2 }).correct,
    ).toBe(false);
  });
  it("uses independent symmetric identities", () => {
    expect(answer(advancedEquationsTool, "identidades-simetricas", "23").correct).toBe(true);
    expect(answer(advancedEquationsTool, "identidades-simetricas", "133", {}, 1).correct).toBe(
      true,
    );
    expect(
      answer(advancedEquationsTool, "identidades-simetricas", "49", {
        sum: 13,
        product: 30,
        target: "difference",
      }).correct,
    ).toBe(true);
  });
  it("rejects extraneous roots after squaring and handles the reverse radical arrangement", () => {
    expect(radicalSolutions({ kind: "radical", a: 1, b: 6, c: 1, d: 0 })).toEqual({
      candidates: [-2, 3],
      solutions: [3],
    });
    expect(answer(advancedEquationsTool, "radical-com-incognita", "3").correct).toBe(true);
    expect(answer(advancedEquationsTool, "radical-com-incognita", "-2; 3").correct).toBe(false);
    expect(answer(advancedEquationsTool, "radical-com-incognita", "9", {}, 1).correct).toBe(true);
    expect(
      answer(advancedEquationsTool, "radical-com-incognita", "nenhuma", { a: 1, b: 0, c: 0, d: -2 })
        .correct,
    ).toBe(true);
  });
  it("returns from a quadratic substitution to all and only real x values", () => {
    expect(
      substitutedSolutions({ kind: "substitution", a: 1, b: -5, c: 4, innerLinear: 0 }).solutions,
    ).toEqual([-2, -1, 1, 2]);
    expect(answer(advancedEquationsTool, "substituicoes-quadraticas", "2; -2; 1; -1").correct).toBe(
      true,
    );
    expect(
      answer(advancedEquationsTool, "substituicoes-quadraticas", "-1; 1; 2; 4", {}, 1).correct,
    ).toBe(true);
    expect(
      answer(advancedEquationsTool, "substituicoes-quadraticas", "nenhuma", { a: 1, b: 0, c: 1 })
        .correct,
    ).toBe(true);
    expect(
      answer(advancedEquationsTool, "substituicoes-quadraticas", "0", { a: 1, b: 0, c: 0 }).correct,
    ).toBe(true);
  });
  it("solves module equations, open intervals and the minimum sum of distances", () => {
    expect(answer(advancedEquationsTool, "modulo-distancias", "-2; 8").correct).toBe(true);
    expect(answer(advancedEquationsTool, "modulo-distancias", "]-2; 3[", {}, 1).correct).toBe(true);
    expect(answer(advancedEquationsTool, "modulo-distancias", "[-2; 3]", {}, 1).correct).toBe(
      false,
    );
    expect(
      answer(advancedEquationsTool, "modulo-distancias", "4", { target: "minimum" }).correct,
    ).toBe(true);
    expect(
      answer(advancedEquationsTool, "modulo-distancias", "vazio", { radius: 0, target: "strict" })
        .correct,
    ).toBe(true);
    expect(
      answer(advancedEquationsTool, "modulo-distancias", "[1/2; 1/2]", {
        a: 2,
        b: -1,
        radius: 0,
        target: "closed",
      }).correct,
    ).toBe(true);
  });
  it("distinguishes no intersections, tangency and two ordered solution pairs", () => {
    expect(answer(advancedEquationsTool, "sistemas-nao-lineares", "2").correct).toBe(true);
    expect(
      answer(advancedEquationsTool, "sistemas-nao-lineares", "3; 2 | 2; 3", { target: "pairs" })
        .correct,
    ).toBe(true);
    expect(
      answer(advancedEquationsTool, "sistemas-nao-lineares", "2; 3 | 2; 3", { target: "pairs" })
        .correct,
    ).toBe(false);
    expect(
      answer(
        advancedEquationsTool,
        "sistemas-nao-lineares",
        "-4; -3 | 3; 4",
        { target: "pairs" },
        1,
      ).correct,
    ).toBe(true);
    expect(
      answer(advancedEquationsTool, "sistemas-nao-lineares", "1", { slope: 0, intercept: 5 }, 1)
        .correct,
    ).toBe(true);
    expect(
      answer(advancedEquationsTool, "sistemas-nao-lineares", "0", { slope: 0, intercept: 6 }, 1)
        .correct,
    ).toBe(true);
    expect(
      nonlinearSolutions({
        kind: "nonlinear",
        model: "sum-product",
        sum: 0,
        product: 0,
        slope: 0,
        intercept: 0,
        radius: 1,
        centerX: 0,
        centerY: 0,
        target: "count",
      }),
    ).toEqual([{ x: 0, y: 0 }]);
    expect(pairSetAnswer("0; 0", [{ x: 0, y: 0 }])).toBe(true);
  });
});

describe("sequences with their actual rule", () => {
  it("distinguishes repeated affine recurrence from Fibonacci and counts steps from a0", () => {
    expect(
      affineTrace({ kind: "affine", start: 1, multiplier: 2, increment: 1, steps: 4 }),
    ).toEqual([1, 3, 7, 15, 31]);
    expect(answer(advancedSequencesTool, "recorrencia-afim", "31").correct).toBe(true);
    expect(
      answer(advancedSequencesTool, "recorrencia-afim", "17", {
        start: 2,
        multiplier: 2,
        increment: -1,
        steps: 4,
      }).correct,
    ).toBe(true);
    expect(answer(advancedSequencesTool, "maquina-inversa", "5").correct).toBe(true);
    expect(answer(advancedSequencesTool, "maquina-inversa", "6", {}, 1).correct).toBe(true);
    expect(
      answer(advancedSequencesTool, "maquina-inversa", "1/2", {
        output: 4,
        multiplier: 2,
        increment: 3,
        multiplyFirst: true,
      }).correct,
    ).toBe(true);
  });
  it("implements conditional rules and digit sums, not another fixed sequence", () => {
    expect(conditionalTrace({ kind: "machine", start: 6, steps: 4, rule: "collatz" })).toEqual([
      6, 3, 10, 5, 16,
    ]);
    expect(conditionalTrace({ kind: "machine", start: 9876, steps: 3, rule: "digit-sum" })).toEqual(
      [9876, 30, 3, 3],
    );
    expect(answer(advancedSequencesTool, "maquinas-condicionais", "16").correct).toBe(true);
    expect(answer(advancedSequencesTool, "maquinas-condicionais", "3", {}, 1).correct).toBe(true);
  });
  it("supports AAB, ABB and all seven weekdays with one-based positions", () => {
    expect(answer(advancedSequencesTool, "blocos-repetidos", "círculo").correct).toBe(true);
    expect(answer(advancedSequencesTool, "blocos-repetidos", "quadrado", {}, 1).correct).toBe(true);
    expect(
      answer(advancedSequencesTool, "blocos-repetidos", "terça-feira", {
        block: [0, 1, 2, 3, 4, 5, 6],
        position: 9,
        alphabet: "week",
      }).correct,
    ).toBe(true);
    expect(
      answer(advancedSequencesTool, "blocos-repetidos", "domingo", {
        block: [0, 1, 2, 3, 4, 5, 6],
        position: 7,
        alphabet: "week",
      }).correct,
    ).toBe(true);
  });
  it("checks legal Hanoi moves and its minimum recurrence", () => {
    expect(
      hanoiTowers({
        kind: "hanoi",
        disks: 2,
        moves: [
          { from: 0, to: 1 },
          { from: 0, to: 2 },
          { from: 1, to: 2 },
        ],
      }),
    ).toEqual([[], [], [2, 1]]);
    expect(() =>
      hanoiTowers({
        kind: "hanoi",
        disks: 2,
        moves: [
          { from: 0, to: 1 },
          { from: 0, to: 1 },
        ],
      }),
    ).toThrow(/maior/);
    expect(() => hanoiTowers({ kind: "hanoi", disks: 2, moves: [{ from: 2, to: 0 }] })).toThrow(
      /vazia/,
    );
    expect(answer(advancedSequencesTool, "torres-de-hanoi", "7").correct).toBe(true);
    expect(answer(advancedSequencesTool, "torres-de-hanoi", "63", { disks: 6 }).correct).toBe(true);
  });
  it("supports figurative linear/quadratic growth and whole staircase totals", () => {
    expect(
      answer(advancedSequencesTool, "figuras-por-regra", "20", { a: 1, b: 1, c: 0, position: 4 })
        .correct,
    ).toBe(true);
    expect(
      answer(advancedSequencesTool, "figuras-por-regra", "17", { a: 0, b: 3, c: 2, position: 5 })
        .correct,
    ).toBe(true);
    expect(answer(advancedSequencesTool, "escadas-de-pecas", "10").correct).toBe(true);
    expect(answer(advancedSequencesTool, "escadas-de-pecas", "20", {}, 1).correct).toBe(true);
  });
  it("adds squares, rectangles, odd layers and telescoping fractions", () => {
    expect(
      answer(advancedSequencesTool, "somas-por-termos", "55", { count: 5, rule: "squares" })
        .correct,
    ).toBe(true);
    expect(
      answer(advancedSequencesTool, "somas-por-termos", "40", { count: 4, rule: "products" })
        .correct,
    ).toBe(true);
    expect(
      answer(advancedSequencesTool, "somas-por-termos", "25", { count: 5, rule: "odds" }).correct,
    ).toBe(true);
    expect(
      answer(advancedSequencesTool, "somas-por-termos", "5/6", { count: 5, rule: "telescoping" })
        .correct,
    ).toBe(true);
    expect(
      answer(advancedSequencesTool, "somas-por-termos", "225", {
        count: 9,
        rule: "multiples",
        factor: 5,
      }).correct,
    ).toBe(true);
  });
});

describe("relations, extrema and complete inequalities", () => {
  it("uses exactly one image per domain element, while allowing shared images and duplicate pairs", () => {
    expect(
      relationIsFunction([
        { x: 0, y: 1 },
        { x: 0, y: 1 },
        { x: 2, y: 1 },
      ]),
    ).toBe(true);
    expect(
      relationIsFunction([
        { x: 0, y: 1 },
        { x: 0, y: 2 },
      ]),
    ).toBe(false);
    expect(answer(advancedFunctionsTool, "relacoes-e-funcoes", "sim").correct).toBe(true);
    expect(answer(advancedFunctionsTool, "relacoes-e-funcoes", "não", {}, 1).correct).toBe(true);
  });
  it("separates maximizing input, maximum value and concavity", () => {
    expect(vertex({ a: -1, b: 6, c: 0 })).toEqual({ x: 3, y: 9 });
    expect(vertex({ a: 2, b: -8, c: 1 })).toEqual({ x: 2, y: -7 });
    expect(answer(advancedFunctionsTool, "vertice-e-extremos", "3").correct).toBe(true);
    expect(answer(advancedFunctionsTool, "vertice-e-extremos", "9", { target: "y" }).correct).toBe(
      true,
    );
    expect(
      answer(advancedFunctionsTool, "vertice-e-extremos", "máximo", { target: "type" }).correct,
    ).toBe(true);
  });
  it("handles all sign regimes including a double root and isolated solutions", () => {
    expect(answer(advancedFunctionsTool, "inequacoes-quadraticas", "]-2; 2[").correct).toBe(true);
    expect(answer(advancedFunctionsTool, "inequacoes-quadraticas", "[1;1]", {}, 1).correct).toBe(
      true,
    );
    const square = { kind: "inequality", a: 1, b: -2, c: 1, relation: "≥" } satisfies Parameters<
      typeof quadraticInequality
    >[0];
    expect(intervalText(quadraticInequality(square))).toBe("reais");
    expect(intervalText(quadraticInequality({ ...square, relation: "<" }))).toBe("vazio");
    expect(intervalText(quadraticInequality({ ...square, relation: ">" }))).toBe(
      "]−∞; 1[ ∪ ]1; +∞[",
    );
    expect(intervalText(quadraticInequality({ ...square, b: 0, c: 1, relation: "<" }))).toBe(
      "vazio",
    );
    expect(intervalText(quadraticInequality({ ...square, b: 0, c: 1, relation: ">" }))).toBe(
      "reais",
    );
    expect(intervalAnswer("[1/3;2] U ]-infinito;-1/2[", "]−∞; -0,5[ ∪ [0,3333; 2]")).toBe(true);
    expect(intervalAnswer("[-2;2]", "]-2;2[")).toBe(false);
    expect(intervalAnswer("[NaN;2]", "[-2;2]")).toBe(false);
  });
});

describe("geometric decomposition and validation", () => {
  it("uses projections rather than confusing them with catheti", () => {
    expect(projectionMeasures({ kind: "projections", p: 9, q: 16, target: "height" })).toEqual({
      height: 12,
      left: 15,
      right: 20,
      hypotenuse: 25,
    });
    expect(answer(advancedTrianglesTool, "alturas-e-projecoes", "12").correct).toBe(true);
    expect(
      answer(advancedTrianglesTool, "alturas-e-projecoes", "15", { target: "left" }).correct,
    ).toBe(true);
  });
  it("distinguishes whole base differences, half differences and half diagonals", () => {
    expect(answer(advancedTrianglesTool, "quadrilateros-e-alturas", "24").correct).toBe(true);
    expect(
      answer(advancedTrianglesTool, "quadrilateros-e-alturas", "28", {
        shape: "isosceles-trapezoid",
        base: 10,
        top: 4,
        side: 5,
      }).correct,
    ).toBe(true);
    expect(answer(advancedTrianglesTool, "quadrilateros-e-alturas", "5", {}, 1).correct).toBe(true);
    expect(
      answer(
        advancedTrianglesTool,
        "quadrilateros-e-alturas",
        "8",
        { known: "side-diagonal", target: "diagonal" },
        1,
      ).correct,
    ).toBe(true);
    const shape = quadrilateralMeasures({
      kind: "quadrilateral",
      shape: "rhombus",
      base: 10,
      top: 6,
      side: 5,
      diagonal: 6,
      otherDiagonal: 8,
      known: "diagonals",
      target: "area",
    });
    expect(shape.area).toBe(24);
  });
  it("rejects impossible shapes, malformed states and out-of-bounds rules", () => {
    const context = launch(advancedTrianglesTool, "quadrilateros-e-alturas"),
      state = advancedTrianglesTool.activity(context).initialState;
    expect(() => parseAdvancedTriangle(context, { ...state, base: 10, top: 2, side: 5 })).toThrow(
      /projeção/,
    );
    expect(() =>
      parseAdvancedTriangle(context, {
        ...state,
        shape: "rhombus",
        known: "side-diagonal",
        side: 2,
        diagonal: 6,
      }),
    ).toThrow(/metade/);
    const sequence = launch(advancedSequencesTool, "blocos-repetidos");
    expect(() =>
      parseAdvancedSequence(sequence, {
        ...advancedSequencesTool.activity(sequence).initialState,
        block: [],
      }),
    ).toThrow();
    expect(() =>
      parseAdvancedSequence(sequence, {
        ...advancedSequencesTool.activity(sequence).initialState,
        position: Number.POSITIVE_INFINITY,
      }),
    ).toThrow();
    const polynomial = launch(advancedEquationsTool, "polinomios-gerais");
    expect(() =>
      parseAdvancedEquation(polynomial, {
        ...advancedEquationsTool.activity(polynomial).initialState,
        coefficients: [0, 1, 2, 3, 4, 5, 6],
      }),
    ).toThrow();
  });
});

describe("authored curriculum concept links", () => {
  it("uses school-appropriate sequence language and mathematically relevant number controls", () => {
    for (const mode of ["crescer-diminuir", "posicao-e-quantidade", "pg-termo-soma"]) {
      const context = launch(sequencesTool, mode, 0, mode === "pg-termo-soma" ? 6 : 3),
        activity = sequencesTool.activity(context);
      const html = renderToStaticMarkup(
        createElement(AlgebraTool, {
          launch: context,
          state: activity.initialState,
          onChange: () => {},
        }),
      );
      expect(html).not.toMatch(/aₙ|a₁|n − 1/);
      expect(activity.prompt).not.toMatch(/\bPA\b|\bPG\b/);
    }
    const figureContext = launch(advancedSequencesTool, "figuras-por-regra", 0, 3);
    const figure = renderToStaticMarkup(
      createElement(AlgebraTool, {
        launch: figureContext,
        state: advancedSequencesTool.activity(figureContext).initialState,
        onChange: () => {},
      }),
    );
    expect(figure).not.toMatch(/n²|2n\+1|Quadrados a/);
    const parity = launch(numbersTool, "paridade"),
      state = parseNumber(parity, numbersTool.activity(parity).initialState);
    expect(numberSummary(parity, state)).toContain("11 pares completos e 1 objeto sem par");
    expect(numberSummary(parity, state)).not.toContain("29");
    const parityHtml = renderToStaticMarkup(
      createElement(AlgebraTool, { launch: parity, state, onChange: () => {} }),
    );
    expect(parityHtml).toContain("23 = 2 × 11 + 1");
    expect(parityHtml).not.toContain("Posições no relógio");
    const power = launch(numbersTool, "modulo-potencias");
    const powerHtml = renderToStaticMarkup(
      createElement(AlgebraTool, {
        launch: power,
        state: numbersTool.activity(power).initialState,
        onChange: () => {},
      }),
    );
    expect(powerHtml).toContain("Resto da potência: 1");
    expect(powerHtml).not.toContain("Quantidade de passos");
  });
  it("covers every concrete family in the assigned skills without importing reserved items", () => {
    const skills = new Set([
      "gavetas",
      "paridade",
      "padroes",
      "equacoes",
      "pitagoras",
      "restos",
      "invariantes",
      "logica-n2",
      "padroes-iniciais",
      "balancas",
      "funcoes",
      "recorrencias",
      "estruturas-numericas",
      "geometria-plana",
      "argumentacao-em",
      "polinomios",
      "inducao",
      "coordenadas-em",
      "equacoes-em",
      "trigonometria",
      "sequencias-iniciais",
      "medir-e-comparar",
    ]);
    const concrete = new Set(
      curriculum.lessons
        .filter((lesson) => skills.has(lesson.skillId))
        .flatMap((lesson) => lesson.items.map((item) => item.familyId))
        .filter(
          (family) =>
            !/(metodo-organizado|argumentacao-[123]|verificacao-de-solucao|comparacao-de-metodos)$/.test(
              family,
            ),
        ),
    );
    expect(Object.keys(algebraConceptLinks).sort()).toEqual([...concrete].sort());
    const modes = new Set(
      [...algebraTools, ...elementaryTools, ...reasoningTools].flatMap((tool) =>
        tool.modes.map((mode) => `${tool.family}.${mode}`),
      ),
    );
    for (const [family, links] of Object.entries(algebraConceptLinks)) {
      expect(links.length, family).toBeGreaterThan(0);
      for (const link of links) expect(modes.has(link), `${family} → ${link}`).toBe(true);
    }
  });
  it("routes actual concepts to the corresponding mathematical representation and school language", () => {
    expect(algebraConceptLinks["padroes:learn:soma-aritmetica"]).toEqual(["L09.pa-soma"]);
    expect(algebraConceptLinks["padroes:learn:recorrencia"]).toEqual(["L09.recorrencia-afim"]);
    expect(algebraConceptLinks["padroes:inversa"]).toEqual(["L09.maquina-inversa"]);
    expect(algebraConceptLinks["sequencias-iniciais:learn:figuras-crescem"]).toContain(
      "L09.escadas-de-pecas",
    );
    expect(algebraConceptLinks["gavetas:learn:garantia-de-tres"]).toEqual(["L12.cota-nas-gavetas"]);
    expect(algebraConceptLinks["pitagoras:learn:diagonal-da-caixa"]).toEqual([
      "L19.diagonal-espacial",
    ]);
    expect(algebraConceptLinks["equacoes-em:learn:sistemas"]).toContain(
      "L08.sistemas-nao-lineares",
    );
    expect(algebraConceptLinks["geometria-plana:learn:circulo"]).toEqual([
      "L18.circulos-medidas-e-angulos",
    ]);
  });
});
