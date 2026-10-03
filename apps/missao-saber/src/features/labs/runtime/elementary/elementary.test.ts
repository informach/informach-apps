import { describe, expect, it } from "vitest";
import type { ToolLaunch, ToolModule } from "../types";
import { countingTool, countingValue, parseCounting } from "./counting";
import { fractionsTool, paintedFraction, paintedMeasure, parseFractions } from "./fractions";
import {
  cellMeasures,
  geometryTool,
  parseGeometry,
  polygonArea,
  squaresBySize,
  tileDeficientBoard,
  triminoCells,
} from "./geometry";
import { elementaryTools } from "./index";
import { adaptLegacyBars, adaptLegacyGrid } from "./legacy";
import { equalRational, fractionText, rational, readRational } from "./math";
import { calendarArrival, measuresTool, measureValue, parseMeasure } from "./measures";
import { parseRatios, ratiosTool, ratioValue, successiveValues } from "./ratios";
import {
  monotonePaths,
  parseRoute,
  routesTool,
  routeValue,
  shortestRoute,
  traceRoute,
} from "./routes";
import {
  cuboidSection,
  horizontalSection,
  parseSolid,
  polyhedronCounts,
  projectedHeights,
  rotatedStacks,
  sectionArea,
  solidSurface,
  solidsTool,
  solidValue,
  solidVolume,
} from "./solids";
import {
  hasRotationalSymmetry,
  hasSymmetryAxis,
  parseTransform,
  reflectPoint,
  rotatePoint,
  transformedPoint,
  transformsTool,
  transformValue,
} from "./transforms";

function launch(tool: ToolModule, mode: string, variant: 0 | 1 = 0): ToolLaunch {
  return { family: tool.family, mode, grade: 6, variant };
}
describe("elementary tool contracts", () => {
  it("publishes concrete, validated investigations and different transfer cases for all modes", () => {
    expect(elementaryTools.map((tool) => tool.family)).toEqual([
      "L01",
      "L02",
      "L03",
      "L04",
      "L05",
      "L06",
      "L07",
      "L19",
    ]);
    for (const tool of elementaryTools) {
      expect(new Set(tool.modes).size).toBe(tool.modes.length);
      for (const mode of tool.modes) {
        const primary = tool.activity(launch(tool, mode));
        const transfer = tool.activity(launch(tool, mode, 1));
        expect(primary.prompt.length, `${tool.family}.${mode}`).toBeGreaterThan(30);
        expect(primary.initialState, `${tool.family}.${mode} needs a new case`).not.toEqual(
          transfer.initialState,
        );
        for (const variant of [0, 1] as const) {
          const context = launch(tool, mode, variant);
          const activity = tool.activity(context);
          const state = tool.parse(context, activity.initialState);
          expect(tool.summarize(context, state).length).toBeGreaterThan(10);
          expect(tool.assess(context, state, "").correct).not.toBe(true);
          expect(() => tool.parse(context, { ...state, injected: true })).toThrow();
          expect(() =>
            tool.parse(context, {
              ...state,
              ...Object.fromEntries(Object.keys(state).map((key) => [key, null])),
            }),
          ).toThrow();
        }
      }
      expect(() => tool.activity(launch(tool, "missing-mode"))).toThrow();
    }
  });
});

