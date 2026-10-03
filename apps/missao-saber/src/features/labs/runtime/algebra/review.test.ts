import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ToolLaunch, ToolState } from "../types";
import { intervalAnswer } from "./advanced-equations";
import { AlgebraTool } from "./components";
import {
  functionsTool,
  graphSegments,
  operationDomain,
  operationPoint,
  operationSegments,
  parseFunction,
} from "./functions";
import { algebraTools } from "./index";
import { affineIdentity, evaluateExpression, exactAnswer } from "./math";
import { factorTreeSteps } from "./numbers";
import { parseSequence, sequencesTool } from "./sequences";

function render(launch: ToolLaunch, state: ToolState, hideResults = false) {
  return renderToStaticMarkup(
    createElement(AlgebraTool, { launch, state, hideResults, onChange: () => {} }),
  );
}

describe("review: exact algebra and supported state boundaries", () => {
  it("accepts the largest published geometric term and sum as full integers", () => {
    const launch: ToolLaunch = { family: "L09", mode: "pg-termo-soma", grade: 11, variant: 0 };
    const state = {
      ...sequencesTool.activity(launch).initialState,
      start: 20,
      ratio: 3,
      position: 30,
    };
    expect(sequencesTool.assess(launch, state, "1372607547297660").correct).toBe(true);
    expect(
      sequencesTool.assess(launch, { ...state, showSum: true }, "2058911320946480").correct,
    ).toBe(true);
    expect(exactAnswer("0.500000000000000000000000000000", 1, 2)).toBe(true);
  });
  it("proves affine identity with exact decimal and rational coefficients", () => {
    expect(affineIdentity("(0.1+0.2)*x", 0.3, 0)).toBe(true);
    expect(affineIdentity("2*x+0.000000000001", 2, 0)).toBe(false);
    expect(affineIdentity("2*x+10000000000000000-9999999999999999", 2, 1)).toBe(true);
    expect(evaluateExpression("−x^2", 3)).toBe(-9);
    const launch: ToolLaunch = { family: "L09", mode: "termo-geral", grade: 11, variant: 0 };
    expect(
      sequencesTool.assess(
        launch,
        sequencesTool.activity(launch).initialState,
        "2*n+0.000000000001",
      ).correct,
    ).toBe(false);
  });
  it("rejects negative physical pieces at the state boundary for all grades", () => {
    const launch: ToolLaunch = { family: "L09", mode: "figuras-crescentes", grade: 11, variant: 0 };
    expect(() =>
      parseSequence(launch, { ...sequencesTool.activity(launch).initialState, start: -1 }),
    ).toThrow(/peças/);
  });
  it("recognizes equivalent interval unions while preserving excluded points", () => {
    expect(intervalAnswer("[-2;0] U [0;2]", "[-2;2]")).toBe(true);
    expect(intervalAnswer("[-2;0[ U ]0;2]", "[-2;2]")).toBe(false);
    expect(intervalAnswer("[-2;2] U [-2;2]", "[-2;2]")).toBe(true);
    expect(intervalAnswer("(-infinito;0] U (0;infinito)", "reais")).toBe(true);
    expect(intervalAnswer("]1;1[", "vazio")).toBe(true);
    expect(intervalAnswer("[2;1]", "vazio")).toBe(false);
    expect(intervalAnswer("[-infinito;infinito]", "reais")).toBe(false);
  });
  it("keeps the factor tree product and prime leaves for every supported positive integer", () => {
    for (let n = 1; n <= 240; n++) {
      let value = n;
      for (const step of factorTreeSteps(n)) {
        expect(step.value).toBe(value);
        expect(step.factor * step.remaining).toBe(value);
        for (let d = 2; d * d <= step.factor; d++) expect(step.factor % d).not.toBe(0);
        value = step.remaining;
      }
      if (n > 1) for (let d = 2; d * d <= value; d++) expect(value % d).not.toBe(0);
    }
  });
});

