import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { intervalAnswer } from "./intervals";
import { formatNumber, quadraticRoots } from "./math";
import { activity, assertMode, checked, normalized, numericChecked } from "./shared";

export const advancedFunctionModes = [
  "vertice-e-extremos",
  "relacoes-e-funcoes",
  "inequacoes-quadraticas",
];
const integer = (min: number, max: number) => z.number().int().min(min).max(max);
export const advancedFunctionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("vertex"),
      a: integer(-4, 4).refine((a) => a !== 0),
      b: integer(-12, 12),
      c: integer(-12, 12),
      target: z.enum(["x", "y", "type"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("relation"),
      pairs: z
        .array(z.object({ x: integer(-4, 4), y: integer(-4, 4) }).strict())
        .min(2)
        .max(6),
    })
    .strict(),
  z
    .object({
      kind: z.literal("inequality"),
      a: integer(-4, 4).refine((a) => a !== 0),
      b: integer(-12, 12),
      c: integer(-12, 12),
      relation: z.enum(["<", "≤", ">", "≥"]),
    })
    .strict(),
]);
export type AdvancedFunctionState = z.infer<typeof advancedFunctionSchema>;
const kinds: Record<string, AdvancedFunctionState["kind"]> = {
  "vertice-e-extremos": "vertex",
  "relacoes-e-funcoes": "relation",
  "inequacoes-quadraticas": "inequality",
};
export function parseAdvancedFunction(launch: ToolLaunch, raw: unknown): AdvancedFunctionState {
  assertMode(launch, "L11", advancedFunctionModes);
  const state = advancedFunctionSchema.parse(raw);
  if (kinds[launch.mode] !== state.kind)
    throw new Error("A representação pertence a outro roteiro de funções.");
  return state;
}
export function vertex(state: { a: number; b: number; c: number }) {
  const x = -state.b / (2 * state.a);
  return { x, y: state.c - state.b ** 2 / (4 * state.a) };
}
export function relationIsFunction(pairs: { x: number; y: number }[]) {
  const images = new Map<number, number>();
  for (const pair of pairs) {
    const image = images.get(pair.x);
    if (image !== undefined && image !== pair.y) return false;
    images.set(pair.x, pair.y);
  }
  return true;
}
export type SolutionInterval = {
  left: number | null;
  right: number | null;
  includeLeft: boolean;
  includeRight: boolean;
};
export function quadraticInequality(
  state: Extract<AdvancedFunctionState, { kind: "inequality" }>,
): SolutionInterval[] {
  const roots = quadraticRoots(state.a, state.b, state.c);
  const positive = state.relation === ">" || state.relation === "≥",
    closed = state.relation === "≤" || state.relation === "≥";
  const outside = positive === state.a > 0;
  if (roots.length === 0)
    return outside ? [{ left: null, right: null, includeLeft: false, includeRight: false }] : [];
  const left = roots[0],
    right = roots.at(-1);
  if (left === undefined || right === undefined)
    throw new Error("Raízes quadráticas inconsistentes.");
  if (roots.length === 1) {
    if (outside && closed)
      return [{ left: null, right: null, includeLeft: false, includeRight: false }];
    if (!outside) return closed ? [{ left, right, includeLeft: true, includeRight: true }] : [];
  }
  return outside
    ? [
        { left: null, right: left, includeLeft: false, includeRight: closed },
        { left: right, right: null, includeLeft: closed, includeRight: false },
      ]
    : [{ left, right, includeLeft: closed, includeRight: closed }];
}
export function intervalText(intervals: SolutionInterval[]): string {
  if (!intervals.length) return "vazio";
  if (intervals.length === 1 && intervals[0]?.left === null && intervals[0].right === null)
    return "reais";
  return intervals
    .map(
      (interval) =>
        `${interval.includeLeft ? "[" : "]"}${interval.left === null ? "−∞" : formatNumber(interval.left)}; ${interval.right === null ? "+∞" : formatNumber(interval.right)}${interval.includeRight ? "]" : "["}`,
    )
    .join(" ∪ ");
}
export function advancedFunctionSummary(state: AdvancedFunctionState) {
  if (state.kind === "relation")
    return `Relação: ${state.pairs.map(({ x, y }) => `${x}→${y}`).join("; ")}. Domínio: ${[...new Set(state.pairs.map(({ x }) => x))].sort((a, b) => a - b).join(", ")}; imagem: ${[...new Set(state.pairs.map(({ y }) => y))].sort((a, b) => a - b).join(", ")}. Repetir o mesmo par não cria uma nova saída.`;
  if (state.kind === "vertex") {
    const point = vertex(state);
    return `f(x)=${state.a}x²+(${state.b})x+(${state.c}), para todo real x. Forma de vértice: ${state.a}(x−(${formatNumber(point.x)}))²+(${formatNumber(point.y)}). ${state.a > 0 ? "Mínimo" : "Máximo"} no vértice. Tarefa: ${{ x: "entrada do vértice", y: "valor extremo", type: "máximo ou mínimo" }[state.target]}.`;
  }
  return `${state.a}x²+(${state.b})x+(${state.c}) ${state.relation} 0. Discriminante ${state.b ** 2 - 4 * state.a * state.c}; raízes ${quadraticRoots(state.a, state.b, state.c).map(formatNumber).join("; ") || "nenhuma"}. As raízes particionam a reta; raiz dupla não troca o sinal.`;
}
export const advancedFunctionsTool: ToolModule = {
  family: "L11",
  modes: advancedFunctionModes,
  activity(launch) {
    assertMode(launch, "L11", advancedFunctionModes);
    const v = launch.variant;
    let state: AdvancedFunctionState, title: string, prompt: string;
    if (launch.mode === "vertice-e-extremos") {
      state = { kind: "vertex", a: v ? 1 : -1, b: v ? -4 : 6, c: v ? 1 : 0, target: v ? "y" : "x" };
      title = "Onde a parábola muda de direção";
      prompt =
        "Altere os coeficientes e acompanhe o vértice. Responda a tarefa escolhida: entrada x do vértice, valor extremo y ou tipo (“máximo”/“mínimo”). O domínio desta investigação é todos os reais; um problema com domínio restrito ainda exige verificar suas fronteiras.";
    } else if (launch.mode === "relacoes-e-funcoes") {
      state = {
        kind: "relation",
        pairs: v
          ? [
              { x: -2, y: 1 },
              { x: 0, y: 2 },
              { x: 0, y: -1 },
              { x: 2, y: 3 },
            ]
          : [
              { x: -2, y: 1 },
              { x: -1, y: 1 },
              { x: 0, y: 2 },
              { x: 2, y: 3 },
            ],
      };
      title = "Uma entrada pode ter duas saídas?";
      prompt =
        "Mude os pares da relação e observe as setas e o gráfico. Ela é uma função do domínio mostrado para a imagem mostrada? Responda “sim” ou “não”. Duas entradas podem compartilhar uma saída; uma única entrada não pode ter duas saídas diferentes.";
    } else {
      state = {
        kind: "inequality",
        a: v ? -1 : 1,
        b: v ? 2 : 0,
        c: v ? -1 : -4,
        relation: v ? "≥" : "<",
      };
      title = "O sinal em cada intervalo";
      prompt =
        "Resolva a inequação para todos os reais. Use intervalos: ]a; b[ exclui as pontas e [a; b] inclui. Separe intervalos por ∪ ou U, use −∞ e +∞, ou escreva “vazio”/“reais”. Uma solução isolada pode ser escrita [a; a]. Confira raiz dupla e sinais nas fronteiras; use até 3 casas decimais.";
    }
    return activity(title, prompt, state, {
      choices: state.kind === "relation" ? ["sim", "não"] : undefined,
      answerHint:
        state.kind === "inequality"
          ? "Exemplo: ]−∞; −2] ∪ [2; +∞[. Frações são aceitas nas fronteiras."
          : "Use a tarefa selecionada. Para valores numéricos, decimais ou frações são aceitos.",
      rubric: [
        "Relacionar os parâmetros à representação.",
        "Distinguir entrada, saída, raiz e extremo.",
        "Justificar para todo o domínio, incluindo as fronteiras.",
      ],
    });
  },
  parse: parseAdvancedFunction,
  summarize(launch, raw) {
    return advancedFunctionSummary(parseAdvancedFunction(launch, raw));
  },
  assess(launch, raw, answer) {
    const state = parseAdvancedFunction(launch, raw),
      summary = advancedFunctionSummary(state);
    if (state.kind === "relation") {
      const expected = relationIsFunction(state.pairs) ? "sim" : "não";
      return checked(
        normalized(answer) === normalized(expected),
        expected,
        "Cada elemento do domínio precisa ter exatamente uma saída. Repetir a mesma imagem para entradas diferentes é permitido.",
        summary,
      );
    }
    if (state.kind === "vertex") {
      if (state.target === "type") {
        const expected = state.a > 0 ? "mínimo" : "máximo";
        return checked(
          normalized(answer) === normalized(expected),
          expected,
          "O sinal de a determina a concavidade. Em todo R, uma parábola com a>0 tem mínimo; com a<0, máximo.",
          summary,
        );
      }
      return numericChecked(
        answer,
        vertex(state)[state.target],
        "No vértice, x=−b/(2a) e y=f(x). A entrada que otimiza e o valor ótimo são grandezas diferentes.",
        summary,
        0.001,
      );
    }
    const expected = intervalText(quadraticInequality(state));
    return checked(
      intervalAnswer(answer, expected),
      expected,
      "Teste o sinal em cada intervalo determinado pelas raízes; inclua uma raiz apenas quando a desigualdade admite igualdade. Raiz dupla toca o eixo sem mudar o sinal.",
      summary,
    );
  },
};
