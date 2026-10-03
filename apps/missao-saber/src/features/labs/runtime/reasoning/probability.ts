import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { cardsTool } from "./cards";
import {
  activity,
  decimal,
  ensureMode,
  fraction,
  numberAssessment,
  roundedAssessment,
} from "./common";
import { diceTool } from "./dice";

export const probabilitySchema = z
  .object({
    red: z.number().int().min(0).max(6),
    blue: z.number().int().min(0).max(6),
    replacement: z.boolean(),
    trials: z.number().int().min(0).max(1000),
    seed: z.number().int().min(1).max(2147483646),
    prizeCents: z.number().int().min(0).max(10000),
    ticketCents: z.number().int().min(0).max(10000),
  })
  .strict();
export type ProbabilityState = z.infer<typeof probabilitySchema>;
type Event = "red" | "both-red" | "one-red" | "any-red" | "conditional" | "gain";
export const probabilityDefinitions: Record<
  string,
  { title: string; event: Event; question: string }
> = {
  "favoraveis-e-possiveis": {
    title: "Veja cada ficha possível",
    event: "red",
    question:
      "Uma ficha é retirada ao acaso. Todas as fichas físicas têm a mesma chance. Qual é a probabilidade de sair uma ficha R?",
  },
  "espaco-amostral": {
    title: "Resultados físicos e cores",
    event: "one-red",
    question:
      "Retire duas fichas. Qual é a probabilidade de sair exatamente uma R? Observe que resultados de cores podem ter probabilidades diferentes.",
  },
  "comparar-chances": {
    title: "Mais fichas não é a mesma coisa que mais chance",
    event: "red",
    question:
      "Mude as quantidades das duas cores e compare a razão R/total. Qual é a chance de uma R na urna atual?",
  },
  "reposicao-e-ordem": {
    title: "A segunda retirada depende da primeira?",
    event: "both-red",
    question:
      "Qual é a probabilidade de duas R seguidas? Compare retirar com reposição e sem reposição. As fichas são distinguidas por número.",
  },
  "arvore-com-sem-reposicao": {
    title: "Uma árvore de duas retiradas",
    event: "one-red",
    question:
      "Qual é a probabilidade de exatamente uma R em duas retiradas? Una os caminhos R–A e A–R sem esquecer a regra de reposição.",
  },
  "frequencia-e-teoria": {
    title: "Uma amostra não é uma promessa",
    event: "red",
    question:
      "Simule várias retiradas e compare a frequência observada com o modelo. Informe a probabilidade teórica de R; a amostra não precisa coincidir com ela.",
  },
  "contagem-combinatoria": {
    title: "Contar duplas para calcular chances",
    event: "both-red",
    question:
      "Sem reposição, duas fichas são escolhidas. Qual é a chance de ambas serem R? Compare os pares ordenados com as duplas sem ordem.",
  },
  "uniao-complemento-independencia": {
    title: "Pelo menos uma, pela união ou pelo complemento",
    event: "any-red",
    question:
      "Qual é a probabilidade de pelo menos uma R em duas retiradas? Compare R na primeira, R na segunda e a interseção. Independência só vale com reposição neste modelo.",
  },
  "condicional-arvore-tabela": {
    title: "Sabemos que a primeira foi A",
    event: "conditional",
    question:
      "A primeira ficha foi A. Qual é a probabilidade de a segunda ser R? O denominador agora considera somente os caminhos que começam com A.",
  },
  "valor-esperado-e-risco": {
    title: "Resultado médio e resultado de uma rodada",
    event: "gain",
    question:
      "Uma rodada retira duas fichas. O prêmio só é pago se ambas forem R; a entrada é paga sempre. Qual é o ganho líquido esperado por rodada, em reais? Uma rodada pode terminar com perda mesmo com média positiva.",
  },
};
export function probabilityDefinition(launch: ToolLaunch) {
  ensureMode(launch, "L13", Object.keys(probabilityDefinitions));
  const definition = probabilityDefinitions[launch.mode];
  if (!definition) throw new Error("Modelo de probabilidade não publicado.");
  return definition;
}
export function parseProbability(launch: ToolLaunch, raw: unknown) {
  const definition = probabilityDefinition(launch);
  const state = probabilitySchema.parse(raw);
  const minimum = definition.event === "red" || state.replacement ? 1 : 2;
  if (state.red + state.blue < minimum)
    throw new Error("A urna precisa ter fichas suficientes para as retiradas.");
  if (definition.event === "conditional" && state.blue === 0)
    throw new Error("Condicionar a primeira ficha A exige que exista ao menos uma ficha A.");
  if (launch.mode === "contagem-combinatoria" && state.replacement)
    throw new Error("A escolha de duplas deste roteiro é sem reposição.");
  return state;
}
export function probabilityInitial(launch: ToolLaunch): ProbabilityState {
  probabilityDefinition(launch);
  return {
    red: 2 + launch.variant,
    blue: 3 - launch.variant,
    replacement: launch.mode === "contagem-combinatoria" ? false : launch.variant === 0,
    trials: 0,
    seed: 1837 + launch.variant * 971,
    prizeCents: 1000 + launch.variant * 200,
    ticketCents: 100 + launch.variant * 50,
  };
}
export type Outcome = {
  id: string;
  first: string;
  second: string | null;
  favorable: boolean;
  eligible: boolean;
};
export function probabilityOutcomes(launch: ToolLaunch, state: ProbabilityState): Outcome[] {
  const event = probabilityDefinition(launch).event;
  const balls = [
    ...Array.from({ length: state.red }, (_, i) => `R${i + 1}`),
    ...Array.from({ length: state.blue }, (_, i) => `A${i + 1}`),
  ];
  if (event === "red")
    return balls.map((first) => ({
      id: first,
      first,
      second: null,
      favorable: first.startsWith("R"),
      eligible: true,
    }));
  return balls.flatMap((first) =>
    balls
      .filter((second) => state.replacement || first !== second)
      .map((second) => {
        const reds = Number(first.startsWith("R")) + Number(second.startsWith("R"));
        return {
          id: `${first}→${second}`,
          first,
          second,
          eligible: event !== "conditional" || first.startsWith("A"),
          favorable:
            event === "conditional"
              ? second.startsWith("R")
              : event === "one-red"
                ? reds === 1
                : event === "any-red"
                  ? reds >= 1
                  : reds === 2,
        };
      }),
  );
}
export function probabilityModel(launch: ToolLaunch, state: ProbabilityState) {
  const outcomes = probabilityOutcomes(launch, state).filter((outcome) => outcome.eligible);
  const favorable = outcomes.filter((outcome) => outcome.favorable).length;
  return { favorable, total: outcomes.length, probability: favorable / outcomes.length };
}
/** Park–Miller generator: the sample is reproducible from its saved seed and length. */
export function simulateProbability(launch: ToolLaunch, state: ProbabilityState) {
  const outcomes = probabilityOutcomes(launch, state);
  let seed = state.seed;
  let eligible = 0;
  let favorable = 0;
  const recent: Outcome[] = [];
  for (let trial = 0; trial < state.trials; trial++) {
    seed = (seed * 16807) % 2147483647;
    const outcome = outcomes[Math.floor(((seed - 1) / 2147483646) * outcomes.length)];
    if (!outcome) throw new Error("Resultado fora do espaço amostral.");
    if (outcome.eligible) {
      eligible++;
      if (outcome.favorable) favorable++;
    }
    if (trial >= state.trials - 12) recent.push(outcome);
  }
  return { favorable, eligible, frequency: eligible === 0 ? null : favorable / eligible, recent };
}
export function summarizeProbability(launch: ToolLaunch, state: ProbabilityState) {
  const sample = simulateProbability(launch, state);
  const draws =
    probabilityDefinition(launch).event === "red"
      ? "uma retirada por rodada"
      : `duas retiradas ${state.replacement ? "com" : "sem"} reposição`;
  return `${state.red} fichas R e ${state.blue} fichas A; ${draws}. Cada nova rodada começa com a urna completa. ${state.trials} rodadas; ${sample.favorable} favoráveis entre ${sample.eligible} rodadas da condição. Frequência: ${sample.frequency === null ? "sem observações" : `${decimal(sample.frequency * 100)}%`}.`;
}
const urnTool: ToolModule = {
  family: "L13",
  modes: Object.keys(probabilityDefinitions),
  parse: parseProbability,
  activity: (launch) => {
    const definition = probabilityDefinition(launch);
    return activity({
      title: definition.title,
      prompt: definition.question,
      initialState: probabilityInitial(launch),
      answerLabel:
        definition.event === "gain" ? "Ganho líquido esperado em R$" : "Probabilidade (de 0 a 1)",
      answerKeys:
        definition.event === "gain" ? ["decimal", "fraction", "negative"] : ["decimal", "fraction"],
      answerHint:
        definition.event === "gain"
          ? "Aceita valor negativo; use reais, sem precisar escrever R$."
          : "Use fração, decimal ou percentual: 1/2, 0,5 e 50% representam a mesma probabilidade.",
      rubric: [
        "Definir resultados equiprováveis",
        "Aplicar a condição e a reposição",
        "Separar frequência observada de probabilidade teórica",
      ],
    });
  },
  summarize: (launch, raw) => summarizeProbability(launch, parseProbability(launch, raw)),
  assess: (launch, raw, answer) => {
    const state = parseProbability(launch, raw);
    const model = probabilityModel(launch, state);
    const isGain = probabilityDefinition(launch).event === "gain";
    const expected = isGain
      ? (model.probability * state.prizeCents - state.ticketCents) / 100
      : model.probability;
    const explanation = isGain
      ? `Multiplique a probabilidade ${fraction(model.favorable, model.total)} pelo prêmio e subtraia a entrada: ${decimal(expected)} reais por rodada em média. Arredonde apenas a resposta final aos centavos.`
      : `O modelo tem ${model.favorable} resultados favoráveis em ${model.total} resultados da condição: ${fraction(model.favorable, model.total)}. A diferença da frequência simulada é esperada e não torna a amostra incorreta.`;
    const corrector = isGain ? roundedAssessment : numberAssessment;
    return corrector(
      answer,
      expected,
      summarizeProbability(launch, state),
      explanation,
      isGain ? 2 : 0.000001,
      isGain ? "money" : "ratio",
    );
  },
};
export const probabilityTool: ToolModule = {
  family: "L13",
  modes: [...urnTool.modes, ...diceTool.modes, ...cardsTool.modes],
  activity: (launch) => selectProbabilityTool(launch).activity(launch),
  parse: (launch, raw) => selectProbabilityTool(launch).parse(launch, raw),
  summarize: (launch, raw) => selectProbabilityTool(launch).summarize(launch, raw),
  assess: (launch, raw, answer) => selectProbabilityTool(launch).assess(launch, raw, answer),
};

function selectProbabilityTool(launch: ToolLaunch) {
  return cardsTool.modes.includes(launch.mode)
    ? cardsTool
    : diceTool.modes.includes(launch.mode)
      ? diceTool
      : urnTool;
}