describe("rational input and fraction construction", () => {
  it.each([
    "1/2",
    "2/4",
    "0,5",
    "0.5",
    ".5",
    "0,50",
    " 1 / 2 ",
  ])("accepts equivalent input %s exactly", (value) => {
    const actual = readRational(value);
    expect(actual).not.toBeNull();
    if (actual) expect(equalRational(actual, rational(1n, 2n))).toBe(true);
  });
  it.each([
    "",
    "1/0",
    "1/2/3",
    "Infinity",
    "0x10",
    "1e3",
    "Math.random()",
    "1,2,3",
    "1 m",
  ])("rejects invalid or unconfigured input %s", (value) => {
    expect(readRational(value)).toBeNull();
  });
  it("uses area weights rather than the number of painted regions and accepts implicit metres", () => {
    const context = launch(fractionsTool, "fracao-decimal-unidade");
    const state = parseFractions(context, fractionsTool.activity(context).initialState);
    state.first.painted = [true, true, false, false];
    expect(fractionText(paintedFraction(state.first))).toBe("1/4");
    expect(fractionsTool.assess(context, state, "1/2").correct).toBe(false);
    state.first.painted = [false, false, false, true];
    for (const answer of ["1/2", "0,5", "0.5", "0,5 m"])
      expect(fractionsTool.assess(context, state, answer).correct).toBe(true);
    expect(() =>
      parseFractions(context, { ...state, first: { ...state.first, whole: 2 } }),
    ).toThrow();
    expect(() =>
      parseFractions(context, { ...state, first: { ...state.first, painted: [] } }),
    ).toThrow();
  });
  it("preserves the distinction between equal fractions and equal measured quantities", () => {
    const context = launch(fractionsTool, "comparar-referencias");
    const state = parseFractions(context, fractionsTool.activity(context).initialState);
    state.first.painted = [false, false, false, true];
    expect(fractionText(paintedMeasure(state.first))).toBe("1/2");
    expect(fractionText(paintedMeasure(state.second))).toBe("1");
    expect(fractionsTool.assess(context, state, "1/2").correct).toBe(true);
    state.first.painted = [true, false, false, false];
    expect(fractionsTool.assess(context, state, "7/8").correct).toBe(false);
  });
  it("adds measured amounts with different reference wholes exactly", () => {
    const context = launch(fractionsTool, "operacoes-e-receitas");
    const state = parseFractions(context, fractionsTool.activity(context).initialState);
    state.first = { whole: 2, pieces: [1, 1, 1], painted: [true, false, false] };
    state.second = { whole: 1, pieces: [1, 1, 1, 1], painted: [true, false, false, false] };
    expect(fractionsTool.assess(context, state, "11/12").correct).toBe(true);
    expect(fractionsTool.assess(context, state, "7/12").correct).toBe(false);
  });
  it("does not claim to prove a free explanation", () => {
    const context = launch(fractionsTool, "argumentar-referencias");
    expect(
      fractionsTool.assess(
        context,
        fractionsTool.activity(context).initialState,
        "qualquer explicação",
      ).correct,
    ).toBeNull();
  });
  it("covers a part, its complement, an inverse whole and division without conflating operations", () => {
    const quantity = launch(fractionsTool, "fracao-de-quantidade");
    const state = parseFractions(quantity, fractionsTool.activity(quantity).initialState);
    state.first = { whole: 1, pieces: [1, 1, 1, 1, 1], painted: [true, true, true, false, false] };
    state.quantity = 18;
    expect(fractionsTool.assess(quantity, state, "10,8").correct).toBe(true);
    expect(
      fractionsTool.assess(launch(fractionsTool, "recuperar-inteiro"), state, "30").correct,
    ).toBe(true);
    expect(
      fractionsTool.assess(launch(fractionsTool, "complemento-do-inteiro"), state, "2/5").correct,
    ).toBe(true);
    state.first = { whole: 3, pieces: [1, 1], painted: [true, true] };
    state.second = { whole: 1, pieces: [1, 1], painted: [true, false] };
    expect(
      fractionsTool.assess(launch(fractionsTool, "dividir-por-fracao"), state, "6").correct,
    ).toBe(true);
    state.second.painted = [false, false];
    expect(
      fractionsTool.assess(launch(fractionsTool, "dividir-por-fracao"), state, "0").correct,
    ).toBe(false);
  });
});

