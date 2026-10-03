import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, assessNumber, requireMode } from "./math";
import {
  assessTwoQuantities,
  parseTwoQuantities,
  twoQuantitiesActivity,
  twoQuantitiesMode,
  twoQuantitiesSummary,
} from "./two-quantities";

export const countingSchema = z
  .object({
    total: z.number().int().min(0).max(100),
    other: z.number().int().min(0).max(100),
    groupSize: z.number().int().min(1).max(10),
    removed: z.number().int().min(0).max(200),
    trays: z
      .tuple([z.number().int().min(0).max(100), z.number().int().min(0).max(100)])
      .default([0, 0]),
    start: z.number().int().min(0).max(20),
    step: z.number().int().min(1).max(10),
    jumps: z.number().int().min(0).max(10),
  })
  .strict();
export type CountingState = z.infer<typeof countingSchema>;
type Kind =
  | "groups"
  | "remainder"
  | "difference"
  | "join"
  | "half"
  | "draw"
  | "jumps"
  | "steps"
  | "share";
type Definition = { title: string; kind: Kind; prompt: string; label: string };
export const countingCases: Record<string, Definition> = {
  "agrupar-e-contar": {
    title: "Organize para contar",
    kind: "groups",
    prompt:
      "Separe as fichas em grupos do mesmo tamanho. Quantos grupos completos você fez? Confira o total contando grupos e sobras.",
    label: "Grupos completos",
  },
  "repartir-com-sobras": {
    title: "Quem ficou de fora?",
    kind: "remainder",
    prompt: "Reparta as fichas em grupos iguais. Quantas fichas sobram fora dos grupos completos?",
    label: "Fichas que sobram",
  },
  "problemas-de-contagem": {
    title: "Caixas completas",
    kind: "groups",
    prompt:
      "Cada caixa recebe a quantidade indicada. Monte as caixas. Quantas ficam completas? As fichas que sobram não completam outra caixa.",
    label: "Caixas completas",
  },
  "dezenas-ate-cem": {
    title: "Pacotes de dez",
    kind: "groups",
    prompt:
      "Agrupe dez fichas em cada pacote. Quantas dezenas completas há? Cada ficha fora dos pacotes vale uma unidade.",
    label: "Dezenas completas",
  },
  "mais-menos": {
    title: "Compare duas coleções",
    kind: "difference",
    prompt:
      "Faça pares, uma ficha de cada coleção. Quantas fichas a coleção maior tem a mais que a menor?",
    label: "Diferença entre as coleções",
  },
  "juntar-tirar": {
    title: "Junte e retire",
    kind: "join",
    prompt:
      "Junte as duas coleções e retire as fichas riscadas da primeira. Quantas fichas ficam ao todo?",
    label: "Fichas que ficam",
  },
  "dobro-metade-grupos": {
    title: "Duas partes iguais",
    kind: "half",
    prompt:
      "Leve todas as fichas da mesa para as duas bandejas. Deixe a mesma quantidade em cada uma. Quantas fichas ficam em cada metade? Juntas, as duas metades precisam formar a coleção inteira.",
    label: "Fichas em cada metade",
  },
  "representar-e-conferir": {
    title: "Desenhe e confira",
    kind: "draw",
    prompt:
      "Acrescente ou retire bolinhas. Depois risque as que saíram. Quantas bolinhas continuam na coleção?",
    label: "Bolinhas que continuam",
  },
  "pulos-na-reta": {
    title: "Pulos do mesmo tamanho",
    kind: "jumps",
    prompt: "Escolha onde começar e faça pulos iguais na reta. Em qual número você chega?",
    label: "Número de chegada",
  },
  "bolinhas-tracinhos": {
    title: "Um desenho para cada objeto",
    kind: "draw",
    prompt:
      "Cada bolinha representa um objeto. Risque os que foram embora. Quantos objetos restam?",
    label: "Objetos que restam",
  },
  partilha: {
    title: "Repartir sem perder",
    kind: "share",
    prompt:
      "Reparta as fichas igualmente entre as pessoas indicadas. Quantas fichas inteiras cada pessoa recebe? Se sobrarem fichas, deixe-as separadas e confira o total.",
    label: "Fichas recebidas por cada pessoa",
  },
  "passos-e-explicacao": {
    title: "Uma história em duas etapas",
    kind: "steps",
    prompt:
      "Havia a primeira coleção, chegaram as fichas da segunda e depois saíram as fichas riscadas. Represente essas duas mudanças. Quantas ficaram?",
    label: "Total depois das duas mudanças",
  },
};
export function countingDefinition(launch: ToolLaunch) {
  return requireMode(launch, "L01", countingCases);
}
export function parseCounting(launch: ToolLaunch, raw: unknown): CountingState {
  const definition = countingDefinition(launch);
  const state = countingSchema.parse(raw);
  const available = definition.kind === "steps" ? state.total + state.other : state.total;
  if (state.removed > available) throw new Error("Não se pode retirar mais fichas do que há.");
  if (launch.mode === "dezenas-ate-cem" && state.groupSize !== 10)
    throw new Error("Uma dezena precisa conter dez fichas.");
  if (definition.kind === "half" && state.total % 2 !== 0)
    throw new Error("Nesta partilha de fichas inteiras, use uma quantidade par.");
  if (definition.kind === "half" && state.trays[0] + state.trays[1] > state.total)
    throw new Error("As bandejas não podem conter mais fichas que a coleção.");
  return state;
}
export function countingValue(launch: ToolLaunch, state: CountingState): number {
  switch (countingDefinition(launch).kind) {
    case "groups":
    case "share":
      return Math.floor(state.total / state.groupSize);
    case "remainder":
      return state.total % state.groupSize;
    case "difference":
      return Math.abs(state.total - state.other);
    case "join":
    case "steps":
      return state.total + state.other - state.removed;
    case "half":
      return state.total / 2;
    case "draw":
      return state.total - state.removed;
    case "jumps":
      return state.start + state.step * state.jumps;
  }
}
export function countingSummary(launch: ToolLaunch, state: CountingState): string {
  const kind = countingDefinition(launch).kind;
  if (kind === "share")
    return `${state.total} fichas para ${state.groupSize} pessoas: ${Math.floor(state.total / state.groupSize)} para cada uma e ${state.total % state.groupSize} fichas restantes.`;
  if (kind === "jumps")
    return `Começo em ${state.start}; ${state.jumps} pulos de ${state.step}; chegada ${countingValue(launch, state)}.`;
  if (kind === "difference")
    return `Coleções com ${state.total} e ${state.other} fichas; diferença ${countingValue(launch, state)}.`;
  if (kind === "half")
    return `${state.total} fichas ao todo: ${state.trays[0]} na primeira bandeja, ${state.trays[1]} na segunda e ${state.total - state.trays[0] - state.trays[1]} ainda na mesa.`;
  if (kind === "groups" || kind === "remainder")
    return `${state.total} fichas = ${Math.floor(state.total / state.groupSize)} grupos de ${state.groupSize} + ${state.total % state.groupSize} soltas.`;
  return `${state.total} fichas no começo${kind === "join" || kind === "steps" ? `, chegam ${state.other}` : ""}, saem ${state.removed}; ficam ${countingValue(launch, state)}.`;
}
export const countingTool: ToolModule = {
  family: "L01",
  modes: [...Object.keys(countingCases), twoQuantitiesMode],
  activity(launch) {
    if (launch.family === "L01" && launch.mode === twoQuantitiesMode)
      return twoQuantitiesActivity(launch);
    const definition = countingDefinition(launch);
    const total = definition.kind === "half" ? 12 + launch.variant * 2 : 17 + launch.variant * 6;
    return activity(
      definition.title,
      definition.prompt,
      {
        total,
        other: 9 + launch.variant * 2,
        groupSize: launch.mode === "dezenas-ate-cem" ? 10 : 4,
        removed: 3 + launch.variant,
        trays: [0, 0],
        start: 2 + launch.variant,
        step: 3 + launch.variant,
        jumps: 4,
      },
      definition.label,
    );
  },
  parse: (launch, raw) =>
    launch.family === "L01" && launch.mode === twoQuantitiesMode
      ? parseTwoQuantities(raw)
      : parseCounting(launch, raw),
  assess(launch, raw, answer) {
    if (launch.family === "L01" && launch.mode === twoQuantitiesMode)
      return assessTwoQuantities(raw, answer);
    const state = parseCounting(launch, raw);
    if (countingDefinition(launch).kind === "half") {
      const remaining = state.total - state.trays[0] - state.trays[1];
      if (remaining !== 0 || state.trays[0] !== state.trays[1])
        return {
          correct: false,
          message: remaining
            ? "Ainda há fichas na mesa. Distribua a coleção inteira sem perder nenhuma ficha."
            : "As bandejas têm quantidades diferentes. Mova fichas para deixá-las iguais.",
          summary: countingSummary(launch, state),
        };
    }
    return assessNumber(
      answer,
      countingValue(launch, state),
      "Conte cada ficha uma vez e mantenha o total ao agrupar.",
      countingSummary(launch, state),
    );
  },
  summarize: (launch, raw) =>
    launch.family === "L01" && launch.mode === twoQuantitiesMode
      ? twoQuantitiesSummary(parseTwoQuantities(raw))
      : countingSummary(launch, parseCounting(launch, raw)),
};