describe("review: synchronized operation and transfer representations", () => {
  it("includes a valid natural-domain endpoint between regular graph samples", () => {
    const launch: ToolLaunch = {
      family: "L11",
      mode: "relacao-dominio-imagem",
      grade: 11,
      variant: 0,
    };
    const state = parseFunction(launch, {
      ...functionsTool.activity(launch).initialState,
      shape: "expression",
      expression: "sqrt(x-0.01)",
    });
    expect(graphSegments(launch, state)[0]?.[0]).toEqual({ x: 0.01, y: 0 });
    expect(graphSegments(launch, { ...state, expression: "sqrt(x-0.01)+sqrt(0.01-x)" })).toEqual([
      [{ x: 0.01, y: 0 }],
    ]);
  });
  it("uses the inverse image as its input domain, including decreasing open endpoints", () => {
    const launch: ToolLaunch = {
      family: "L11",
      mode: "modelar-compor-inverter",
      grade: 11,
      variant: 0,
    };
    const state = parseFunction(launch, {
      ...functionsTool.activity(launch).initialState,
      a: -2,
      b: 2,
      domainMin: 0,
      domainMax: 3,
      includeMin: false,
      includeMax: true,
      input: -2,
      operation: "inverse",
    });
    expect(operationDomain(state)).toEqual([
      { x: -4, included: true },
      { x: 2, included: false },
    ]);
    expect(operationPoint(state, -2)).toEqual({ value: 2 });
    expect(operationPoint(state, 2)).toEqual({ error: "fora do domínio" });
    expect(operationSegments(state)).toEqual([
      { x: -4, y: 3 },
      { x: 2, y: -0 },
    ]);
    const html = render(launch, state);
    expect(html).toContain("Entrada → f⁻¹(x)");
    expect(html).toMatch(/<td[^>]*>-2<\/td><td[^>]*>2<\/td>/);
    expect(html).not.toContain("Intercepto de g");
    expect(html).not.toContain("g(x) =");
  });
  it("plots the composition on its actual domain, including constant g", () => {
    const launch: ToolLaunch = {
      family: "L11",
      mode: "modelar-compor-inverter",
      grade: 11,
      variant: 0,
    };
    const state = parseFunction(launch, {
      ...functionsTool.activity(launch).initialState,
      a: 2,
      b: 1,
      domainMin: 0,
      domainMax: 3,
      includeMin: false,
      includeMax: true,
      secondSlope: -2,
      secondIntercept: 1,
    });
    expect(operationDomain(state)).toEqual([
      { x: -1, included: true },
      { x: 0.5, included: false },
    ]);
    expect(operationPoint(state, -1)).toEqual({ value: 7 });
    expect(operationPoint(state, 0.5)).toEqual({ error: "fora do domínio" });
    expect(operationSegments(state)).toEqual([
      { x: -1, y: 7 },
      { x: 0.5, y: 1 },
    ]);
    expect(operationSegments({ ...state, secondSlope: 0, secondIntercept: 2 })).toEqual([
      { x: -10, y: 5 },
      { x: 10, y: 5 },
    ]);
    expect(operationSegments({ ...state, secondSlope: 0, secondIntercept: 0 })).toEqual([]);
  });
  it("distinguishes numerical tool limits from the real domain of a function", () => {
    const launch: ToolLaunch = {
      family: "L11",
      mode: "relacao-dominio-imagem",
      grade: 11,
      variant: 0,
    };
    const state = parseFunction(launch, {
      ...functionsTool.activity(launch).initialState,
      shape: "expression",
      expression: "1000000000000+1",
    });
    expect(functionsTool.assess(launch, state, "fora do domínio").correct).toBe(false);
    expect(functionsTool.assess(launch, state, "fora dos limites").correct).toBe(true);
    expect(render(launch, state)).toContain("fora dos limites");
  });
  it("does not reveal solved values in tables or accessible descriptions during transfer", () => {
    const cases: {
      family: ToolLaunch["family"];
      mode: string;
      hidden: string[];
      preserved: string;
    }[] = [
      {
        family: "L08",
        mode: "radical-com-incognita",
        hidden: ["Conferir os candidatos", "Pontos marcados:"],
        preserved: "√(1x+(6))=1x+(0)",
      },
      {
        family: "L08",
        mode: "polinomios-gerais",
        hidden: ["Divisão exata P = D·Q + R", "Q, coeficientes"],
        preserved: "divisor D(x)",
      },
      {
        family: "L11",
        mode: "vertice-e-extremos",
        hidden: ["Forma de vértice", "Pontos marcados:", "eixo x="],
        preserved: "f(x)=-1x²+(6)x+(0)",
      },
      {
        family: "L18",
        mode: "altura-para-area",
        hidden: ["altura perpendicular 4", "área 12", "h = 4"],
        preserved: "lados iguais 5",
      },
      {
        family: "L10",
        mode: "quociente-e-resto",
        hidden: ["Sobram 3", "grupos completos", "23 = 5"],
        preserved: "23 unidades sem agrupar",
      },
      {
        family: "L09",
        mode: "recorrencia-afim",
        hidden: ["Aplicações sucessivas da regra", "1 → 3 → 7"],
        preserved: "Entrada inicial 1",
      },
    ];
    for (const item of cases) {
      const tool = algebraTools.find((tool) => tool.family === item.family);
      if (!tool) throw new Error("Ferramenta ausente");
      const launch: ToolLaunch = { family: item.family, mode: item.mode, grade: 11, variant: 0 };
      const html = render(launch, tool.activity(launch).initialState, true);
      expect(html).toContain(item.preserved);
      for (const text of item.hidden) expect(html).not.toContain(text);
    }
  });
  for (const tool of algebraTools)
    for (const mode of tool.modes)
      it(`renders transfer data for ${tool.family}.${mode}`, () => {
        const launch: ToolLaunch = { family: tool.family, mode, grade: 11, variant: 1 };
        const html = render(launch, tool.activity(launch).initialState, true);
        expect(html).toMatch(/<fieldset/);
        expect(html).toMatch(/<label/);
        expect(html).not.toMatch(/NaN|Infinity|undefined/);
      });
});
