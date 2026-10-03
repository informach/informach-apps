import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, assertMode, numericChecked } from "./shared";

export const planeModes = ["circulos-medidas-e-angulos", "poligonos-angulos"];
export const circleMetricSchema = z.enum(["circumference", "area", "arc", "sector", "inscribed"]);
export const polygonMetricSchema = z.enum(["sum", "regular", "exterior", "missing"]);
export const planeSchema = z
  .object({
    radius: z.number().int().min(1).max(10),
    angle: z.number().int().min(10).max(350),
    circleMetric: circleMetricSchema,
    sides: z.number().int().min(3).max(12),
    polygonMetric: polygonMetricSchema,
    firstAngle: z.number().int().min(10).max(150),
    secondAngle: z.number().int().min(10).max(150),
  })
  .strict()
  .refine(
    (value) => value.firstAngle + value.secondAngle < 180,
    "Os dois ângulos do triângulo precisam somar menos de 180°.",
  );
export type PlaneState = z.infer<typeof planeSchema>;
export const circleMetrics = {
  circumference: "Comprimento da circunferência (cm)",
  area: "Área do círculo (cm²)",
  arc: "Comprimento do arco (cm)",
  sector: "Área do setor (cm²)",
  inscribed: "Ângulo inscrito (graus)",
};
export const polygonMetrics = {
  sum: "Soma dos ângulos internos (graus)",
  regular: "Um ângulo interno do polígono regular (graus)",
  exterior: "Um ângulo externo do polígono regular (graus)",
  missing: "Terceiro ângulo do triângulo (graus)",
};
export function parsePlane(launch: ToolLaunch, raw: unknown) {
  assertMode(launch, "L18", planeModes);
  return planeSchema.parse(raw);
}
export function planeValue(launch: ToolLaunch, state: PlaneState) {
  if (launch.mode === "poligonos-angulos") {
    switch (state.polygonMetric) {
      case "sum":
        return (state.sides - 2) * 180;
      case "regular":
        return ((state.sides - 2) * 180) / state.sides;
      case "exterior":
        return 360 / state.sides;
      case "missing":
        return 180 - state.firstAngle - state.secondAngle;
    }
  }
  switch (state.circleMetric) {
    case "circumference":
      return 2 * Math.PI * state.radius;
    case "area":
      return Math.PI * state.radius ** 2;
    case "arc":
      return (2 * Math.PI * state.radius * state.angle) / 360;
    case "sector":
      return (Math.PI * state.radius ** 2 * state.angle) / 360;
    case "inscribed":
      return state.angle / 2;
  }
}
export function planeSummary(launch: ToolLaunch, state: PlaneState) {
  if (launch.mode === "poligonos-angulos")
    return state.polygonMetric === "missing"
      ? `Triângulo com ângulos ${state.firstAngle}° e ${state.secondAngle}°. Investigar o terceiro ângulo.`
      : `Polígono convexo regular de ${state.sides} lados, dividido a partir de um vértice em ${state.sides - 2} triângulos. Investigar: ${polygonMetrics[state.polygonMetric]}.`;
  return `Círculo de raio ${state.radius} cm; arco destacado com ângulo central ${state.angle}°. Investigar: ${circleMetrics[state.circleMetric]}.`;
}
export const planeTool: ToolModule = {
  family: "L18",
  modes: planeModes,
  activity(launch) {
    assertMode(launch, "L18", planeModes);
    const initialState: PlaneState = {
      radius: 3 + launch.variant,
      angle: 90 + 30 * launch.variant,
      circleMetric: "circumference",
      sides: 5 + launch.variant,
      polygonMetric: "sum",
      firstAngle: 50 + launch.variant * 10,
      secondAngle: 60,
    };
    const circle = launch.mode === "circulos-medidas-e-angulos";
    return activity(
      circle ? "Em volta, por dentro e sobre o arco" : "De um polígono a vários triângulos",
      circle
        ? "Escolha o que medir: contorno, área, arco, setor ou ângulo inscrito. Mude o raio e o ângulo central, compare duas montagens e responda à medida escolhida. Use π da calculadora e três casas decimais quando precisar. O vértice do ângulo inscrito fica fora do arco destacado."
        : "Escolha uma medida de ângulos. Trace diagonais de um vértice para dividir o polígono convexo em triângulos. Relacione essa divisão com a soma dos ângulos internos. Você também pode descobrir o ângulo que falta em um triângulo.",
      initialState,
      {
        answerLabel: "Valor da medida escolhida",
        answerHint: circle
          ? "A unidade aparece na escolha da medida. Use vírgula ou ponto decimal; tolerância 0,001. Não precisa repetir a unidade."
          : "Responda em graus. Aceita frações e decimal; tolerância 0,001. Não precisa digitar °.",
        rubric: circle
          ? [
              "Diferenciei comprimento e área.",
              "Relacionei o arco à fração da volta completa.",
              "Mantive o vértice inscrito fora do arco medido.",
            ]
          : [
              "Contei os triângulos sem sobreposição.",
              "Diferenciei a soma dos ângulos de um único ângulo.",
              "Usei regularidade apenas quando os ângulos são iguais.",
            ],
      },
    );
  },
  parse: parsePlane,
  assess(launch, raw, answer) {
    const state = parsePlane(launch, raw);
    const reason =
      launch.mode === "poligonos-angulos"
        ? state.polygonMetric === "sum"
          ? "Um polígono convexo de n lados se divide em n−2 triângulos. Cada triângulo soma 180°."
          : state.polygonMetric === "missing"
            ? "Os três ângulos internos do triângulo somam 180°."
            : state.polygonMetric === "exterior"
              ? "Os ângulos externos completam uma volta de 360°; no regular são iguais."
              : "No regular, os ângulos internos são iguais: divida (n−2)·180° por n."
        : state.circleMetric === "inscribed"
          ? "O ângulo inscrito mede metade do ângulo central que enxerga o mesmo arco."
          : state.circleMetric === "arc" || state.circleMetric === "sector"
            ? "O arco ou setor ocupa ângulo/360 da medida completa. Circunferência: 2πr; área: πr²."
            : state.circleMetric === "area"
              ? "A área é πr²: dobrar o raio quadruplica a área."
              : "O contorno é 2πr: dobrar o raio dobra o comprimento.";
    return numericChecked(
      answer,
      planeValue(launch, state),
      reason,
      planeSummary(launch, state),
      0.001,
    );
  },
  summarize: (launch, raw) => planeSummary(launch, parsePlane(launch, raw)),
};
