import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import {
  expressionDomainCuts,
  expressionPoint,
  formatNumber,
  numberSetAnswer,
  quadraticRoots,
} from "./math";
import { activity, assertMode, checked, normalized, numericChecked } from "./shared";

export const functionModes = [
  "relacao-dominio-imagem",
  "afim",
  "quadratica",
  "ler-transformar-graficos",
  "modelar-compor-inverter",
  "raizes-graficas",
  "retas-inclinacao",
  "intersecoes-sistemas",
  "circunferencia",
  "intersecoes",
  "intervalos-sinais",
];
export const functionStateSchema = z
  .object({
    a: z
      .number()
      .min(-5)
      .max(5)
      .refine((value) => Number.isInteger(value * 2)),
    b: z.number().int().min(-8).max(8),
    c: z.number().int().min(-8).max(8),
    input: z
      .number()
      .min(-10)
      .max(10)
      .refine((value) => Number.isInteger(value * 2)),
    secondSlope: z
      .number()
      .min(-4)
      .max(4)
      .refine((value) => Number.isInteger(value * 2)),
    secondIntercept: z.number().int().min(-8).max(8),
    domainMin: z.number().int().min(-10).max(9),
    domainMax: z.number().int().min(-9).max(10),
    includeMin: z.boolean(),
    includeMax: z.boolean(),
    expression: z.string().trim().min(1).max(120),
    shape: z.enum(["linear", "quadratic", "reciprocal", "sqrt", "log", "expression"]),
    operation: z.enum(["compose", "inverse"]),
  })
  .strict()
  .refine((s) => s.domainMin < s.domainMax, "O início do domínio deve ser menor que o fim.");
