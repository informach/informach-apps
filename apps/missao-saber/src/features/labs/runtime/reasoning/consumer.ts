import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, choiceAssessment, ensureMode, money, roundedAssessment } from "./common";
export const consumerSchema = z
  .object({
    unitCents: z.number().int().min(0).max(100000),
    take: z.number().int().min(2).max(10),
    pay: z.number().int().min(1).max(10),
    needed: z.number().int().min(1).max(100),
    fixedCents: z.number().int().min(0).max(100000),
    uses: z.number().int().min(1).max(100),
    alternateCents: z.number().int().min(0).max(100000),
  })
  .strict();
export type ConsumerState = z.infer<typeof consumerSchema>;
export const consumerDefinitions: Record<string, { title: string; question: string }> = {
  "leve-pague": {
    title: "Levar mais e pagar menos unidades",
    question:
      "A promoção vale somente para grupos completos: leve L e pague P. Qual é o preço efetivo de cada unidade levada em um grupo? Compare preço da etiqueta, total pago e unidades recebidas.",
  },
  "custo-por-uso": {
    title: "O preço de cada utilização",
    question:
      "Um passe tem o preço fixo indicado e é usado a quantidade informada. Qual é o custo médio por uso? O custo por uso depende de quantas vezes o passe realmente é utilizado.",
  },
  "passe-ou-avulso": {
    title: "Pagar cada uso ou comprar um passe",
    question:
      "Para a quantidade de usos indicada, o passe de preço fixo ou os bilhetes avulsos custam menos? Compare totais para a mesma necessidade.",
  },
  "economia-por-quantidade": {
    title: "Economia de uma unidade e economia total",
    question:
      "O preço original e o preço alternativo são por unidade. Quanto se economiza na quantidade necessária? Se a alternativa for mais cara, use um número negativo.",
  },
};
function definition(launch: ToolLaunch) {
  ensureMode(launch, "L16", Object.keys(consumerDefinitions));
  const result = consumerDefinitions[launch.mode];
  if (!result) throw new Error("Roteiro de consumo ausente.");
  return result;
}
export function parseConsumer(launch: ToolLaunch, raw: unknown) {
  definition(launch);
  const state = consumerSchema.parse(raw);
  if (state.pay > state.take)
    throw new Error("Nesta promoção, as unidades pagas não superam as recebidas.");
  return state;
}
export function consumerMetrics(state: ConsumerState) {
  return {
    promotionTotal: state.unitCents * state.pay,
    unitEffective: (state.unitCents * state.pay) / state.take,
    packs: Math.ceil(state.needed / state.take),
    perUse: state.fixedCents / state.uses,
    ticketsTotal: state.unitCents * state.uses,
    saving: (state.unitCents - state.alternateCents) * state.needed,
  };
}
export function consumerSummary(launch: ToolLaunch, state: ConsumerState) {
  const metrics = consumerMetrics(state);
  return `${definition(launch).title}. ${launch.mode === "leve-pague" ? `Leve ${state.take}, pague ${state.pay}: grupo custa ${money(metrics.promotionTotal)}; ${money(metrics.unitEffective)} por unidade levada.` : launch.mode === "economia-por-quantidade" ? `${state.needed} unidades: preço original ${money(state.unitCents)}, alternativa ${money(state.alternateCents)}; economia total ${money(metrics.saving)}.` : `Passe ${money(state.fixedCents)} para ${state.uses} usos; custo por uso ${money(metrics.perUse)}; avulso ${money(state.unitCents)} por uso, total ${money(metrics.ticketsTotal)}.`}`;
}
export const consumerTool: ToolModule = {
  family: "L16",
  modes: Object.keys(consumerDefinitions),
  parse: parseConsumer,
  activity: (launch) =>
    activity({
      title: definition(launch).title,
      prompt: definition(launch).question,
      initialState: {
        unitCents: 600 + launch.variant * 300,
        take: 4 + launch.variant,
        pay: 3,
        needed: 8 + launch.variant * 2,
        fixedCents: 7200 + launch.variant * 2400,
        uses: 12 + launch.variant * 4,
        alternateCents: 350 + launch.variant * 100,
      },
      answerLabel: launch.mode === "passe-ou-avulso" ? "Opção de menor custo" : "Seu valor em R$",
      choices: launch.mode === "passe-ou-avulso" ? ["Passe", "Avulsos", "Mesmo custo"] : undefined,
      answerKeys:
        launch.mode === "passe-ou-avulso"
          ? []
          : launch.mode === "economia-por-quantidade"
            ? ["decimal", "fraction", "negative"]
            : ["decimal", "fraction"],
      answerHint: "Arredonde apenas a resposta final aos centavos. Não é preciso escrever R$.",
    }),
  summarize: (launch, raw) => consumerSummary(launch, parseConsumer(launch, raw)),
  assess: (launch, raw, answer) => {
    const state = parseConsumer(launch, raw);
    const metrics = consumerMetrics(state);
    const summary = consumerSummary(launch, state);
    if (launch.mode === "passe-ou-avulso")
      return choiceAssessment(
        answer,
        state.fixedCents === metrics.ticketsTotal
          ? "Mesmo custo"
          : state.fixedCents < metrics.ticketsTotal
            ? "Passe"
            : "Avulsos",
        summary,
        "Compare o custo total das duas opções para a mesma quantidade de usos.",
      );
    const expected =
      launch.mode === "leve-pague"
        ? metrics.unitEffective
        : launch.mode === "custo-por-uso"
          ? metrics.perUse
          : metrics.saving;
    return roundedAssessment(
      answer,
      expected / 100,
      summary,
      launch.mode === "leve-pague"
        ? `Divida o total pago ${money(metrics.promotionTotal)} pelas ${state.take} unidades recebidas.`
        : launch.mode === "custo-por-uso"
          ? "Divida o preço do passe pela quantidade real de usos."
          : "Multiplique a diferença entre preços unitários pela quantidade necessária.",
      2,
      "money",
    );
  },
};
