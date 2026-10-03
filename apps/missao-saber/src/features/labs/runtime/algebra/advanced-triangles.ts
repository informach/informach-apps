import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { formatNumber } from "./math";
import { activity, assertMode, numericChecked } from "./shared";

export const advancedTriangleModes = ["alturas-e-projecoes", "quadrilateros-e-alturas"];
const integer = (min: number, max: number) => z.number().int().min(min).max(max);
export const advancedTriangleSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("projections"),
      p: integer(1, 20),
      q: integer(1, 20),
      target: z.enum(["height", "left", "right", "hypotenuse"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("quadrilateral"),
      shape: z.enum(["rhombus", "right-trapezoid", "isosceles-trapezoid"]),
      base: integer(2, 20),
      top: integer(1, 19),
      side: integer(1, 25),
      diagonal: integer(2, 20),
      otherDiagonal: integer(2, 20),
      known: z.enum(["diagonals", "side-diagonal"]),
      target: z.enum(["height", "area", "side", "diagonal"]),
    })
    .strict(),
]);
export type AdvancedTriangleState = z.infer<typeof advancedTriangleSchema>;
export function parseAdvancedTriangle(launch: ToolLaunch, raw: unknown): AdvancedTriangleState {
  assertMode(launch, "L18", advancedTriangleModes);
  const state = advancedTriangleSchema.parse(raw);
  if ((launch.mode === "alturas-e-projecoes") !== (state.kind === "projections"))
    throw new Error("Figura incompatível com o roteiro.");
  if (state.kind === "quadrilateral") {
    if (state.shape === "rhombus") {
      if (state.known === "side-diagonal" && state.side <= state.diagonal / 2)
        throw new Error("O lado deve superar metade da diagonal conhecida.");
      if (state.target === "height")
        throw new Error("Neste losango, investigue lado, diagonal ou área.");
    } else {
      if (state.base <= state.top) throw new Error("A base maior deve superar a menor.");
      const offset = (state.base - state.top) / (state.shape === "isosceles-trapezoid" ? 2 : 1);
      if (state.side <= offset)
        throw new Error(
          "O lado inclinado precisa superar sua projeção horizontal para existir altura positiva.",
        );
      if (state.target !== "height" && state.target !== "area")
        throw new Error("No trapézio, escolha altura ou área.");
    }
  }
  return state;
}
export function projectionMeasures(state: Extract<AdvancedTriangleState, { kind: "projections" }>) {
  const hypotenuse = state.p + state.q;
  return {
    height: Math.sqrt(state.p * state.q),
    left: Math.sqrt(state.p * hypotenuse),
    right: Math.sqrt(state.q * hypotenuse),
    hypotenuse,
  };
}
export function quadrilateralMeasures(
  state: Extract<AdvancedTriangleState, { kind: "quadrilateral" }>,
) {
  if (state.shape === "rhombus") {
    const diagonal =
      state.known === "diagonals"
        ? state.otherDiagonal
        : 2 * Math.sqrt(state.side ** 2 - (state.diagonal / 2) ** 2);
    const side = Math.hypot(state.diagonal / 2, diagonal / 2);
    return {
      diagonal,
      side,
      height: (state.diagonal * diagonal) / (2 * side),
      area: (state.diagonal * diagonal) / 2,
      offset: 0,
    };
  }
  const offset = (state.base - state.top) / (state.shape === "isosceles-trapezoid" ? 2 : 1),
    height = Math.sqrt(state.side ** 2 - offset ** 2);
  return {
    height,
    area: ((state.base + state.top) * height) / 2,
    side: state.side,
    diagonal: Math.hypot(state.top + offset, height),
    offset,
  };
}
export function advancedTriangleSummary(state: AdvancedTriangleState) {
  const task = {
    height: "altura",
    left: "cateto esquerdo",
    right: "cateto direito",
    hypotenuse: "hipotenusa",
    area: "área",
    side: "lado",
    diagonal: "outra diagonal",
  }[state.target];
  if (state.kind === "projections")
    return `A altura divide a hipotenusa nas projeções p=${state.p} e q=${state.q}. c=p+q; h²=pq; cateto esquerdo²=pc; cateto direito²=qc. Tarefa: ${task}.`;
  const shape = quadrilateralMeasures(state);
  return state.shape === "rhombus"
    ? `Losango: diagonal horizontal ${state.diagonal}; diagonal vertical ${formatNumber(shape.diagonal)}; lado ${formatNumber(shape.side)}. Diagonais perpendiculares se cortam ao meio. Tarefa: ${task}.`
    : `${state.shape === "right-trapezoid" ? "Trapézio retângulo" : "Trapézio isósceles"}: bases ${state.base} e ${state.top}; lado inclinado ${state.side}; projeção ${formatNumber(shape.offset)}; altura perpendicular ${formatNumber(shape.height)}. Tarefa: ${task}.`;
}
export const advancedTrianglesTool: ToolModule = {
  family: "L18",
  modes: advancedTriangleModes,
  activity(launch) {
    assertMode(launch, "L18", advancedTriangleModes);
    const v = launch.variant;
    const state: AdvancedTriangleState =
      launch.mode === "alturas-e-projecoes"
        ? { kind: "projections", p: v ? 4 : 9, q: v ? 9 : 16, target: v ? "left" : "height" }
        : {
            kind: "quadrilateral",
            shape: v ? "rhombus" : "right-trapezoid",
            base: 10,
            top: 6,
            side: 5,
            diagonal: 6,
            otherDiagonal: 8,
            known: "diagonals",
            target: v ? "side" : "area",
          };
    return activity(
      state.kind === "projections"
        ? "A altura encontra a hipotenusa"
        : "Descobrir a altura antes da área",
      state.kind === "projections"
        ? "Mova o pé da altura alterando p e q. Os três triângulos retângulos são semelhantes. Responda a medida selecionada: altura, cateto esquerdo, cateto direito ou hipotenusa. Relacione as projeções com h²=pq e cateto²=projeção·hipotenusa."
        : "Escolha losango ou trapézio. Trace as perpendiculares e use Pitágoras nos triângulos formados. Responda a medida selecionada. No trapézio isósceles, a diferença entre bases é dividida em duas projeções iguais; no retângulo, fica toda em um lado. No losango, cada cateto é metade de uma diagonal.",
      state,
      {
        answerHint:
          "Comprimentos e áreas usam as unidades indicadas; não escreva a unidade. Use 3 casas decimais se precisar.",
      },
    );
  },
  parse: parseAdvancedTriangle,
  summarize(launch, raw) {
    return advancedTriangleSummary(parseAdvancedTriangle(launch, raw));
  },
  assess(launch, raw, answer) {
    const state = parseAdvancedTriangle(launch, raw),
      expected =
        state.kind === "projections"
          ? projectionMeasures(state)[state.target]
          : quadrilateralMeasures(state)[state.target];
    return numericChecked(
      answer,
      expected,
      state.kind === "projections"
        ? "A semelhança dos triângulos produz h²=pq. Não confunda as projeções com os catetos do triângulo maior."
        : "A área depende da altura perpendicular. O lado inclinado só entra em Pitágoras; não pode substituir a altura na fórmula da área.",
      advancedTriangleSummary(state),
      0.001,
    );
  },
};
