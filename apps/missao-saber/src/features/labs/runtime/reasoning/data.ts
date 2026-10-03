import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, choiceAssessment, decimal, ensureMode, roundedAssessment } from "./common";

export const dataSchema = z
  .object({
    values: z.array(z.number().int().min(0).max(100)).length(6),
    row: z.number().int().min(0).max(2),
    column: z.number().int().min(0).max(1),
    baseline: z.union([z.literal(0), z.literal(5)]),
    chart: z.enum(["bars", "line"]),
  })
  .strict();
export type DataState = z.infer<typeof dataSchema>;
export const dataDefinitions: Record<
  string,
  {
    title: string;
    question: string;
    target: "cell" | "difference" | "total" | "missing" | "judgment" | "percent" | "graph";
  }
> = {
  "linha-coluna": {
    title: "O encontro da linha com a coluna",
    question:
      "Escolha uma linha e uma coluna. Quantos livros há exatamente nessa célula? Compare o valor com as células vizinhas.",
    target: "cell",
  },
  "totais-diferencas": {
    title: "Somar colunas e comparar totais",
    question:
      "Quantos livros a coluna 2 tem a mais que a coluna 1? Some todas as linhas; se houver menos livros, use um número negativo.",
    target: "difference",
  },
  "tabela-barras": {
    title: "A tabela vira um gráfico",
    question:
      "Mude os dados e acompanhe as barras. Qual é o total de livros na linha selecionada, somando as duas colunas?",
    target: "total",
  },
  "completar-valores": {
    title: "Uma lacuna com total conhecido",
    question:
      "Complete a célula marcada para que a primeira linha tenha o total informado. As demais linhas são dados de comparação.",
    target: "missing",
  },
  "cruzar-e-julgar": {
    title: "O que os dados permitem dizer?",
    question:
      "A tabela mostra somente três dias. Podemos concluir que a coluna com maior total terá mais empréstimos em TODOS os próximos dias?",
    target: "judgment",
  },
  "percentuais-em-dados": {
    title: "Qual é a base do percentual?",
    question:
      "Na linha selecionada, qual percentual dos livros está na coluna 1? O denominador é o total daquela linha, não o total da tabela.",
    target: "percent",
  },
  graficos: {
    title: "Escala, valores e leitura crítica",
    question:
      "Compare o eixo começando em zero e em cinco. Qual é a diferença real entre as duas colunas da linha selecionada (coluna 2 menos coluna 1)? O recorte do eixo não muda os dados.",
    target: "graph",
  },
};
export const dataRowNames = ["Segunda", "Terça", "Quarta"];
export const dataColumnNames = ["Aventura", "Ciência"];
export function dataDefinition(launch: ToolLaunch) {
  ensureMode(launch, "L14", Object.keys(dataDefinitions));
  const definition = dataDefinitions[launch.mode];
  if (!definition) throw new Error("Modo de dados não publicado.");
  return definition;
}
export function dataInitial(launch: ToolLaunch): DataState {
  dataDefinition(launch);
  return {
    values:
      launch.grade <= 3
        ? launch.variant === 0
          ? [3, launch.mode === "completar-valores" ? 0 : 4, 2, 5, 4, 2]
          : [4, launch.mode === "completar-valores" ? 0 : 5, 3, 2, 2, 6]
        : launch.variant === 0
          ? [8, launch.mode === "completar-valores" ? 0 : 12, 6, 9, 14, 10]
          : [10, launch.mode === "completar-valores" ? 0 : 16, 12, 8, 7, 15],
    row: launch.variant,
    column: 0,
    baseline: 0,
    chart: "bars",
  };
}
export function dataMissingTotal(launch: ToolLaunch) {
  return launch.grade <= 3 ? 7 + launch.variant * 2 : launch.variant === 0 ? 20 : 26;
}
export function parseData(launch: ToolLaunch, raw: unknown) {
  const definition = dataDefinition(launch);
  const state = dataSchema.parse(raw);
  if (definition.target === "missing" && state.values[0] !== dataInitial(launch).values[0])
    throw new Error("O primeiro dado conhecido precisa ser preservado.");
  if (
    definition.target === "percent" &&
    (state.values[state.row * 2] ?? 0) + (state.values[state.row * 2 + 1] ?? 0) === 0
  )
    throw new Error("Um percentual exige um total maior que zero.");
  return state;
}
export function dataMetrics(launch: ToolLaunch, state: DataState) {
  const first = state.values[state.row * 2] ?? 0;
  const second = state.values[state.row * 2 + 1] ?? 0;
  const columnOne = state.values
    .filter((_, index) => index % 2 === 0)
    .reduce((sum, value) => sum + value, 0);
  const columnTwo = state.values
    .filter((_, index) => index % 2 === 1)
    .reduce((sum, value) => sum + value, 0);
  const target = dataDefinition(launch).target;
  const expected =
    target === "cell"
      ? (state.values[state.row * 2 + state.column] ?? 0)
      : target === "difference"
        ? columnTwo - columnOne
        : target === "total"
          ? first + second
          : target === "missing"
            ? dataMissingTotal(launch) - (state.values[0] ?? 0)
            : target === "percent"
              ? (first / (first + second)) * 100
              : second - first;
  return { first, second, columnOne, columnTwo, expected };
}
export function summarizeData(launch: ToolLaunch, state: DataState) {
  return `${dataDefinition(launch).title}. ${dataRowNames.map((name, index) => `${name}: ${state.values[index * 2]} livros de aventura e ${state.values[index * 2 + 1]} de ciência`).join("; ")}. Eixo começa em ${state.baseline}. Seleção: ${dataRowNames[state.row]}, ${dataColumnNames[state.column]}.`;
}
export const dataTool: ToolModule = {
  family: "L14",
  modes: Object.keys(dataDefinitions),
  parse: parseData,
  activity: (launch) => {
    const definition = dataDefinition(launch);
    return activity({
      title: definition.title,
      prompt: `${definition.question}${definition.target === "missing" ? ` Total da primeira linha: ${dataMissingTotal(launch)} livros.` : ""}`,
      initialState: dataInitial(launch),
      answerLabel:
        definition.target === "judgment"
          ? "Sua conclusão"
          : definition.target === "percent"
            ? "Percentual (de 0 a 100)"
            : "Quantidade de livros",
      choices:
        definition.target === "judgment"
          ? ["Sim, é garantido", "Não, esses dados não bastam"]
          : undefined,
      answerKeys:
        definition.target === "percent"
          ? ["decimal", "fraction"]
          : definition.target === "difference" || definition.target === "graph"
            ? ["negative"]
            : [],
    });
  },
  summarize: (launch, raw) => summarizeData(launch, parseData(launch, raw)),
  assess: (launch, raw, answer) => {
    const state = parseData(launch, raw);
    const definition = dataDefinition(launch);
    const summary = summarizeData(launch, state);
    if (definition.target === "judgment")
      return choiceAssessment(
        answer,
        "Não, esses dados não bastam",
        summary,
        "Três dias descrevem os registros observados; não garantem o comportamento de todos os dias futuros.",
      );
    const { expected } = dataMetrics(launch, state);
    if (definition.target === "missing" && state.values[1] !== expected)
      return {
        correct: false,
        summary,
        message:
          "Complete também a célula marcada. O valor conhecido mais a lacuna precisa formar o total anunciado.",
      };
    return roundedAssessment(
      answer,
      expected,
      summary,
      `Pelos dados da tabela, o resultado é ${decimal(expected)}${definition.target === "percent" ? "% da linha selecionada" : " livros"}. O eixo do gráfico não altera essa quantidade.`,
      definition.target === "percent" ? 2 : 0,
      definition.target === "percent" ? "percent" : "number",
    );
  },
};
