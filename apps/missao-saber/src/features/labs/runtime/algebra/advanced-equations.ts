import { intervalAnswer } from "./intervals";

export { intervalAnswer } from "./intervals";

import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import {
  formatNumber,
  fraction,
  fractionNumber,
  numberSetAnswer,
  quadraticRoots,
  readFraction,
} from "./math";
import {
  factoredCoefficients,
  fractionText,
  polynomialDegree,
  polynomialDivision,
  polynomialText,
  rationalAnswer,
  rationalPolynomialValue,
  rationalRootCandidates,
} from "./polynomial-math";
import { activity, assertMode, checked, normalized, numericChecked } from "./shared";

export const advancedEquationModes = [
  "polinomios-gerais",
  "raizes-e-relacoes",
  "potencias-e-restos-polinomiais",
  "identidades-simetricas",
  "radical-com-incognita",
  "substituicoes-quadraticas",
  "modulo-distancias",
  "sistemas-nao-lineares",
];
const integer = (min: number, max: number) => z.number().int().min(min).max(max);
export const advancedEquationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("polynomial"),
      coefficients: z.array(integer(-20, 20)).length(6),
      divisor: z.array(integer(-6, 6)).length(3),
      input: z
        .number()
        .min(-5)
        .max(5)
        .refine((n) => Number.isInteger(n * 2)),
      target: z.enum(["value", "degree", "coefficient-sum", "remainder", "quotient", "candidates"]),
      coefficient: integer(0, 5),
    })
    .strict(),
  z
    .object({
      kind: z.literal("roots"),
      roots: z.array(integer(-5, 5)).min(1).max(5),
      leading: integer(-4, 4).refine((n) => n !== 0),
      target: z.enum(["roots", "sum", "product", "pairs", "squares", "reciprocals", "coefficient"]),
      coefficient: integer(0, 5),
    })
    .strict(),
  z
    .object({
      kind: z.literal("power"),
      exponent: integer(1, 100),
      root: integer(-3, 3),
      factor: integer(-5, 5),
      constant: integer(-10, 10),
    })
    .strict(),
  z
    .object({
      kind: z.literal("identity"),
      sum: integer(-20, 20),
      product: integer(-100, 100),
      left: integer(-20, 20),
      right: integer(-20, 20),
      target: z.enum(["squares", "cubes", "difference", "difference-squares"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("radical"),
      a: integer(-5, 5).refine((n) => n !== 0),
      b: integer(-12, 12),
      c: integer(-3, 3),
      d: integer(-12, 12),
    })
    .strict(),
  z
    .object({
      kind: z.literal("substitution"),
      a: integer(-4, 4).refine((n) => n !== 0),
      b: integer(-16, 16),
      c: integer(-20, 20),
      innerLinear: integer(-6, 6),
    })
    .strict(),
  z
    .object({
      kind: z.literal("absolute"),
      a: integer(-4, 4).refine((n) => n !== 0),
      b: integer(-10, 10),
      radius: integer(-4, 12),
      p: integer(-10, 10),
      q: integer(-10, 10),
      probe: z
        .number()
        .min(-15)
        .max(15)
        .refine((n) => Number.isInteger(n * 2)),
      target: z.enum(["equation", "strict", "closed", "minimum"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("nonlinear"),
      model: z.enum(["sum-product", "line-circle"]),
      sum: integer(-12, 12),
      product: integer(-20, 20),
      slope: integer(-3, 3),
      intercept: integer(-8, 8),
      radius: integer(1, 10),
      centerX: integer(-5, 5),
      centerY: integer(-5, 5),
      target: z.enum(["count", "pairs"]),
    })
    .strict(),
]);
export type AdvancedEquationState = z.infer<typeof advancedEquationSchema>;
const kinds: Record<string, AdvancedEquationState["kind"]> = {
  "polinomios-gerais": "polynomial",
  "raizes-e-relacoes": "roots",
  "potencias-e-restos-polinomiais": "power",
  "identidades-simetricas": "identity",
  "radical-com-incognita": "radical",
  "substituicoes-quadraticas": "substitution",
  "modulo-distancias": "absolute",
  "sistemas-nao-lineares": "nonlinear",
};
export function parseAdvancedEquation(launch: ToolLaunch, raw: unknown): AdvancedEquationState {
  assertMode(launch, "L08", advancedEquationModes);
  const state = advancedEquationSchema.parse(raw);
  if (kinds[launch.mode] !== state.kind)
    throw new Error("Montagem incompatível com este roteiro algébrico.");
  if (state.kind === "polynomial" && (polynomialDegree(state.divisor) ?? 0) < 1)
    throw new Error("Escolha um divisor de grau 1 ou 2.");
  if (
    state.kind === "polynomial" &&
    state.target === "candidates" &&
    polynomialDegree(state.coefficients) === null
  )
    throw new Error(
      "O polinômio nulo se anula em todo número; o teste finito de candidatos exige um polinômio não nulo.",
    );
  if (state.kind === "roots" && state.target === "reciprocals" && state.roots.includes(0))
    throw new Error("Uma raiz zero não possui inverso; mude a tarefa ou as raízes.");
  if (
    state.kind === "identity" &&
    state.target !== "difference-squares" &&
    state.sum ** 2 < 4 * state.product
  )
    throw new Error("Essa soma e esse produto não correspondem a dois números reais.");
  return state;
}
export function radicalSolutions(state: Extract<AdvancedEquationState, { kind: "radical" }>) {
  const candidates = quadraticRoots(
    state.c ** 2,
    2 * state.c * state.d - state.a,
    state.d ** 2 - state.b,
  );
  return {
    candidates,
    solutions: candidates.filter((x) => {
      const radicand = state.a * x + state.b,
        right = state.c * x + state.d;
      return (
        radicand >= -1e-9 &&
        right >= -1e-9 &&
        Math.abs(Math.sqrt(Math.max(0, radicand)) - right) < 1e-7
      );
    }),
  };
}
export function substitutedSolutions(
  state: Extract<AdvancedEquationState, { kind: "substitution" }>,
) {
  const intermediate = quadraticRoots(state.a, state.b, state.c);
  const values = intermediate
    .flatMap((t) => quadraticRoots(1, state.innerLinear, -t))
    .sort((a, b) => a - b);
  return {
    intermediate,
    solutions: values.filter(
      (x, index) => index === 0 || Math.abs(x - (values[index - 1] ?? x)) > 1e-8,
    ),
  };
}
export function nonlinearSolutions(
  state: Extract<AdvancedEquationState, { kind: "nonlinear" }>,
): { x: number; y: number }[] {
  if (state.model === "sum-product")
    return quadraticRoots(1, -state.sum, state.product).map((x) => ({ x, y: state.sum - x }));
  const offset = state.intercept - state.centerY;
  return quadraticRoots(
    1 + state.slope ** 2,
    2 * (state.slope * offset - state.centerX),
    state.centerX ** 2 + offset ** 2 - state.radius ** 2,
  ).map((x) => ({ x, y: state.slope * x + state.intercept }));
}
export function pairSetAnswer(answer: string, expected: { x: number; y: number }[]): boolean {
  if (!expected.length) return normalized(answer) === "nenhuma";
  const pairs = answer.split("|").map((pair) =>
    pair
      .trim()
      .replace(/^\(|\)$/g, "")
      .split(";")
      .map(readFraction),
  );
  if (
    pairs.length !== expected.length ||
    pairs.some((pair) => pair.length !== 2 || pair.some((entry) => entry === null))
  )
    return false;
  const unused = [...expected];
  for (const pair of pairs) {
    const x = pair[0],
      y = pair[1];
    if (!x || !y) return false;
    const found = unused.findIndex(
      (point) =>
        Math.abs(point.x - fractionNumber(x)) <= 0.001 &&
        Math.abs(point.y - fractionNumber(y)) <= 0.001,
    );
    if (found < 0) return false;
    unused.splice(found, 1);
  }
  return unused.length === 0;
}
export function absoluteEndpoints(
  state: Extract<AdvancedEquationState, { kind: "absolute" }>,
): number[] {
  if (state.radius < 0) return [];
  return [
    ...new Set([(-state.radius - state.b) / state.a, (state.radius - state.b) / state.a]),
  ].sort((a, b) => a - b);
}
export function absoluteInterval(state: Extract<AdvancedEquationState, { kind: "absolute" }>) {
  const endpoints = absoluteEndpoints(state),
    left = endpoints[0],
    right = endpoints.at(-1);
  if (left === undefined || right === undefined || (left === right && state.target === "strict"))
    return "vazio";
  return `${state.target === "closed" ? "[" : "]"}${formatNumber(left)}; ${formatNumber(right)}${state.target === "closed" ? "]" : "["}`;
}
export function powerRemainder(state: Extract<AdvancedEquationState, { kind: "power" }>): bigint {
  return (
    BigInt(state.factor) * BigInt(state.root) ** BigInt(state.exponent) + BigInt(state.constant)
  );
}
export function advancedEquationSummary(state: AdvancedEquationState): string {
  switch (state.kind) {
    case "polynomial": {
      const division = polynomialDivision(state.coefficients, state.divisor);
      const task = {
        value: "valor de P na entrada",
        degree: "grau de P",
        "coefficient-sum": "soma dos coeficientes",
        remainder: "valor do resto na entrada",
        quotient: "valor do quociente na entrada",
        candidates: "candidatos a raízes racionais",
      }[state.target];
      return `P(x)=${polynomialText(state.coefficients)}; D(x)=${polynomialText(state.divisor)}; entrada x=${state.input}. Q, coeficientes do grau 0 em diante: ${division.quotient.map(fractionText).join(", ")}; R: ${division.remainder.map(fractionText).join(", ")}. P=DQ+R e grau R < grau D, quando R não é zero. Tarefa: ${task}.`;
    }
    case "roots": {
      const task = {
        roots: "raízes distintas",
        sum: "soma das raízes",
        product: "produto das raízes",
        pairs: "soma dos produtos dois a dois",
        squares: "soma dos quadrados das raízes",
        reciprocals: "soma dos inversos das raízes",
        coefficient: `coeficiente de x^${state.coefficient}`,
      }[state.target];
      return `P(x)=${state.leading}${state.roots.map((root) => `(x−(${root}))`).join("")}=${polynomialText(factoredCoefficients(state.roots, state.leading))}. As raízes repetidas têm multiplicidade; a lista de soluções distintas não repete valores. Tarefa: ${task}.`;
    }
    case "power":
      return `P(x)=${state.factor}x^${state.exponent}+(${state.constant}); divisor x−(${state.root}). O resto constante é P(${state.root}). Aritmética inteira exata até expoente 100.`;
    case "identity":
      return state.target === "difference-squares"
        ? `a=${state.left}, b=${state.right}; a²−b²=(a−b)(a+b).`
        : `a+b=${state.sum}; ab=${state.product}. Investigar ${state.target === "cubes" ? "a³+b³" : state.target === "difference" ? "(a−b)²" : "a²+b²"}.`;
    case "radical":
      return `√(${state.a}x+(${state.b}))=${state.c}x+(${state.d}). Domínio: ${state.a}x+(${state.b})≥0, e o lado direito também deve ser não negativo. Elevar ao quadrado produz candidatos, não soluções automáticas.`;
    case "substitution":
      return `t=x²+(${state.innerLinear})x; ${state.a}t²+(${state.b})t+(${state.c})=0. Cada valor real de t exige resolver x²+(${state.innerLinear})x=t e verificar se há x real.`;
    case "absolute":
      return state.target === "minimum"
        ? `Distâncias |x−(${state.p})|+|x−(${state.q})|; ponto móvel x=${state.probe}; soma atual ${Math.abs(state.probe - state.p) + Math.abs(state.probe - state.q)}.`
        : `|${state.a}x+(${state.b})| ${state.target === "equation" ? "=" : state.target === "closed" ? "≤" : "<"} ${state.radius}. Módulo é distância, portanto nunca negativo.`;
    case "nonlinear":
      return state.model === "sum-product"
        ? `x+y=${state.sum}; xy=${state.product}. Substituir y=${state.sum}−x produz x²−(${state.sum})x+(${state.product})=0.`
        : `y=${state.slope}x+(${state.intercept}); (x−(${state.centerX}))²+(y−(${state.centerY}))²=${state.radius ** 2}. Cada solução é um ponto comum às duas curvas.`;
  }
}
export const advancedEquationsTool: ToolModule = {
  family: "L08",
  modes: advancedEquationModes,
  activity(launch) {
    assertMode(launch, "L08", advancedEquationModes);
    const v = launch.variant;
    let state: AdvancedEquationState, title: string, prompt: string;
    switch (launch.mode) {
      case "polinomios-gerais":
        state = {
          kind: "polynomial",
          coefficients: v ? [-4, 1, -3, 2, 0, 0] : [-5, 2, 0, 1, 0, 0],
          divisor: v ? [-1, 1, 0] : [-2, 1, 0],
          input: 0,
          target: "remainder",
          coefficient: 2,
        };
        title = "Grau, substituição e divisão";
        prompt =
          "Monte um polinômio de grau até 5 e escolha a tarefa. Para P(x), Q(x) e R(x), responda o valor na entrada marcada; para grau, responda um inteiro ou “indefinido”. O quadro de divisão mostra coeficientes em ordem crescente. Para candidatos a raízes racionais, liste todos por ponto e vírgula: candidato não é raiz confirmada.";
        break;
      case "raizes-e-relacoes":
        state = {
          kind: "roots",
          roots: v ? [1, 1, -2] : [1, 2, 3],
          leading: 1,
          target: v ? "coefficient" : "pairs",
          coefficient: 1,
        };
        title = "Raízes, multiplicidades e Girard";
        prompt =
          "Mova as raízes e observe os fatores e coeficientes. Responda a tarefa escolhida. Somas e produtos contam multiplicidades; a lista de soluções inclui cada raiz distinta uma vez. Na soma de produtos dois a dois, cada par de posições entra uma única vez.";
        break;
      case "potencias-e-restos-polinomiais":
        state = { kind: "power", exponent: v ? 99 : 100, root: -1, factor: 1, constant: -1 };
        title = "Uma potência grande, um resto exato";
        prompt =
          "Qual é o resto da divisão de P(x) por x−r? Substitua x por r; observe o papel da paridade do expoente quando r é negativo. Escreva o inteiro completo, sem separadores. Os cálculos usam inteiros exatos.";
        break;
      case "identidades-simetricas":
        state = {
          kind: "identity",
          sum: v ? 7 : 5,
          product: v ? 10 : 1,
          left: 11,
          right: 9,
          target: v ? "cubes" : "squares",
        };
        title = "Calcular sem descobrir cada número";
        prompt =
          "Escolha a identidade investigada. Quando você conhece a+b e ab, calcule a expressão selecionada sem precisar descobrir a e b separadamente. Compare com diferença de quadrados, que transforma subtração em produto.";
        break;
      case "radical-com-incognita":
        state = { kind: "radical", a: 1, b: v ? 0 : 6, c: 1, d: v ? -6 : 0 };
        title = "Candidatos que precisam voltar à equação";
        prompt =
          "Resolva a equação com raiz e incógnita nos dois lados. Liste todas as soluções reais por ponto e vírgula ou “nenhuma”. Eleve ao quadrado e confira cada candidato no domínio e na equação original; use até 3 casas decimais.";
        break;
      case "substituicoes-quadraticas":
        state = {
          kind: "substitution",
          a: 1,
          b: v ? -2 : -5,
          c: v ? -8 : 4,
          innerLinear: v ? -3 : 0,
        };
        title = "Uma incógnita temporária";
        prompt =
          "Substitua x²+kx por t e resolva a equação em t. Depois retorne a x: alguns t não produzem x real, e cada t pode produzir duas soluções. Liste todas as raízes reais distintas por ponto e vírgula ou “nenhuma”; use até 3 casas decimais.";
        break;
      case "modulo-distancias":
        state = {
          kind: "absolute",
          a: v ? 2 : 1,
          b: v ? -1 : -3,
          radius: 5,
          p: 1,
          q: 5,
          probe: 3,
          target: v ? "strict" : "equation",
        };
        title = "Módulo como distância";
        prompt =
          "Escolha equação, inequação ou soma de distâncias. Na equação, liste as soluções; na inequação, use [a; b] para incluir as pontas ou ]a; b[ para excluí-las, ou “vazio”. Na soma de distâncias, informe o menor valor possível ao mover x. Valores de fronteira são mostrados na reta.";
        break;
      default:
        state = {
          kind: "nonlinear",
          model: v ? "line-circle" : "sum-product",
          sum: 5,
          product: 6,
          slope: 1,
          intercept: 1,
          radius: 5,
          centerX: 0,
          centerY: 0,
          target: "count",
        };
        title = "Duas condições, uma interseção";
        prompt =
          "Escolha um sistema e investigue quantos pares reais satisfazem as duas condições. Na tarefa “pares”, escreva x; y e separe pares por |, por exemplo 2; 3 | 3; 2. Se não houver, escreva “nenhuma”. Use até 3 casas decimais; pontos de tangência contam uma vez.";
    }
    return activity(title, prompt, state, {
      answerKeys: state.kind === "power" ? ["negative"] : ["decimal", "fraction", "negative"],
      answerHint:
        state.kind === "power"
          ? "Inteiro exato sem pontos de milhar."
          : "Use frações ou decimais; separe valores por ;. Respeite a tarefa selecionada no painel.",
      rubric: [
        "Relacionar os coeficientes ou parâmetros à representação.",
        "Respeitar domínio, sinais e multiplicidades.",
        "Distinguir candidatos obtidos por transformação de soluções verificadas.",
      ],
    });
  },
  parse: parseAdvancedEquation,
  summarize(launch, raw) {
    return advancedEquationSummary(parseAdvancedEquation(launch, raw));
  },
  assess(launch, raw, answer) {
    const s = parseAdvancedEquation(launch, raw),
      summary = advancedEquationSummary(s);
    const sets = (expected: number[], why: string) =>
      checked(
        expected.length
          ? numberSetAnswer(answer, expected, 0.001)
          : normalized(answer) === "nenhuma",
        expected.length ? expected.map(formatNumber).join("; ") : "nenhuma",
        why,
        summary,
      );
    if (s.kind === "polynomial") {
      if (s.target === "degree") {
        const degree = polynomialDegree(s.coefficients);
        return degree === null
          ? checked(
              normalized(answer) === "indefinido",
              "indefinido",
              "O polinômio nulo não tem termo não nulo de maior grau.",
              summary,
            )
          : numericChecked(
              answer,
              degree,
              "O grau vem do maior expoente com coeficiente não nulo, não da quantidade de espaços da tabela.",
              summary,
            );
      }
      if (s.target === "candidates")
        return sets(
          rationalRootCandidates(s.coefficients),
          "O numerador de uma raiz racional reduzida divide o termo independente, e o denominador divide o coeficiente líder. Cada candidato ainda precisa ser testado.",
        );
      const division = polynomialDivision(s.coefficients, s.divisor);
      const expected =
        s.target === "remainder"
          ? rationalPolynomialValue(division.remainder, s.input)
          : s.target === "quotient"
            ? rationalPolynomialValue(division.quotient, s.input)
            : s.target === "coefficient-sum"
              ? fraction(BigInt(s.coefficients.reduce((sum, value) => sum + value, 0)))
              : rationalPolynomialValue(
                  s.coefficients.map((value) => fraction(BigInt(value))),
                  s.input,
                );
      return checked(
        rationalAnswer(answer, expected),
        fractionText(expected),
        s.target === "coefficient-sum"
          ? "A soma dos coeficientes é P(1), independentemente da entrada do controle."
          : "A identidade P=DQ+R preserva todos os coeficientes. O grau do resto é menor que o do divisor; divisor linear produz resto constante.",
        summary,
      );
    }
    if (s.kind === "roots") {
      if (s.target === "roots")
        return sets(
          [...new Set(s.roots)],
          "Uma raiz repetida tem multiplicidade, mas aparece uma única vez no conjunto de soluções.",
        );
      const expected =
        s.target === "sum"
          ? s.roots.reduce((sum, root) => sum + root, 0)
          : s.target === "product"
            ? s.roots.reduce((product, root) => product * root, 1)
            : s.target === "squares"
              ? s.roots.reduce((sum, root) => sum + root ** 2, 0)
              : s.target === "reciprocals"
                ? s.roots.reduce((sum, root) => sum + 1 / root, 0)
                : s.target === "coefficient"
                  ? (factoredCoefficients(s.roots, s.leading)[s.coefficient] ?? 0)
                  : s.roots.reduce(
                      (sum, root, index) =>
                        sum +
                        s.roots.slice(index + 1).reduce((pairs, other) => pairs + root * other, 0),
                      0,
                    );
      return numericChecked(
        answer,
        expected,
        "Expandir o produto dos fatores relaciona os coeficientes às somas e produtos das raízes, contando suas multiplicidades.",
        summary,
      );
    }
    if (s.kind === "power") {
      const expected = powerRemainder(s);
      const token = answer.trim().replace(/−/g, "-");
      return checked(
        /^[+-]?\d{1,64}$/.test(token) && BigInt(token) === expected,
        String(expected),
        "O teorema do resto permite substituir r sem executar a divisão da potência inteira.",
        summary,
      );
    }
    if (s.kind === "identity")
      return numericChecked(
        answer,
        s.target === "cubes"
          ? s.sum ** 3 - 3 * s.product * s.sum
          : s.target === "difference"
            ? s.sum ** 2 - 4 * s.product
            : s.target === "difference-squares"
              ? (s.left - s.right) * (s.left + s.right)
              : s.sum ** 2 - 2 * s.product,
        "(a+b)²=a²+2ab+b²; (a+b)³=a³+b³+3ab(a+b); a²−b²=(a−b)(a+b). Escolha a identidade compatível com os dados.",
        summary,
      );
    if (s.kind === "radical")
      return sets(
        radicalSolutions(s).solutions,
        "A raiz quadrada principal é não negativa. Rejeite candidatos com lado direito negativo, mesmo que satisfaçam a equação elevada ao quadrado.",
      );
    if (s.kind === "substitution")
      return sets(
        substitutedSolutions(s).solutions,
        "Encontrar t é só a primeira etapa. Retorne a x e descarte equações sem solução real; não repita raízes coincidentes.",
      );
    if (s.kind === "absolute") {
      if (s.target === "minimum")
        return numericChecked(
          answer,
          Math.abs(s.p - s.q),
          "Entre os dois pontos, uma distância aumenta tanto quanto a outra diminui; fora do intervalo, a soma aumenta. O mínimo é a distância entre as pontas.",
          summary,
        );
      if (s.target === "equation")
        return sets(
          absoluteEndpoints(s),
          "Distância negativa é impossível. Para raio positivo, confira as duas posições; raio zero reúne as duas em uma única posição.",
        );
      const expected = absoluteInterval(s);
      return checked(
        intervalAnswer(answer, expected),
        expected,
        "A desigualdade de módulo exige simultaneamente −r < ax+b < r. A igualdade nas pontas depende de o sinal ser estrito ou não.",
        summary,
      );
    }
    const points = nonlinearSolutions(s);
    return s.target === "count"
      ? numericChecked(
          answer,
          points.length,
          "Cada ponto precisa satisfazer as duas condições. Tangência produz um único ponto, e um discriminante negativo não produz ponto real.",
          summary,
        )
      : checked(
          pairSetAnswer(answer, points),
          points.length
            ? points
                .map((point) => `${formatNumber(point.x)}; ${formatNumber(point.y)}`)
                .join(" | ")
            : "nenhuma",
          "Resolva por substituição e confira x e y em ambas as equações; trocar as coordenadas pode produzir outro par, não o mesmo.",
          summary,
        );
  },
};