describe("counting and proportionality", () => {
  it("conserves total across complete groups and remainders", () => {
    const groups = launch(countingTool, "agrupar-e-contar");
    const remainder = launch(countingTool, "repartir-com-sobras");
    const state = parseCounting(groups, countingTool.activity(groups).initialState);
    expect(countingValue(groups, state)).toBe(4);
    expect(countingValue(remainder, state)).toBe(1);
    expect(countingValue(groups, state) * state.groupSize + countingValue(remainder, state)).toBe(
      17,
    );
    expect(() => parseCounting(groups, { ...state, removed: 18 })).toThrow();
    expect(() => parseCounting(launch(countingTool, "dobro-metade-grupos"), state)).toThrow();
  });
  it("adds jumps from a nonzero starting point", () => {
    const context = launch(countingTool, "pulos-na-reta");
    const state = parseCounting(context, countingTool.activity(context).initialState);
    expect(countingTool.assess(context, state, "14").correct).toBe(true);
  });
  it("separates sharing among people from the number of complete groups", () => {
    const context = launch(countingTool, "partilha");
    const state = parseCounting(context, countingTool.activity(context).initialState);
    expect(countingValue(context, { ...state, total: 12, groupSize: 3 })).toBe(4);
    expect(countingValue(context, { ...state, total: 14, groupSize: 3 })).toBe(4);
  });
  it("multiplies successive factors instead of summing discounts", () => {
    const state = adaptLegacyBars({ kind: "bars", initial: 200, first: 20, second: 10 });
    expect(successiveValues(state)).toEqual({ intermediate: 160, final: 144 });
    const context = launch(ratiosTool, "aumento-e-desconto");
    expect(ratioValue(context, { ...state, change: 20, secondChange: -20 })).toBe(192);
    const decimalLegacy = adaptLegacyBars({ kind: "bars", initial: 99.5, first: 12.5, second: 0 });
    expect(decimalLegacy.base).toBe(99.5);
    expect(decimalLegacy.change).toBe(-12.5);
  });
  it("handles more than 100%, inverse work, and a recovered base", () => {
    const percent = launch(ratiosTool, "base-e-acima-de-cem");
    const state = parseRatios(percent, ratiosTool.activity(percent).initialState);
    expect(ratioValue(percent, state)).toBe(300);
    expect(
      ratioValue(launch(ratiosTool, "inversa-produto-constante"), {
        ...state,
        work: 24,
        workers: 6,
      }),
    ).toBe(4);
    expect(
      ratioValue(launch(ratiosTool, "recuperar-base"), { ...state, base: 160, change: -20 }),
    ).toBe(200);
    expect(
      ratiosTool.assess(
        launch(ratiosTool, "parte-parte-e-todo"),
        { ...state, partA: 1, partB: 2 },
        "33,3333",
      ).correct,
    ).toBe(true);
  });
  it("distinguishes percentage points, relative change and part-of-part multiplication", () => {
    const context = launch(ratiosTool, "pontos-percentuais");
    const state = parseRatios(context, ratiosTool.activity(context).initialState);
    expect(ratioValue(context, { ...state, percent: 80, otherPercent: 90 })).toBe(10);
    expect(
      ratioValue(launch(ratiosTool, "taxa-de-variacao"), { ...state, base: 80, otherBase: 90 }),
    ).toBe(12.5);
    expect(
      ratioValue(launch(ratiosTool, "porcentagem-de-porcentagem"), {
        ...state,
        percent: 60,
        otherPercent: 25,
      }),
    ).toBe(15);
    expect(
      ratioValue(launch(ratiosTool, "parte-e-base"), { ...state, base: 18, percent: 30 }),
    ).toBe(60);
  });
});