export type FunctionState = z.infer<typeof functionStateSchema>;
export function parseFunction(launch: ToolLaunch, raw: unknown) {
  assertMode(launch, "L11", functionModes);
  const state = functionStateSchema.parse(raw);
  expressionDomainCuts(state.expression);
  if (launch.mode === "circunferencia" && state.c < 1) throw new Error("O raio deve ser positivo.");
  return state;
}
export function insideDomain(s: FunctionState, x: number) {
  return (
    (s.includeMin ? x >= s.domainMin : x > s.domainMin) &&
    (s.includeMax ? x <= s.domainMax : x < s.domainMax)
  );
}
export function functionExpression(launch: ToolLaunch, s: FunctionState): string {
  if (
    ["afim", "retas-inclinacao", "intersecoes-sistemas", "modelar-compor-inverter"].includes(
      launch.mode,
    )
  )
    return `${s.a}*x+(${s.b})`;
  if (launch.mode === "ler-transformar-graficos") return `${s.a}*(x-(${s.b}))^2+(${s.c})`;
  if (["quadratica", "raizes-graficas", "intersecoes", "intervalos-sinais"].includes(launch.mode))
    return `${s.a}*x^2+(${s.b})*x+(${s.c})`;
  if (s.shape === "linear") return `${s.a}*x+(${s.b})`;
  if (s.shape === "quadratic") return `${s.a}*x^2+(${s.b})*x+(${s.c})`;
  if (s.shape === "reciprocal") return `${s.a}/(x-(${s.b}))+(${s.c})`;
  if (s.shape === "sqrt") return `${s.a}*sqrt(x-(${s.b}))+(${s.c})`;
  if (s.shape === "log") return `${s.a}*log(x-(${s.b}))+(${s.c})`;
  return s.expression;
}
export function functionPoint(
  launch: ToolLaunch,
  s: FunctionState,
  x: number,
):
  | { value: number; error?: never; limit?: never }
  | { value?: never; error: string; limit?: boolean } {
  if (!insideDomain(s, x)) return { error: "Entrada fora do intervalo de domínio escolhido." };
  return expressionPoint(functionExpression(launch, s), x);
}
export function operationPoint(s: FunctionState, x: number): ReturnType<typeof functionPoint> {
  if (s.operation === "inverse" && s.a === 0) return { error: "sem inversa" };
  const intermediate =
    s.operation === "compose" ? s.secondSlope * x + s.secondIntercept : (x - s.b) / s.a;
  if (!insideDomain(s, intermediate)) return { error: "fora do domínio" };
  return { value: s.operation === "compose" ? s.a * intermediate + s.b : intermediate };
}
export function operationDomain(s: FunctionState) {
  if (s.operation === "inverse") {
    if (s.a === 0) return null;
    const endpoints = [
      { x: s.a * s.domainMin + s.b, included: s.includeMin },
      { x: s.a * s.domainMax + s.b, included: s.includeMax },
    ].sort((left, right) => left.x - right.x);
    return endpoints;
  }
  if (s.secondSlope === 0) return insideDomain(s, s.secondIntercept) ? [] : null;
  return [
    { x: (s.domainMin - s.secondIntercept) / s.secondSlope, included: s.includeMin },
    { x: (s.domainMax - s.secondIntercept) / s.secondSlope, included: s.includeMax },
  ].sort((left, right) => left.x - right.x);
}
export function operationSegments(s: FunctionState) {
  const domain = operationDomain(s);
  if (domain === null) return [];
  const min = Math.max(-10, domain[0]?.x ?? -10),
    max = Math.min(10, domain[1]?.x ?? 10);
  if (min >= max) return [];
  // Domain endpoints are rendered with their own open/closed markers.
  const value = (x: number) =>
    s.operation === "compose"
      ? s.a * (s.secondSlope * x + s.secondIntercept) + s.b
      : (x - s.b) / s.a;
  return [
    { x: min, y: value(min) },
    { x: max, y: value(max) },
  ];
}
export function functionRoots(s: FunctionState) {
  return quadraticRoots(s.a, s.b, s.c).filter((x) => insideDomain(s, x));
}
export function intersections(launch: ToolLaunch, s: FunctionState) {
  const a = launch.mode === "intersecoes-sistemas" ? 0 : s.a;
  const b = (launch.mode === "intersecoes-sistemas" ? s.a : s.b) - s.secondSlope;
  const c = (launch.mode === "intersecoes-sistemas" ? s.b : s.c) - s.secondIntercept;
  return {
    all: a === 0 && b === 0 && c === 0,
    roots: quadraticRoots(a, b, c).filter((x) => insideDomain(s, x)),
  };
}
/** Separate path segments at undefined points and steep jumps; never draw across a pole. */
export function graphSegments(launch: ToolLaunch, s: FunctionState, samples = 320) {
  if (!Number.isInteger(samples) || samples < 10 || samples > 1000)
    throw new Error("Resolução de gráfico inválida.");
  const segments: { x: number; y: number }[][] = [];
  const cuts = expressionDomainCuts(functionExpression(launch, s));
  const inputs = [
    ...new Set([
      ...Array.from({ length: samples + 1 }, (_, index) => -10 + (20 * index) / samples),
      ...cuts.filter((x) => x >= -10 && x <= 10),
      s.domainMin,
      s.domainMax,
    ]),
  ].sort((a, b) => a - b);
  let current: { x: number; y: number }[] = [];
  let previous: number | undefined;
  for (const [index, x] of inputs.entries()) {
    const result = functionPoint(launch, s, x);
    const previousX = inputs[index - 1] ?? x;
    const crossesBoundary = index > 0 && cuts.some((cut) => cut > previousX && cut < x);
    if (
      result.value === undefined ||
      Math.abs(result.value) > 10 ||
      crossesBoundary ||
      (previous !== undefined && Math.abs(result.value - previous) > 3)
    ) {
      if (current.length > 0) segments.push(current);
      current = [];
      previous = result.value;
      continue;
    }
    current.push({ x, y: result.value });
    previous = result.value;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
export function functionSummary(launch: ToolLaunch, s: FunctionState) {
  if (launch.mode === "circunferencia")
    return `Circunferência de centro (${s.a}; ${s.b}) e raio ${s.c}; ponto de teste (${s.input}; ${s.secondIntercept}). Equação (x − ${s.a})² + (y − ${s.b})² = ${s.c ** 2}.`;
  const second =
    ["intersecoes", "intersecoes-sistemas"].includes(launch.mode) ||
    (launch.mode === "modelar-compor-inverter" && s.operation === "compose");
  return `f(x) = ${functionExpression(launch, s)}. Domínio de f ${s.includeMin ? "[" : "]"}${s.domainMin}; ${s.domainMax}${s.includeMax ? "]" : "["}, respeitando as restrições da expressão. Entrada ${s.input}.${second ? ` g(x) = ${s.secondSlope}x + ${s.secondIntercept}, definida para todo real.` : ""}${launch.mode === "modelar-compor-inverter" ? (s.operation === "inverse" ? " Investigar f⁻¹: sua entrada deve pertencer à imagem de f." : " Investigar f(g(x)): g(x) deve pertencer ao domínio de f.") : ""}`;
}
export const functionsTool: ToolModule = {
  family: "L11",
  modes: functionModes,
  activity(launch) {
    assertMode(launch, "L11", functionModes);
    const v = launch.variant;
    const state: FunctionState = {
      a: launch.mode === "afim" || launch.mode === "retas-inclinacao" ? 2 + v : 1,
      b: launch.mode === "ler-transformar-graficos" ? 1 + v : 0,
      c: launch.mode === "circunferencia" ? 3 + v : -4 - v * 2,
      input: 3 + v,
      secondSlope: v,
      secondIntercept: 0,
      domainMin: -8,
      domainMax: 8,
      includeMin: true,
      includeMax: true,
      expression: "1/(x-1)",
      shape: v ? "sqrt" : "linear",
      operation: "compose",
    };
    let prompt =
      "Mude a entrada e os parâmetros. Qual é f(x) na entrada indicada? O intervalo escolhido e as restrições da expressão precisam permitir a entrada; se não permitirem, responda “fora do domínio”. Se um cálculo superar o limite numérico de 10¹² da ferramenta, responda “fora dos limites”: isso não significa que a função esteja fora do domínio matemático.";
    if (launch.mode === "retas-inclinacao")
      prompt =
        "Observe a reta e dois pontos separados por uma unidade na horizontal. Qual é a inclinação Δy/Δx? Compare retas crescentes, decrescentes e horizontais.";
    if (["raizes-graficas", "quadratica"].includes(launch.mode))
      prompt =
        "Encontre todas as raízes reais distintas de f dentro do domínio escolhido. Separe os valores por ponto e vírgula, ou escreva “nenhuma” ou “todos”. Use até 3 casas decimais. Uma tangência ao eixo também é uma raiz.";
    if (["intersecoes", "intersecoes-sistemas"].includes(launch.mode))
      prompt =
        "Onde as duas curvas se encontram dentro do domínio escolhido? Escreva os valores de x distintos separados por ponto e vírgula. Use “nenhuma” ou “todos” quando necessário.";
    if (launch.mode === "modelar-compor-inverter")
      prompt =
        "Escolha composição f(g(x)) ou inversa f⁻¹(x). Qual é o resultado na entrada indicada? Confira as etapas e o domínio. Uma função constante não tem inversa: nesse caso, escreva “sem inversa”; se a entrada ou resultado exigido não pertencer ao domínio, escreva “fora do domínio”.";
    if (launch.mode === "intervalos-sinais")
      prompt =
        "A raiz separa intervalos de sinal, mas o sinal pode permanecer igual ao atravessar uma raiz dupla. Na entrada indicada, f(x) é positiva, negativa ou zero? Se a entrada estiver excluída, escolha “fora do domínio”.";
    if (launch.mode === "circunferencia")
      prompt =
        "Mova o centro, o raio e o ponto de teste. O ponto está dentro, sobre ou fora da circunferência? Compare a distância ao centro com o raio. Uma circunferência inteira não é o gráfico de uma única função y=f(x).";
    return activity(
      launch.mode === "circunferencia"
        ? "Circunferência no plano"
        : launch.mode === "relacao-dominio-imagem"
          ? "Máquina, tabela e domínio"
          : "A expressão vira gráfico",
      prompt,
      state,
      {
        choices:
          launch.mode === "intervalos-sinais"
            ? ["positiva", "negativa", "zero", "fora do domínio"]
            : launch.mode === "circunferencia"
              ? ["dentro", "sobre", "fora"]
              : undefined,
        rubric: [
          "Relacionar entrada, expressão, tabela e gráfico.",
          "Respeitar domínio e extremos abertos ou fechados.",
          "Distinguir interseção, raiz e valor de saída.",
        ],
      },
    );
  },
  parse: parseFunction,
  summarize(launch, raw) {
    return functionSummary(launch, parseFunction(launch, raw));
  },
  assess(launch, raw, answer) {
    const s = parseFunction(launch, raw),
      m = launch.mode,
      summary = functionSummary(launch, s);
    if (m === "retas-inclinacao")
      return numericChecked(
        answer,
        s.a,
        "A inclinação é a razão entre variação vertical e horizontal, não a altura em que a reta cruza o eixo y.",
        summary,
      );
    if (["raizes-graficas", "quadratica", "intersecoes", "intersecoes-sistemas"].includes(m)) {
      const result = ["intersecoes", "intersecoes-sistemas"].includes(m)
        ? intersections(launch, s)
        : { all: s.a === 0 && s.b === 0 && s.c === 0, roots: functionRoots(s) };
      return checked(
        result.all
          ? normalized(answer) === "todos"
          : result.roots.length
            ? numberSetAnswer(answer, result.roots, 0.001)
            : normalized(answer) === "nenhuma",
        result.all
          ? "todos"
          : result.roots.length
            ? result.roots.map(formatNumber).join("; ")
            : "nenhuma",
        "Resolva a igualdade algebricamente e mantenha apenas valores no domínio, respeitando extremos excluídos. O recorte visível do gráfico não define sozinho o conjunto de soluções.",
        summary,
      );
    }
    if (m === "circunferencia") {
      const squared = (s.input - s.a) ** 2 + (s.secondIntercept - s.b) ** 2;
      const expected = squared === s.c ** 2 ? "sobre" : squared < s.c ** 2 ? "dentro" : "fora";
      return checked(
        normalized(answer) === expected,
        expected,
        `A distância ao quadrado é ${squared}; o raio ao quadrado é ${s.c ** 2}.`,
        summary,
      );
    }
    if (m === "modelar-compor-inverter") {
      const result = operationPoint(s, s.input);
      if (result.error === "sem inversa")
        return checked(
          normalized(answer) === "sem inversa",
          "sem inversa",
          "Uma função constante não permite recuperar uma entrada única a partir da saída.",
          summary,
        );
      const intermediate =
        s.operation === "compose"
          ? s.secondSlope * s.input + s.secondIntercept
          : (s.input - s.b) / s.a;
      if (result.value === undefined)
        return checked(
          normalized(answer) === "fora do dominio",
          "fora do domínio",
          "Na composição, g(x) precisa pertencer ao domínio de f. Na inversa, o valor recuperado precisa ser uma entrada válida de f.",
          summary,
        );
      return numericChecked(
        answer,
        result.value,
        s.operation === "compose"
          ? `Primeiro g(x) = ${formatNumber(intermediate)}; depois aplique f a esse resultado.`
          : "Resolva y = a·x + b para recuperar x = (y − b)/a, verificando o domínio.",
        summary,
      );
    }
    const result = functionPoint(launch, s, s.input);
    if (result.error)
      return checked(
        normalized(answer) === (result.limit ? "fora dos limites" : "fora do dominio"),
        result.limit ? "fora dos limites" : "fora do domínio",
        result.error,
        summary,
      );
    const value = result.value;
    if (value === undefined) throw new Error("Ponto sem resultado matemático.");
    if (m === "intervalos-sinais") {
      const expected = value === 0 ? "zero" : value > 0 ? "positiva" : "negativa";
      return checked(
        normalized(answer) === expected,
        expected,
        `Na entrada atual, f(x) = ${formatNumber(value)}. Os pontos em que f(x)=0 não são estritamente positivos nem negativos.`,
        summary,
      );
    }
    return numericChecked(
      answer,
      value,
      "Substitua a entrada na expressão e respeite a ordem das operações. Aceitamos aproximação com erro absoluto até 0,001.",
      summary,
      0.001,
    );
  },
};
