import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ToolLaunch } from "../types";
import { ElementaryTool } from "./components";
import { elementaryConceptLinks } from "./concept-links";
import { countingTool } from "./counting";
import {
  assessTwoQuantities,
  parseTwoQuantities,
  twoQuantitiesChecks,
  twoQuantitiesSolutions,
} from "./two-quantities";

const launch: ToolLaunch = { family: "L01", mode: "duas-quantidades", grade: 3, variant: 0 };
const initial = () => parseTwoQuantities(countingTool.activity(launch).initialState);

describe("draw and test two quantities", () => {
  it("checks heads and legs together, rejecting a montage that meets just one condition", () => {
    const state = { ...initial(), targetTotal: 5, targetValue: 14, first: 3, second: 2 };
    expect(twoQuantitiesSolutions(state)).toEqual([{ first: 3, second: 2 }]);
    expect(twoQuantitiesChecks(state).every((check) => check.met)).toBe(true);
    expect(assessTwoQuantities(state, "2").correct).toBe(true);
    expect(assessTwoQuantities(state, "3").correct).toBe(false);
    expect(assessTwoQuantities({ ...state, first: 5, second: 0 }, "0").correct).toBe(false);
    expect(assessTwoQuantities({ ...state, first: 7, second: 0 }, "0").correct).toBe(false);
  });

  it("represents a total with a difference, and a total with a double, without formal algebra", () => {
    const difference = parseTwoQuantities({
      ...initial(),
      kind: "diferenca",
      targetTotal: 10,
      difference: 2,
      first: 6,
      second: 4,
    });
    expect(twoQuantitiesSolutions(difference)).toEqual([{ first: 6, second: 4 }]);
    expect(assessTwoQuantities(difference, "4").correct).toBe(true);
    expect(assessTwoQuantities({ ...difference, first: 4, second: 6 }, "6").correct).toBe(false);
    const double = parseTwoQuantities({
      ...initial(),
      kind: "dobro",
      targetTotal: 9,
      first: 6,
      second: 3,
    });
    expect(twoQuantitiesSolutions(double)).toEqual([{ first: 6, second: 3 }]);
    expect(assessTwoQuantities(double, "3").correct).toBe(true);
    expect(twoQuantitiesSolutions({ ...double, targetTotal: 8 })).toEqual([]);
  });

  it("finds every exact payment, allows using just one price, and proves a genuinely impossible value", () => {
    const notes = parseTwoQuantities({
      ...initial(),
      kind: "notas",
      targetValue: 12,
      firstValue: 2,
      secondValue: 5,
    });
    expect(twoQuantitiesSolutions(notes)).toEqual([
      { first: 1, second: 2 },
      { first: 6, second: 0 },
    ]);
    expect(assessTwoQuantities({ ...notes, first: 1, second: 2 }, "2").correct).toBe(true);
    expect(assessTwoQuantities({ ...notes, first: 6, second: 0 }, "0").correct).toBe(true);
    const sweets = parseTwoQuantities({
      ...notes,
      kind: "precos",
      secondValue: 3,
      first: 0,
      second: 4,
    });
    expect(assessTwoQuantities(sweets, "4").correct).toBe(true);
    const impossible = { ...notes, targetValue: 3 };
    expect(twoQuantitiesSolutions(impossible)).toEqual([]);
    expect(assessTwoQuantities(impossible, "impossível").correct).toBe(false);
    expect(assessTwoQuantities({ ...impossible, enumerated: true }, "impossível").correct).toBe(
      true,
    );
    expect(assessTwoQuantities({ ...notes, enumerated: true }, "impossível").correct).toBe(false);
  });

  it("uses complete bounds even at zero and sixty, and rejects fractional or negative object counts", () => {
    const notes = parseTwoQuantities({
      ...initial(),
      kind: "precos",
      targetValue: 60,
      firstValue: 1,
      secondValue: 1,
    });
    const solutions = twoQuantitiesSolutions(notes);
    expect(solutions).toHaveLength(61);
    expect(solutions[0]).toEqual({ first: 0, second: 60 });
    expect(solutions.at(-1)).toEqual({ first: 60, second: 0 });
    expect(twoQuantitiesSolutions({ ...notes, targetValue: 0 })).toEqual([{ first: 0, second: 0 }]);
    expect(() => parseTwoQuantities({ ...notes, first: -1 })).toThrow();
    expect(() => parseTwoQuantities({ ...notes, second: 1.5 })).toThrow();
    expect(() => parseTwoQuantities({ ...notes, secondValue: 0 })).toThrow();
    expect(() =>
      parseTwoQuantities({ ...notes, kind: "notas", firstValue: 2, secondValue: 3 }),
    ).toThrow();
    expect(() =>
      parseTwoQuantities({ ...notes, kind: "notas", firstValue: 20, secondValue: 50 }),
    ).not.toThrow();
  });

  it("links the actual question family and renders editable conditions, trial history and complete enumeration", () => {
    expect(elementaryConceptLinks["problemas-com-desenho:learn:tentar"]).toEqual([
      "L08.numero-escondido",
      "L01.duas-quantidades",
    ]);
    const state = { ...initial(), trials: [{ first: 5, second: 0 }], enumerated: true };
    const html = renderToStaticMarkup(
      createElement(ElementaryTool, {
        launch,
        state,
        disabled: true,
        onChange: () => {
          throw new Error("A saved comparison cannot edit itself");
        },
      }),
    );
    expect(html).toContain("<fieldset disabled=");
    expect(html).toContain("Galinhas (grupo A)");
    expect(html).toContain("Cachorros (grupo B)");
    expect(html).toContain("Patas ao todo");
    expect(html).toContain("Anotar esta tentativa");
    expect(html).toContain("Minhas últimas 12 tentativas");
    expect(html).toContain("Conferimos cada combinação desses tamanhos.");
  });
});