describe("measures and geometry", () => {
  it("handles midnight explicitly and rejects a contradictory clock state", () => {
    const context = launch(measuresTool, "relogio-e-duracao", 1);
    const state = parseMeasure(context, measuresTool.activity(context).initialState);
    expect(measureValue(context, state)).toBe(45);
    expect(() => parseMeasure(context, { ...state, nextDay: false })).toThrow();
  });
  it("crosses month boundaries without counting the departure day twice", () => {
    expect(calendarArrival({ day: 29, daysLater: 6 })).toEqual({ day: 4, month: "novembro" });
    expect(calendarArrival({ day: 31, daysLater: 30 })).toEqual({ day: 30, month: "novembro" });
  });
  it("converts dimensions correctly and measures from a nonzero ruler mark", () => {
    const context = launch(measuresTool, "regua-e-comprimentos");
    const state = parseMeasure(context, measuresTool.activity(context).initialState);
    expect(measureValue(context, state)).toBe(8);
    expect(
      measureValue(launch(measuresTool, "conversoes"), { ...state, amount: 250, unit: "m" }),
    ).toBe(2.5);
    expect(
      measureValue(launch(measuresTool, "massas-capacidades"), {
        ...state,
        amount: 250,
        unit: "kg",
      }),
    ).toBe(0.25);
    expect(() =>
      parseMeasure(launch(measuresTool, "conversoes"), { ...state, unit: "kg" }),
    ).toThrow();
  });
  it("counts shared boundaries and holes once on each exposed side", () => {
    expect(cellMeasures([true, true], 2)).toEqual({
      area: 2,
      perimeter: 6,
      dark: 1,
      light: 1,
      shared: 1,
    });
    expect(cellMeasures([true, false, true], 3).perimeter).toBe(8);
    expect(cellMeasures([true, true, true, true, false, true, true, true, true], 3)).toMatchObject({
      area: 8,
      perimeter: 16,
      dark: 4,
      light: 4,
    });
  });
  it("imports the old board without joining cells across old row boundaries", () => {
    const cells = Array.from(
      { length: 20 },
      (_, index) => index === 4 || index === 5 || index === 10,
    );
    const migrated = adaptLegacyGrid({ kind: "grid", cells });
    expect(cellMeasures(migrated.cells)).toMatchObject({ area: 3, perimeter: 10 });
    expect(cellMeasures(migrated.cells).area).toBe(cellMeasures(cells, 5).area);
    expect(cellMeasures(migrated.cells).perimeter).toBe(cellMeasures(cells, 5).perimeter);
  });
  it("uses coordinate area and rejects a degenerate triangle", () => {
    expect(
      polygonArea([
        { x: 1, y: 1 },
        { x: 5, y: 1 },
        { x: 2, y: 4 },
      ]),
    ).toBe(6);
    const context = launch(geometryTool, "area-coordenadas");
    const state = geometryTool.activity(context).initialState;
    expect(() =>
      parseGeometry(context, {
        ...state,
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ],
      }),
    ).toThrow();
  });
  it("counts composed squares without counting only unit cells", () => {
    expect(squaresBySize([true, true, true, true], 2)).toEqual([4, 1]);
    expect(
      squaresBySize(
        Array.from({ length: 9 }, () => true),
        3,
      ),
    ).toEqual([9, 4, 1]);
    expect(squaresBySize([true, true, true, false], 2)).toEqual([3, 0]);
  });
  it("every valid L-trimino position covers two colours with a 2:1 split", () => {
    for (let row = 0; row <= 4; row++)
      for (let column = 0; column <= 4; column++)
        for (let turn = 0; turn < 4; turn++) {
          const measure = cellMeasures(triminoCells(row, column, turn));
          expect(measure.area).toBe(3);
          expect(measure.perimeter).toBe(8);
          expect([measure.dark, measure.light].sort()).toEqual([1, 2]);
        }
  });
  it("constructs a disjoint L-trimino tiling for every missing cell on 2, 4 and 8 boards", () => {
    for (const power of [1, 2, 3]) {
      const size = 2 ** power;
      for (let row = 0; row < size; row++)
        for (let column = 0; column < size; column++) {
          const tiles = tileDeficientBoard(power, { x: column, y: row });
          expect(tiles).toHaveLength((size * size - 1) / 3);
          const covered = new Set<string>();
          for (const tile of tiles) {
            expect(tile).toHaveLength(3);
            expect(
              Math.max(...tile.map((point) => point.x)) - Math.min(...tile.map((point) => point.x)),
            ).toBe(1);
            expect(
              Math.max(...tile.map((point) => point.y)) - Math.min(...tile.map((point) => point.y)),
            ).toBe(1);
            for (const point of tile) {
              const key = `${point.x},${point.y}`;
              expect(covered.has(key)).toBe(false);
              expect(key).not.toBe(`${column},${row}`);
              covered.add(key);
            }
          }
          expect(covered.size).toBe(size * size - 1);
        }
    }
  });
});

