import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, assessNumber, format, requireMode } from "./math";

export const ratiosSchema = z
  .object({
    base: z.number().finite().min(10).max(2000),
    percent: z.number().int().min(1).max(200),
    otherPercent: z.number().int().min(0).max(200).default(90),
    otherBase: z.number().finite().min(0).max(4000).default(240),
    change: z.number().finite().min(-90).max(200),
    secondChange: z.number().finite().min(-90).max(200),
    partA: z.number().int().min(1).max(12),
    partB: z.number().int().min(1).max(12),
    factor: z.number().int().min(1).max(8),
    addition: z.number().int().min(0).max(12).default(1),
    workers: z.number().int().min(1).max(12),
    work: z.number().int().min(12).max(120),
  })
  .strict();
export type RatiosState = z.infer<typeof ratiosSchema>;
type Kind =
  | "percent"
  | "successive"
  | "unknown"
  | "share"
  | "unit"
  | "inverse"
  | "partition"
  | "tax"
  | "recover-part"
  | "variation"
  | "points"
  | "percent-of-percent"
  | "fraction";
type Definition = { title: string; kind: Kind; prompt: string; label: string };
export const ratioCases: Record<string, Definition> = {
  "parte-e-base": {
    title: "A parte conhecida revela o todo",
    kind: "recover-part",
    prompt:
      "A quantidade conhecida corresponde à porcentagem indicada do todo. Qual é a quantidade total? A porcentagem descreve uma parte da base, sem acrescentar um aumento ao valor.",
    label: "Quantidade do todo",
  },
  "taxa-de-variacao": {
    title: "Descobrir a mudança percentual",
    kind: "variation",
    prompt:
      "Compare o valor antes e depois. Qual é a variação percentual em relação ao valor inicial? Use um número negativo para uma redução.",
    label: "Variação em %",
  },
  "pontos-percentuais": {
    title: "Pontos percentuais e variação relativa",
    kind: "points",
    prompt:
      "Compare as duas taxas. Quantos pontos percentuais a segunda tem a mais que a primeira? Essa diferença não é igual à variação relativa em porcentagem.",
    label: "Diferença em pontos percentuais",
  },
  "porcentagem-de-porcentagem": {
    title: "Uma parte dentro de outra",
    kind: "percent-of-percent",
    prompt:
      "A primeira porcentagem seleciona parte do grupo. A segunda seleciona uma parte apenas desse subgrupo. Que porcentagem do grupo inteiro foi selecionada no fim?",
    label: "Porcentagem do grupo inteiro",
  },
  "percentual-como-fracao": {
    title: "Por cento em forma de fração",
    kind: "fraction",
    prompt:
      "A barra inteira vale 100%. Escreva a porcentagem escolhida como fração ou decimal do inteiro. Procure uma fração equivalente mais simples.",
    label: "Fração ou decimal do inteiro",
  },
  "base-percentual": {
    title: "Uma parte de cem",
    kind: "percent",
    prompt:
      "O valor inicial é a base de 100%. Mude a porcentagem e observe a barra. Que quantidade corresponde à porcentagem escolhida?",
    label: "Quantidade correspondente",
  },
  "mudancas-sucessivas": {
    title: "Cada mudança tem uma base",
    kind: "successive",
    prompt:
      "Aplique as duas mudanças em sequência. A segunda porcentagem incide sobre o valor que restou após a primeira. Qual é o valor final?",
    label: "Valor final",
  },
  "razao-sobre-base": {
    title: "Qual parte é a base?",
    kind: "share",
    prompt:
      "Misture as quantidades A e B. A base agora é a mistura inteira, A + B. Quantos por cento da mistura são do ingrediente A?",
    label: "Porcentagem de A na mistura",
  },
  "aumento-e-desconto": {
    title: "Aumentar e depois diminuir",
    kind: "successive",
    prompt:
      "Teste um aumento e um desconto com a mesma taxa. Você volta ao começo? Calcule o valor final usando a base de cada etapa.",
    label: "Valor final",
  },
  "base-desconhecida": {
    title: "Voltar ao valor inicial",
    kind: "unknown",
    prompt:
      "A barra mostra o valor depois da mudança percentual. Qual era o valor antes da mudança? Dividir pelo fator desfaz a multiplicação.",
    label: "Valor antes da mudança",
  },
  "parte-parte-e-todo": {
    title: "Uma receita na mesma proporção",
    kind: "share",
    prompt:
      "A e B formam uma mistura. Compare multiplicar ambas as quantidades pelo mesmo fator com somar a mesma quantidade a ambas. Qual ação preserva a razão? Qual é a porcentagem de A na mistura original? Compare A:B com A:(A+B).",
    label: "Porcentagem de A no total",
  },
  "taxa-unitaria": {
    title: "Quanto corresponde a um?",
    kind: "unit",
    prompt:
      "Uma quantidade de litros percorre a distância indicada. Mantendo o consumo proporcional, quantos quilômetros são percorridos com um litro?",
    label: "Quilômetros por litro",
  },
  "grandezas-e-unidades": {
    title: "Velocidade e unidade",
    kind: "unit",
    prompt:
      "A distância está em quilômetros e o tempo em horas. Mantendo velocidade constante, qual é a distância percorrida a cada hora?",
    label: "Velocidade em km/h",
  },
  "inversa-produto-constante": {
    title: "Mais equipes, menos tempo",
    kind: "inverse",
    prompt:
      "O trabalho total é medido em pessoa-horas. Todos trabalham no mesmo ritmo e sem interferência. Quantas horas cada equipe levará? Confira que pessoas × horas fica constante.",
    label: "Tempo em horas",
  },
  "partilha-e-grandezas-compostas": {
    title: "Repartir na razão escolhida",
    kind: "partition",
    prompt:
      "Reparta o valor total entre A e B na razão indicada pelas fichas. Quanto deve receber A? A soma das duas partes precisa ser o total.",
    label: "Parte recebida por A",
  },
  "base-e-acima-de-cem": {
    title: "Mais que um inteiro",
    kind: "percent",
    prompt:
      "Uma porcentagem pode passar de 100%. Compare a barra do resultado com uma e duas barras da base. Qual é o valor da porcentagem escolhida?",
    label: "Valor correspondente",
  },
  "fatores-sucessivos": {
    title: "Multiplicar fatores",
    kind: "successive",
    prompt:
      "Transforme cada variação percentual em um fator e multiplique os fatores. Qual é o valor final? Somar taxas em bases diferentes pode dar outro resultado.",
    label: "Valor final",
  },
  "recuperar-base": {
    title: "Desfazer a variação",
    kind: "unknown",
    prompt:
      "Conhecemos o valor final e a taxa aplicada uma vez. Recupere a base dividindo pelo fator. Uma redução de 20% deixa 80% da base.",
    label: "Base original",
  },
  "promocoes-impostos-e-critica": {
    title: "Desconto seguido de imposto",
    kind: "tax",
    prompt:
      "O primeiro ajuste representa a promoção e o segundo é o imposto sobre o preço já ajustado. Qual é o total? Neste modelo didático, ambos são aplicados uma vez e não há outras taxas.",
    label: "Total depois dos ajustes",
  },
};
export function ratioDefinition(launch: ToolLaunch) {
  return requireMode(launch, "L03", ratioCases);
}
export function parseRatios(launch: ToolLaunch, raw: unknown): RatiosState {
  const kind = ratioDefinition(launch).kind;
  const state = ratiosSchema.parse(raw);
  if (
    launch.mode === "aumento-e-desconto" &&
    (state.change < 0 || state.secondChange !== -state.change)
  )
    throw new Error("Use um aumento e um desconto com a mesma taxa.");
  if (kind === "tax" && (state.change > 0 || state.secondChange < 0))
    throw new Error("A promoção reduz o preço e o imposto acrescenta uma taxa não negativa.");
  if (
    (kind === "percent-of-percent" || kind === "recover-part") &&
    (state.percent > 100 || (kind === "percent-of-percent" && state.otherPercent > 100))
  )
    throw new Error("Uma parte deste grupo fica entre zero e 100%.");
  return state;
}
export function successiveValues(state: RatiosState) {
  const intermediate = (state.base * (100 + state.change)) / 100;
  return {
    intermediate,
    final: (state.base * (100 + state.change) * (100 + state.secondChange)) / 10000,
  };
}
export function recipeComparisons(state: RatiosState) {
  return [
    { label: "Original", a: state.partA, b: state.partB },
    {
      label: `Multiplicar por ${state.factor}`,
      a: state.partA * state.factor,
      b: state.partB * state.factor,
    },
    {
      label: `Somar ${state.addition} a cada ingrediente`,
      a: state.partA + state.addition,
      b: state.partB + state.addition,
    },
  ].map((recipe) => ({
    ...recipe,
    preservesRatio: recipe.a * state.partB === recipe.b * state.partA,
  }));
}
export function ratioValue(launch: ToolLaunch, state: RatiosState): number {
  switch (ratioDefinition(launch).kind) {
    case "recover-part":
      return (state.base * 100) / state.percent;
    case "variation":
      return ((state.otherBase - state.base) * 100) / state.base;
    case "points":
      return state.otherPercent - state.percent;
    case "percent-of-percent":
      return (state.percent * state.otherPercent) / 100;
    case "fraction":
      return state.percent / 100;
    case "percent":
      return (state.base * state.percent) / 100;
    case "successive":
    case "tax":
      return successiveValues(state).final;
    case "unknown":
      return (state.base * 100) / (100 + state.change);
    case "share":
      return (100 * state.partA) / (state.partA + state.partB);
    case "unit":
      return state.base / state.partA;
    case "inverse":
      return state.work / state.workers;
    case "partition":
      return (state.base * state.partA) / (state.partA + state.partB);
  }
}
export function ratiosSummary(launch: ToolLaunch, state: RatiosState): string {
  switch (ratioDefinition(launch).kind) {
    case "recover-part":
      return `${state.base} corresponde a ${state.percent}% do todo; o todo é ${format(ratioValue(launch, state))}.`;
    case "variation":
      return `Valor inicial ${state.base}; valor final ${state.otherBase}; diferença ${format(state.otherBase - state.base)}; variação sobre a base inicial ${format(ratioValue(launch, state))}%.`;
    case "points":
      return `${state.percent}% → ${state.otherPercent}%: diferença ${format(ratioValue(launch, state))} pontos percentuais; variação relativa ${format(((state.otherPercent - state.percent) * 100) / state.percent)}%.`;
    case "percent-of-percent":
      return `${state.otherPercent}% de ${state.percent}% do inteiro = ${format(ratioValue(launch, state))}% do inteiro.`;
    case "fraction":
      return `${state.percent}% = ${state.percent}/100 = ${format(state.percent / 100)} do inteiro.`;
    case "percent":
      return `${state.percent}% de ${state.base} = ${format(ratioValue(launch, state))}.`;
    case "successive":
    case "tax":
      return `Base ${state.base}; mudança ${state.change}% → ${format(successiveValues(state).intermediate)}; mudança ${state.secondChange}% → ${format(successiveValues(state).final)}. Valores sem arredondamento intermediário.`;
    case "unknown":
      return `Valor final ${state.base}, variação ${state.change}%, fator ${format(1 + state.change / 100)}; base ${format(ratioValue(launch, state))}.`;
    case "share":
      return `Razão A:B = ${state.partA}:${state.partB}; ampliada ${state.factor} vezes: ${state.partA * state.factor}:${state.partB * state.factor}. A representa ${format(ratioValue(launch, state))}% do todo.`;
    case "unit":
      return `${state.base} dividido por ${state.partA} = ${format(ratioValue(launch, state))} por unidade.`;
    case "inverse":
      return `${state.workers} pessoas × ${format(ratioValue(launch, state))} horas = ${state.work} pessoa-horas.`;
    case "partition":
      return `Total ${state.base}, razão ${state.partA}:${state.partB}; A recebe ${format(ratioValue(launch, state))} e B recebe ${format(state.base - ratioValue(launch, state))}.`;
  }
}
export const ratiosTool: ToolModule = {
  family: "L03",
  modes: Object.keys(ratioCases),
  activity(launch) {
    const definition = ratioDefinition(launch);
    return activity(
      definition.title,
      definition.prompt,
      {
        base: launch.variant ? 300 : 200,
        percent:
          launch.mode === "base-e-acima-de-cem"
            ? 150
            : definition.kind === "fraction" && launch.variant
              ? 75
              : 25,
        otherPercent: launch.variant ? 40 : 60,
        otherBase: launch.variant ? 360 : 240,
        change:
          definition.kind === "tax" || launch.mode === "recuperar-base"
            ? -20
            : 20 + launch.variant * 10,
        secondChange:
          definition.kind === "tax"
            ? 10
            : launch.mode === "aumento-e-desconto"
              ? -(20 + launch.variant * 10)
              : -20,
        partA: 2 + launch.variant,
        partB: 3,
        factor: 2,
        workers: 3 + launch.variant,
        work: 24,
      },
      definition.label,
      {
        answerKeys: [
          "decimal",
          "fraction",
          ...(definition.kind === "variation" || definition.kind === "points"
            ? ["negative" as const]
            : []),
        ],
        answerHint:
          "Use decimal ou fração. Se houver muitas casas, arredonde para 4 casas decimais.",
        rubric: [
          "A base da razão ou porcentagem está identificada.",
          "A unidade e o fator usados combinam com a situação.",
          "A conclusão considera cada mudança na ordem indicada.",
        ],
      },
    );
  },
  parse: parseRatios,
  assess(launch, raw, answer) {
    const state = parseRatios(launch, raw);
    const kind = ratioDefinition(launch).kind;
    return assessNumber(
      answer,
      ratioValue(launch, state),
      "Use a base e a unidade indicadas na montagem; em mudanças sucessivas, multiplique os fatores.",
      ratiosSummary(launch, state),
      ["share", "variation", "percent-of-percent"].includes(kind)
        ? "%"
        : kind === "points"
          ? ["pontos percentuais", "ponto percentual", "p.p.", "pp"]
          : kind === "unit"
            ? launch.mode === "taxa-unitaria"
              ? ["km/L", "km/l"]
              : "km/h"
            : kind === "inverse"
              ? ["h", "horas", "hora"]
              : undefined,
    );
  },
  summarize: (launch, raw) => ratiosSummary(launch, parseRatios(launch, raw)),
};
