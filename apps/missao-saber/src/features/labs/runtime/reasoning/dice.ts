import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, ensureMode, fraction, numberAssessment } from "./common";

export const diceSchema = z
  .object({
    faces: z.number().int().min(2).max(8),
    sum: z.number().int().min(2).max(16),
    face: z.number().int().min(1).max(8),
    trials: z.number().int().min(1).max(1000),
    seed: z.number().int().min(1).max(2147483646),
  })
  .strict();
export type DiceState = z.infer<typeof diceSchema>;
export const diceDefinitions: Record<string, { title: string; question: string }> = {
  "dados-somas": {
    title: "As somas de dois dados",
    question:
      "Dois dados independentes e equilibrados têm faces numeradas de 1 até o limite. Qual é a probabilidade de a soma ser a indicada? Conte os pares físicos, não apenas os valores das somas.",
  },
  "dados-condicional": {
    title: "Dois dados com soma conhecida",
    question:
      "Sabemos que a soma dos dois dados é a indicada. Qual é a probabilidade de pelo menos um deles mostrar a face marcada? O denominador inclui somente os pares com a soma conhecida.",
  },
  "eventos-complementares": {
    title: "Contar o que não acontece",
    question:
      "Qual é a probabilidade de NÃO obter a soma indicada em dois dados? Compare contar diretamente com subtrair a chance do evento de 1.",
  },
  "frequencia-relativa": {
    title: "O que a amostra realmente mostrou",
    question:
      "Nesta amostra salva, qual é a frequência relativa da soma indicada? Divida ocorrências observadas por rodadas; aqui a pergunta é sobre a amostra, não a probabilidade teórica.",
  },
  "ocorrencias-esperadas": {
    title: "Quantidade esperada não é garantia",
    question:
      "No número de rodadas indicado, quantas ocorrências da soma são esperadas em média pelo modelo? O valor esperado pode não ser inteiro e não precisa coincidir com a amostra.",
  },
};
function definition(launch: ToolLaunch) {
  ensureMode(launch, "L13", Object.keys(diceDefinitions));
  const result = diceDefinitions[launch.mode];
  if (!result) throw new Error("Roteiro de dados ausente.");
  return result;
}
export function parseDice(launch: ToolLaunch, raw: unknown) {
  definition(launch);
  const state = diceSchema.parse(raw);
  if (state.sum > 2 * state.faces || state.face > state.faces)
    throw new Error("Soma ou face fora do espaço amostral.");
  return state;
}
export function diceOutcomes(launch: ToolLaunch, state: DiceState) {
  return Array.from({ length: state.faces }, (_, i) =>
    Array.from({ length: state.faces }, (_, j) => ({
      id: `${i + 1},${j + 1}`,
      first: i + 1,
      second: j + 1,
      eligible: launch.mode !== "dados-condicional" || i + j + 2 === state.sum,
      favorable:
        launch.mode === "dados-condicional"
          ? i + 1 === state.face || j + 1 === state.face
          : launch.mode === "eventos-complementares"
            ? i + j + 2 !== state.sum
            : i + j + 2 === state.sum,
    })),
  ).flat();
}
export function diceMetrics(launch: ToolLaunch, state: DiceState) {
  const outcomes = diceOutcomes(launch, state);
  const eligible = outcomes.filter((outcome) => outcome.eligible);
  const favorable = eligible.filter((outcome) => outcome.favorable).length;
  let seed = state.seed;
  let observed = 0;
  for (let i = 0; i < state.trials; i++) {
    seed = (seed * 16807) % 2147483647;
    const outcome = outcomes[Math.floor(((seed - 1) / 2147483646) * outcomes.length)];
    if (outcome && outcome.first + outcome.second === state.sum) observed++;
  }
  return {
    favorable,
    total: eligible.length,
    theoretical: favorable / eligible.length,
    observed,
    frequency: observed / state.trials,
  };
}
export function diceSummary(launch: ToolLaunch, state: DiceState) {
  const metrics = diceMetrics(launch, state);
  return `Dois dados independentes de ${state.faces} faces; soma selecionada ${state.sum}; face ${state.face}. Modelo: ${metrics.favorable}/${metrics.total} resultados da condição. Amostra de ${state.trials} rodadas: ${metrics.observed} ocorrências da soma; frequência ${metrics.observed}/${state.trials}.`;
}
export const diceTool: ToolModule = {
  family: "L13",
  modes: Object.keys(diceDefinitions),
  parse: parseDice,
  activity: (launch) =>
    activity({
      title: definition(launch).title,
      prompt: definition(launch).question,
      initialState: {
        faces: 6,
        sum: 7 + launch.variant,
        face: 4 - launch.variant,
        trials: 30 + launch.variant * 6,
        seed: 1879 + launch.variant * 97,
      },
      answerLabel:
        launch.mode === "ocorrencias-esperadas"
          ? "Quantidade esperada de ocorrências"
          : launch.mode === "frequencia-relativa"
            ? "Frequência relativa (de 0 a 1)"
            : "Probabilidade (de 0 a 1)",
      answerHint:
        "Pode usar fração ou decimal com vírgula. Amostras diferentes podem produzir frequências diferentes.",
      answerKeys: ["decimal", "fraction"],
    }),
  summarize: (launch, raw) => diceSummary(launch, parseDice(launch, raw)),
  assess: (launch, raw, answer) => {
    const state = parseDice(launch, raw);
    const metrics = diceMetrics(launch, state);
    const expected =
      launch.mode === "frequencia-relativa"
        ? metrics.frequency
        : launch.mode === "ocorrencias-esperadas"
          ? metrics.theoretical * state.trials
          : metrics.theoretical;
    return numberAssessment(
      answer,
      expected,
      diceSummary(launch, state),
      launch.mode === "frequencia-relativa"
        ? `A frequência observada é ${metrics.observed}/${state.trials}.`
        : `A probabilidade teórica é ${fraction(metrics.favorable, metrics.total)}${launch.mode === "ocorrencias-esperadas" ? `; multiplique por ${state.trials} rodadas para a quantidade esperada` : ""}.`,
      0.000001,
      launch.mode === "ocorrencias-esperadas" ? "number" : "ratio",
    );
  },
};