describe("transformations and paths", () => {
  it("preserves distance in rotations and reverses only the perpendicular coordinate in a mirror", () => {
    expect(reflectPoint({ x: 3, y: 1 }, "vertical")).toEqual({ x: -3, y: 1 });
    expect(reflectPoint({ x: 3, y: 1 }, "horizontal")).toEqual({ x: 3, y: -1 });
    expect(rotatePoint({ x: 3, y: 1 }, 1)).toEqual({ x: -1, y: 3 });
    for (let turns = 0; turns < 4; turns++) {
      const point = rotatePoint({ x: 3, y: 1 }, turns);
      expect(point.x ** 2 + point.y ** 2).toBe(10);
    }
  });
  it("composes in the stated order and squares the area scale", () => {
    const context = launch(transformsTool, "compor-transformacoes");
    const state = parseTransform(context, transformsTool.activity(context).initialState);
    expect(transformedPoint(context, state)).toEqual({ x: 1, y: -3 });
    expect(transformValue(launch(transformsTool, "escala-e-area"), state)).toBe(24);
    expect(transformValue(launch(transformsTool, "tales"), { ...state, far: 5 })).toBe(7.5);
    expect(
      transformedPoint(context, { ...state, secondReflection: true, turns: 0, tx: 0, ty: 0 }),
    ).toEqual({ x: state.x, y: state.y });
    expect(transformValue(launch(transformsTool, "escala-e-area"), { ...state, scale: 0.5 })).toBe(
      1.5,
    );
  });
  it("distinguishes reflection axes from rotational symmetry of whole figures", () => {
    const context = launch(transformsTool, "simetria-de-figuras");
    const state = parseTransform(context, transformsTool.activity(context).initialState);
    expect(hasSymmetryAxis({ ...state, figure: "quadrado", axisAngle: 45 })).toBe(true);
    expect(hasSymmetryAxis({ ...state, figure: "retangulo", axisAngle: 45 })).toBe(false);
    expect(hasSymmetryAxis({ ...state, figure: "triangulo-equilatero", axisAngle: 30 })).toBe(true);
    expect(hasSymmetryAxis({ ...state, figure: "triangulo-equilatero", axisAngle: 0 })).toBe(false);
    expect(hasRotationalSymmetry({ ...state, figure: "retangulo", turns: 1 })).toBe(false);
    expect(hasRotationalSymmetry({ ...state, figure: "paralelogramo", turns: 2 })).toBe(true);
  });
  it("counts every monotone path and respects a blocked middle point", () => {
    const state = { start: { x: 0, y: 0 }, target: { x: 2, y: 2 }, obstacles: [] };
    expect(monotonePaths(state)).toBe(6);
    expect(monotonePaths({ ...state, obstacles: [{ x: 1, y: 1 }] })).toBe(2);
    expect(
      shortestRoute({
        ...state,
        obstacles: [
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      }),
    ).toBe(4);
  });
  it("distinguishes walked distance from displacement and rejects invalid or duplicate routes", () => {
    const context = launch(routesTool, "deslocamentos-caminhos");
    const state = parseRoute(context, routesTool.activity(context).initialState);
    const walked = parseRoute(context, { ...state, commands: ["E", "W", "N", "S"] });
    expect(traceRoute(walked)).toMatchObject({ point: { x: 0, y: 0 }, steps: 4 });
    expect(routeValue(context, walked)).toBe(0);
    expect(() =>
      parseRoute(context, { ...state, commands: ["W", "W", "W", "W", "W", "W"] }),
    ).toThrow();
    const count = launch(routesTool, "enumerar-caminhos");
    const countState = routesTool.activity(count).initialState;
    expect(() =>
      parseRoute(count, {
        ...countState,
        recorded: [
          ["N", "N", "E", "E"],
          ["N", "N", "E", "E"],
        ],
      }),
    ).toThrow();
  });
  it("requires reaching the target before accepting a path answer", () => {
    const context = launch(routesTool, "passos");
    const state = routesTool.activity(context).initialState;
    expect(routesTool.assess(context, state, "0").correct).toBe(false);
    expect(
      routesTool.assess(context, { ...state, commands: ["N", "N", "E", "E"] }, "4").correct,
    ).toBe(true);
  });
});

describe("solids, projections and packaging", () => {
  it("keeps count under rotation while orthographic views hide stacked cubes", () => {
    const context = launch(solidsTool, "vistas");
    const state = parseSolid(context, solidsTool.activity(context).initialState);
    state.stacks = [1, 2, 0, 3, 1, 0, 0, 0, 0];
    expect(state.stacks.reduce((a, b) => a + b, 0)).toBe(7);
    expect(projectedHeights(state)).toEqual([3, 2, 0]);
    expect(projectedHeights({ ...state, view: "cima" }).reduce((a, b) => a + b, 0)).toBe(4);
    expect(rotatedStacks(state.stacks, 4)).toEqual(state.stacks);
  });
  it("uses the right surface and volume formulas, including cone and sphere", () => {
    const context = launch(solidsTool, "volumes");
    const state = parseSolid(context, solidsTool.activity(context).initialState);
    expect(solidVolume({ ...state, shape: "bloco", width: 3, depth: 4, height: 5 })).toBe(60);
    expect(solidSurface({ ...state, shape: "bloco", width: 3, depth: 4, height: 5 })).toBe(94);
    expect(solidVolume({ ...state, shape: "cone" })).toBeCloseTo(
      solidVolume({ ...state, shape: "cilindro" }) / 3,
    );
    expect(solidVolume({ ...state, shape: "esfera", radius: 3 })).toBeCloseTo(36 * Math.PI);
    expect(solidSurface({ ...state, shape: "esfera", radius: 3 })).toBeCloseTo(36 * Math.PI);
    expect(solidSurface({ ...state, shape: "piramide", width: 6, depth: 6, height: 4 })).toBe(96);
  });
  it("calculates a spherical cut by radius and rejects curved solids from Euler mode", () => {
    const context = launch(solidsTool, "cortes-vistas-projecoes");
    const state = parseSolid(context, solidsTool.activity(context).initialState);
    expect(horizontalSection({ ...state, shape: "esfera", radius: 5, cut: 60 })).toBeCloseTo(
      16 * Math.PI,
    );
    expect(horizontalSection({ ...state, shape: "cone", radius: 4, cut: 50 })).toBeCloseTo(
      4 * Math.PI,
    );
    expect(horizontalSection({ ...state, shape: "esfera", cut: 100 })).toBe(0);
    expect(polyhedronCounts("tetraedro")).toEqual({ vertices: 4, edges: 6, faces: 4 });
    expect(() =>
      parseSolid(launch(solidsTool, "poliedros-euler"), { ...state, shape: "cilindro" }),
    ).toThrow();
  });
  it("counts whole boxes per dimension instead of dividing total volumes", () => {
    const context = launch(solidsTool, "coordenadas-capacidade-embalagem");
    const state = parseSolid(context, solidsTool.activity(context).initialState);
    const packed = { ...state, width: 5, depth: 5, height: 5, packing: 3 };
    expect(solidValue(context, packed)).toBe(1);
    expect(Math.floor(solidVolume(packed) / 27)).toBe(4);
  });
  it("intersects a real oblique plane with cuboid edges to produce triangles and hexagons", () => {
    const context = launch(solidsTool, "cortes-obliquos");
    const state = parseSolid(context, solidsTool.activity(context).initialState);
    const cube = { ...state, width: 1, depth: 1, height: 1, cut: 50 };
    const hexagon = cuboidSection(cube);
    expect(hexagon).toHaveLength(6);
    expect(sectionArea(hexagon)).toBeCloseTo((3 * Math.sqrt(3)) / 4);
    const triangle = cuboidSection({ ...cube, height: 2, cut: 25 });
    expect(triangle).toHaveLength(3);
    expect(sectionArea(triangle)).toBeCloseTo(Math.sqrt(3) / 2);
    const rectangle = cuboidSection({
      ...cube,
      width: 3,
      depth: 4,
      normalX: 0,
      normalY: 0,
      normalZ: 1,
    });
    expect(rectangle).toHaveLength(4);
    expect(sectionArea(rectangle)).toBe(12);
    expect(cuboidSection({ ...cube, cut: 0 })).toHaveLength(1);
    expect(() => parseSolid(context, { ...cube, normalX: 0, normalY: 0, normalZ: 0 })).toThrow();
  });
});
