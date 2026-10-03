import { describe, expect, it } from "vitest";
import type { ToolLaunch, ToolModule } from "../types";
import { countingTool, parseCounting } from "./counting";
import { fractionsTool } from "./fractions";
import { geometryTool } from "./geometry";
import { assessNumber, format, rational, readRational } from "./math";
import { durationSegments, measuresTool, measureValue, parseMeasure } from "./measures";
import { parseRatios, ratiosTool, recipeComparisons } from "./ratios";
import { type Command, parseRoute, routesTool } from "./routes";
import {
  horizontalSection,
  parseSolid,
  polyhedronGeometry,
  sectionArea,
  solidsTool,
} from "./solids";
import { transformsTool } from "./transforms";

function context(tool: ToolModule, mode: string, variant: 0 | 1 = 0): ToolLaunch {
  return { family: tool.family, mode, grade: 8, variant };
}

describe("independent elementary review regressions", () => {
  it("allows departures from both collections after the arrival step, without removing nonexistent tokens", () => {
    const launch = context(countingTool, "passos-e-explicacao");
    const state = { ...countingTool.activity(launch).initialState, total: 5, other: 3, removed: 7 };
    expect(countingTool.assess(launch, state, "1").correct).toBe(true);
    expect(() => parseCounting(launch, { ...state, removed: 9 })).toThrow();
    expect(() => parseCounting(context(countingTool, "juntar-tirar"), state)).toThrow();
    expect(
      countingTool.assess(launch, { ...state, total: 90, other: 80, removed: 150 }, "20").correct,
    ).toBe(true);
  });
  it("checks that children actually distribute the whole collection into two equal trays", () => {
    const launch = { ...context(countingTool, "dobro-metade-grupos"), grade: 2 };
    const initial = countingTool.activity(launch).initialState;
    expect(countingTool.assess(launch, initial, "6").correct).toBe(false);
    expect(countingTool.assess(launch, { ...initial, trays: [5, 5] }, "6").correct).toBe(false);
    expect(countingTool.assess(launch, { ...initial, trays: [4, 8] }, "6").correct).toBe(false);
    expect(countingTool.assess(launch, { ...initial, trays: [6, 6] }, "6").correct).toBe(true);
    expect(() => parseCounting(launch, { ...initial, trays: [7, 6] })).toThrow();
    const transfer = { ...launch, variant: 1 as const };
    const transferState = countingTool.activity(transfer).initialState;
    expect(transferState.total).toBe(14);
    expect(countingTool.assess(transfer, { ...transferState, trays: [7, 7] }, "7").correct).toBe(
      true,
    );
  });
  it("keeps basic-solid feedback about flat and curved surfaces for early years", () => {
    const launch = { ...context(solidsTool, "solidos-basicos"), grade: 2 };
    const activity = solidsTool.activity(launch);
    const assessment = solidsTool.assess(launch, activity.initialState, "6");
    expect(assessment.correct).toBe(true);
    expect(assessment.summary).toContain("6 faces planas");
    expect(assessment.summary).not.toMatch(/cm²|cm³|V=|A=/);
    expect(activity.answerHint).not.toMatch(/decimal|fração|arredonde/);
  });
  it("compares actual fraction partitions instead of arbitrary weight encodings", () => {
    const launch = context(fractionsTool, "equivalencia-geral");
    const state = {
      ...fractionsTool.activity(launch).initialState,
      first: { whole: 1, pieces: [1, 1], painted: [true, false] },
      second: { whole: 1, pieces: [2, 2], painted: [true, false] },
    };
    expect(fractionsTool.assess(launch, state, "1/2").correct).toBe(false);
    expect(
      fractionsTool.assess(
        launch,
        {
          ...state,
          second: { whole: 1, pieces: [1, 1, 1, 1], painted: [true, true, false, false] },
        },
        "1/2",
      ).correct,
    ).toBe(true);
  });
  it("formats large answers unambiguously for the decimal parser and keeps whole-number answers exact", () => {
    expect(readRational(format(1728))).toEqual(rational(1728n));
    expect(assessNumber("4,00001", 4, "", "").correct).toBe(false);
    expect(assessNumber("12/3", 4, "", "").correct).toBe(true);
    expect(assessNumber("1,2345", 1.23445, "", "").correct).toBe(true);
    expect(assessNumber("1,2344", 1.23445, "", "").correct).toBe(false);
    expect(assessNumber("1/3", 1 / 3, "", "").correct).toBe(true);
  });
  it("partitions elapsed time without gaps, including zero time and the next day", () => {
    for (const [startMinute, endMinute, nextDay] of [
      [465, 550, false],
      [1420, 25, true],
      [0, 1439, true],
      [600, 600, false],
    ] as const) {
      const segments = durationSegments({ startMinute, endMinute, nextDay });
      expect(segments.reduce((sum, segment) => sum + segment.minutes, 0)).toBe(
        endMinute + (nextDay ? 1440 : 0) - startMinute,
      );
      segments.forEach((segment, index) => {
        expect(segment.to).toBeGreaterThan(segment.from);
        if (index > 0) expect(segment.from).toBe(segments[index - 1]?.to);
      });
    }
    expect(durationSegments({ startMinute: 1420, endMinute: 25, nextDay: true })).toEqual([
      { from: 1420, to: 1440, minutes: 20 },
      { from: 1440, to: 1465, minutes: 25 },
    ]);
  });
  it("conserves a measured length when a nonstandard unit changes, including a partial unit", () => {
    const launch = context(measuresTool, "unidades-e-regua");
    const state = parseMeasure(launch, {
      ...measuresTool.activity(launch).initialState,
      rulerStart: 3,
      rulerEnd: 11,
      rulerUnit: 3,
    });
    expect(measureValue(launch, state)).toBe(8 / 3);
    expect(measuresTool.assess(launch, state, "8/3 unidades").correct).toBe(true);
    expect(measuresTool.assess(launch, state, "8/3 cm").correct).toBe(false);
    expect(measureValue(launch, { ...state, rulerUnit: 2 })).toBe(4);
  });
  it("distinguishes additive and multiplicative recipe changes, including equal ingredients", () => {
    const launch = context(ratiosTool, "parte-parte-e-todo");
    const state = parseRatios(launch, ratiosTool.activity(launch).initialState);
    expect(recipeComparisons(state).map((recipe) => recipe.preservesRatio)).toEqual([
      true,
      true,
      false,
    ]);
    expect(
      recipeComparisons({ ...state, partA: 3, partB: 3 }).every((recipe) => recipe.preservesRatio),
    ).toBe(true);
    expect(
      recipeComparisons({ ...state, addition: 0 }).every((recipe) => recipe.preservesRatio),
    ).toBe(true);
  });
  it("keeps early-years paths within nonnegative rows and validates spatial points against the block", () => {
    const launch = { ...context(routesTool, "passos"), grade: 2 };
    expect(() =>
      parseRoute(launch, { ...routesTool.activity(launch).initialState, commands: ["W"] }),
    ).toThrow();
    const spatial = context(solidsTool, "coordenadas-capacidade-embalagem");
    expect(() =>
      parseSolid(spatial, { ...solidsTool.activity(spatial).initialState, spaceX: 12 }),
    ).toThrow();
  });
  it("preserves prism lengths through rotation and draws complete sections with the assessed area", () => {
    const launch = context(solidsTool, "cortes-vistas-projecoes");
    const state = parseSolid(launch, solidsTool.activity(launch).initialState);
    const prism = { ...state, shape: "prisma-triangular" as const, width: 3, depth: 4, height: 6 };
    const geometry = polyhedronGeometry(prism);
    expect(geometry?.vertices.slice(0, 3)).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 0, y: 4, z: 0 },
    ]);
    expect(polyhedronGeometry({ ...prism, rotation: 1 })).toEqual(geometry);
    for (const shape of ["bloco", "piramide", "prisma-triangular", "tetraedro"] as const)
      for (const cut of [0, 25, 50, 100]) {
        const solid = { ...state, shape, cut };
        const model = polyhedronGeometry(solid);
        if (!model) throw new Error("Expected a polyhedron");
        expect(sectionArea(model.section)).toBeCloseTo(horizontalSection(solid), 10);
        if (shape === "tetraedro")
          for (let i = 0; i < model.vertices.length; i++)
            for (const second of model.vertices.slice(i + 1)) {
              const first = model.vertices[i];
              if (first)
                expect(
                  Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z),
                ).toBeCloseTo(state.width, 10);
            }
      }
  });
  it("accepts the coordinate names explicitly requested by the reflection prompt", () => {
    const launch = context(transformsTool, "refletir");
    const state = transformsTool.activity(launch).initialState;
    expect(transformsTool.assess(launch, state, "x").correct).toBe(true);
    expect(transformsTool.assess(launch, state, "y").correct).toBe(false);
    expect(transformsTool.assess(launch, { ...state, axis: "horizontal" }, "Y").correct).toBe(true);
  });

  it("keeps equal increase and discount rates in both authored variants and rejects contradictions", () => {
    for (const variant of [0, 1] as const) {
      const launch = context(ratiosTool, "aumento-e-desconto", variant);
      const state = parseRatios(launch, ratiosTool.activity(launch).initialState);
      expect(state.secondChange).toBe(-state.change);
      expect(() => parseRatios(launch, { ...state, secondChange: -5 })).toThrow();
    }
  });

  it("rejects an increase disguised as a promotion or a negative tax", () => {
    const launch = context(ratiosTool, "promocoes-impostos-e-critica");
    const state = ratiosTool.activity(launch).initialState;
    expect(() => parseRatios(launch, { ...state, change: 10 })).toThrow();
    expect(() => parseRatios(launch, { ...state, secondChange: -10 })).toThrow();
  });

  it.each([
    { tool: ratiosTool, mode: "parte-parte-e-todo", answer: "40%", wrong: "40 kg" },
    { tool: ratiosTool, mode: "pontos-percentuais", answer: "35 p.p.", wrong: "35%" },
    { tool: ratiosTool, mode: "grandezas-e-unidades", answer: "100 km/h", wrong: "100 km" },
    { tool: geometryTool, mode: "unidades-area-perimetro", answer: "9 cm²", wrong: "9 cm" },
    { tool: measuresTool, mode: "relogio-e-duracao", answer: "85 minutos", wrong: "85 h" },
    { tool: solidsTool, mode: "diagonal-espacial", answer: "7,8102 cm", wrong: "7,8102 cm²" },
    { tool: solidsTool, mode: "volumes", answer: "169,646 cm³", wrong: "169,646 cm²" },
  ])("accepts the requested unit and rejects a different dimension in $mode", ({
    tool,
    mode,
    answer,
    wrong,
  }) => {
    const launch = context(tool, mode);
    const state = tool.activity(launch).initialState;
    expect(tool.assess(launch, state, answer).correct).toBe(true);
    expect(tool.assess(launch, state, wrong).correct).toBe(false);
  });

  it("accepts metres for a completed map route", () => {
    const launch = context(routesTool, "mapas");
    const state = { ...routesTool.activity(launch).initialState, commands: ["N", "N", "E", "E"] };
    expect(routesTool.assess(launch, state, "8 m").correct).toBe(true);
    expect(routesTool.assess(launch, state, "8 m²").correct).toBe(false);
  });

  it("can retain the complete 70-path list permitted by the four-by-four route domain", () => {
    const launch = context(routesTool, "enumerar-caminhos");
    const recorded: Command[][] = [];
    function enumerate(north: number, east: number, prefix: Command[]) {
      if (north === 0 && east === 0) recorded.push(prefix);
      if (north > 0) enumerate(north - 1, east, [...prefix, "N"]);
      if (east > 0) enumerate(north, east - 1, [...prefix, "E"]);
    }
    enumerate(4, 4, []);
    expect(recorded).toHaveLength(70);
    const state = parseRoute(launch, {
      ...routesTool.activity(launch).initialState,
      target: { x: 4, y: 4 },
      recorded,
    });
    expect(routesTool.assess(launch, state, "70").correct).toBe(true);
  });

  it("changes the relevant task data in percentage-fraction and position variants", () => {
    for (const [tool, mode, field] of [
      [ratiosTool, "percentual-como-fracao", "percent"],
      [routesTool, "posicoes", "start"],
    ] as const) {
      expect(tool.activity(context(tool, mode)).initialState[field]).not.toEqual(
        tool.activity(context(tool, mode, 1)).initialState[field],
      );
    }
  });
});
