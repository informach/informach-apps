import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import {
  activity,
  choiceAssessment,
  ensureMode,
  money,
  numberAssessment,
  openAssessment,
  roundedAssessment,
} from "./common";
import { consumerTool } from "./consumer";

const cents = z.number().int().min(0).max(1000000);
const offerSchema = z
  .object({
    priceCents: cents,
    amount: z.number().int().min(1).max(10000),
    freightCents: cents,
    lossPercent: z.number().int().min(0).max(90),
  })
  .strict();
export const budgetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("shop"),
      offerA: offerSchema,
      offerB: offerSchema,
      needed: z.number().int().min(1).max(10000),
      packsA: z.number().int().min(0).max(10000),
      packsB: z.number().int().min(0).max(10000),
      purchases: z.number().int().min(1).max(12),
    })
    .strict(),
  z
    .object({
      kind: z.literal("budget"),
      incomeCents: cents,
      fixedCents: cents,
      weeklyCents: cents,
      annualCents: cents,
      leisureCents: cents,
      includeLeisure: z.boolean(),
      emergencyCents: cents,
      goalCents: cents,
      alreadySavedCents: cents,
      months: z.number().int().min(1).max(24),
      contributionCents: cents,
    })
    .strict(),
  z
    .object({
      kind: z.literal("coins"),
      counts: z.array(z.number().int().min(0).max(20)).length(5),
    })
    .strict(),
]);
export type BudgetState = z.infer<typeof budgetSchema>;
export type ShopState = Extract<BudgetState, { kind: "shop" }>;
export type LedgerState = Extract<BudgetState, { kind: "budget" }>;
type BudgetDefinition = {
  title: string;
  kind: BudgetState["kind"];
  question: string;
  target:
    | "unit"
    | "packs"
    | "compare"
    | "useful"
    | "balance"
    | "opportunity"
    | "goal"
    | "margin"
    | "open"
    | "change";
};
export const budgetDefinitions: Record<string, BudgetDefinition> = {
  "preco-unitario": {
    title: "Compare a mesma unidade",
    kind: "shop",
    target: "unit",
    question:
      "As quantidades dos pacotes são dadas em gramas. Qual é o preço de 1 kg na oferta A, antes de frete e perdas? O pacote mais barato nem sempre tem o menor preço por kg.",
  },
  "pacotes-sobras-e-total": {
    title: "Só vendem pacotes inteiros",
    kind: "shop",
    target: "packs",
    question:
      "Ajuste a quantidade de pacotes A para atender à necessidade com o menor número de pacotes. Qual é o custo total dessa compra, incluindo o frete uma única vez?",
  },
  "unidade-comum": {
    title: "Gramas e quilogramas na mesma base",
    kind: "shop",
    target: "compare",
    question:
      "Compare o preço por kg das ofertas A e B, sem frete e perdas. Qual tem o menor preço unitário? A quantidade mostrada em kg representa exatamente os mesmos gramas do campo.",
  },
  "frete-perdas-e-condicoes": {
    title: "O que chega e o que você paga",
    kind: "shop",
    target: "compare",
    question:
      "Compre só de uma oferta, em pacotes inteiros, para atender à quantidade útil necessária. Qual custa menos após considerar perdas e frete por pedido?",
  },
  "quantidade-util-e-frequencia": {
    title: "Uma compra recorrente",
    kind: "shop",
    target: "useful",
    question:
      "Cada compra precisa atender à mesma quantidade útil. Qual é o custo total de usar a oferta A no número de compras indicado? Cada pedido paga seu próprio frete; sobras não passam ao pedido seguinte neste cenário.",
  },
  ofertas: {
    title: "O menor percentual pode não ganhar",
    kind: "shop",
    target: "compare",
    question:
      "Compare os preços finais informados nas duas ofertas e as quantidades que realmente serão usadas. Qual compra atende à necessidade pelo menor total com frete e perdas?",
  },
  "entradas-e-saidas": {
    title: "Quanto entra, quanto sai",
    kind: "budget",
    target: "balance",
    question:
      "Organize as entradas e saídas do mês. Qual é o saldo mensal depois de despesas e contribuição para a meta? Valores negativos indicam que o plano precisa mudar.",
  },
  "periodos-e-condicoes": {
    title: "Compare o mesmo período",
    kind: "budget",
    target: "balance",
    question:
      "Converta as despesas para um mês deste cenário: 4 semanas de gastos semanais e 1/12 da despesa anual. Qual é o saldo mensal depois de todas as reservas?",
  },
  "categorias-sem-duplicar": {
    title: "Cada saída aparece uma vez",
    kind: "budget",
    target: "balance",
    question:
      "As linhas representam gastos distintos. A reserva anual é um valor separado dos gastos fixos: não some novamente um subtotal. Qual é o saldo deste orçamento?",
  },
  "meta-prazo-contribuicao": {
    title: "Uma meta com data",
    kind: "budget",
    target: "goal",
    question:
      "Sem rendimentos, qual é a menor contribuição mensal em reais para alcançar a meta no prazo, considerando o que já está guardado? Arredonde para cima ao centavo para não faltar dinheiro.",
  },
  "imprevistos-e-margem": {
    title: "Quanto imprevisto cabe?",
    kind: "budget",
    target: "margin",
    question:
      "Qual é o maior imprevisto que cabe no orçamento sem ficar negativo, mantendo as despesas e a contribuição? A margem é calculada antes do imprevisto atual. Se o plano já estiver negativo, responda “não existe”.",
  },
  "receitas-despesas-saldo": {
    title: "Um orçamento que fecha",
    kind: "budget",
    target: "balance",
    question:
      "Mude uma entrada ou uma despesa e observe o fluxo. Qual é o saldo mensal depois da contribuição para a meta?",
  },
  "custo-oportunidade": {
    title: "Escolher uma coisa adia outra",
    kind: "budget",
    target: "opportunity",
    question:
      "Se o gasto mensal com lazer for direcionado à meta, quanto dinheiro adicional seria guardado ao longo do prazo? O cenário considera esse mesmo gasto em cada mês, sem rendimentos.",
  },
  "limites-e-prioridades": {
    title: "Prioridades dentro do limite",
    kind: "budget",
    target: "open",
    question:
      "Ajuste lazer, contribuição e imprevisto para montar um plano que caiba na renda. Justifique quais despesas manteve e qual efeito sua decisão tem na meta.",
  },
  "metas-e-imprevistos": {
    title: "Uma meta que resiste a mudanças",
    kind: "budget",
    target: "goal",
    question:
      "Calcule a contribuição mensal necessária para a meta. Depois confira se ela cabe no orçamento com o imprevisto; precisar de um valor não significa poder guardá-lo.",
  },
  "justificar-replanejamento": {
    title: "Replanejar com critérios",
    kind: "budget",
    target: "open",
    question:
      "Compare o orçamento e a meta. Replaneje prazo, contribuição ou gasto opcional e explique o benefício e o custo de cada mudança.",
  },
  "moedas-preco-troco": {
    title: "Pague e confira o troco",
    kind: "coins",
    target: "change",
    question:
      "Escolha moedas suficientes para pagar o preço indicado. Quanto deve voltar de troco, em reais? A montagem pode ter moedas diferentes e continuar correta.",
  },
};
export const coinCents = [10, 25, 50, 100, 200];
export function budgetDefinition(launch: ToolLaunch) {
  ensureMode(launch, "L16", Object.keys(budgetDefinitions));
  const definition = budgetDefinitions[launch.mode];
  if (!definition) throw new Error("Roteiro de orçamento não publicado.");
  return definition;
}
export function budgetInitial(launch: ToolLaunch): BudgetState {
  const definition = budgetDefinition(launch);
  if (definition.kind === "coins")
    return {
      kind: "coins",
      counts:
        launch.grade <= 3
          ? launch.variant === 0
            ? [0, 0, 0, 2, 0]
            : [0, 1, 0, 1, 1]
          : launch.variant === 0
            ? [0, 0, 0, 1, 2]
            : [0, 0, 1, 1, 3],
    };
  if (definition.kind === "shop")
    return {
      kind: "shop",
      offerA: {
        priceCents: 1200 + launch.variant * 300,
        amount: 750,
        freightCents: 400,
        lossPercent: 10,
      },
      offerB: {
        priceCents: 1500 + launch.variant * 100,
        amount: 1000,
        freightCents: 800,
        lossPercent: 20,
      },
      needed: 1600 + launch.variant * 600,
      packsA: 1,
      packsB: 1,
      purchases: 3 + launch.variant,
    };
  return {
    kind: "budget",
    incomeCents: 150000 + launch.variant * 30000,
    fixedCents: 60000,
    weeklyCents: 10000 + launch.variant * 2000,
    annualCents: 120000,
    leisureCents: 15000,
    includeLeisure: true,
    emergencyCents: launch.variant * 5000,
    goalCents: 120000 + launch.variant * 60000,
    alreadySavedCents: 20000,
    months: 8 + launch.variant * 2,
    contributionCents: 12500,
  };
}
export function parseBudget(launch: ToolLaunch, raw: unknown) {
  const definition = budgetDefinition(launch);
  const state = budgetSchema.parse(raw);
  if (state.kind !== definition.kind) throw new Error("Representação financeira incompatível.");
  if (
    state.kind === "shop" &&
    (Math.floor((state.offerA.amount * (100 - state.offerA.lossPercent)) / 100) < 1 ||
      Math.floor((state.offerB.amount * (100 - state.offerB.lossPercent)) / 100) < 1)
  )
    throw new Error("Cada pacote deve fornecer ao menos 1 g útil.");
  if (state.kind === "budget" && state.alreadySavedCents > state.goalCents)
    throw new Error(
      "O valor já guardado não pode superar a meta deste roteiro; aumente a meta primeiro.",
    );
  return state;
}
export function offerMetrics(offer: z.infer<typeof offerSchema>, needed: number, packs: number) {
  const usefulPerPack = Math.floor((offer.amount * (100 - offer.lossPercent)) / 100);
  const minimumPacks = Math.ceil(needed / usefulPerPack);
  return {
    unitCentsPerKg: (offer.priceCents * 1000) / offer.amount,
    usefulPerPack,
    minimumPacks,
    minimumTotalCents: minimumPacks * offer.priceCents + offer.freightCents,
    chosenUseful: packs * usefulPerPack,
    chosenTotalCents: packs * offer.priceCents + (packs > 0 ? offer.freightCents : 0),
    surplus: packs * usefulPerPack - needed,
  };
}
export function ledgerMetrics(state: LedgerState) {
  const annualReserveCents = Math.ceil(state.annualCents / 12);
  const expensesCents =
    state.fixedCents +
    state.weeklyCents * 4 +
    annualReserveCents +
    (state.includeLeisure ? state.leisureCents : 0);
  const beforeEmergencyCents = state.incomeCents - expensesCents - state.contributionCents;
  const contributionNeededCents = Math.ceil(
    (state.goalCents - state.alreadySavedCents) / state.months,
  );
  return {
    annualReserveCents,
    expensesCents,
    beforeEmergencyCents,
    balanceCents: beforeEmergencyCents - state.emergencyCents,
    contributionNeededCents,
    projectedSavedCents: state.alreadySavedCents + state.contributionCents * state.months,
    affordableContributionCents: state.incomeCents - expensesCents - state.emergencyCents,
  };
}
export function coinPrice(launch: ToolLaunch) {
  return launch.grade <= 3 ? 150 + launch.variant * 75 : launch.variant === 0 ? 375 : 625;
}
export function coinTotal(state: Extract<BudgetState, { kind: "coins" }>) {
  return state.counts.reduce((sum, count, index) => sum + count * (coinCents[index] ?? 0), 0);
}
export function summarizeBudget(launch: ToolLaunch, state: BudgetState) {
  if (state.kind === "coins")
    return `Preço: ${money(coinPrice(launch))}. Moedas: ${state.counts.map((count, index) => `${count} de ${money(coinCents[index] ?? 0)}`).join("; ")}. Total entregue: ${money(coinTotal(state))}.`;
  if (state.kind === "shop") {
    const a = offerMetrics(state.offerA, state.needed, state.packsA);
    const b = offerMetrics(state.offerB, state.needed, state.packsB);
    return `Necessidade por pedido: ${state.needed} g úteis. Oferta A: ${state.packsA} pacotes, ${a.chosenUseful} g úteis, ${money(a.chosenTotalCents)}; B: ${state.packsB} pacotes, ${b.chosenUseful} g úteis, ${money(b.chosenTotalCents)}. Frete cobrado por pedido; quantidade útil arredondada para baixo ao grama.`;
  }
  const metrics = ledgerMetrics(state);
  return `Período: um mês didático de 4 semanas. Renda ${money(state.incomeCents)}; despesas ${money(metrics.expensesCents)}; meta ${money(state.goalCents)} em ${state.months} meses; contribuição ${money(state.contributionCents)}; imprevisto ${money(state.emergencyCents)}; saldo ${money(metrics.balanceCents)}. Reserva anual arredondada para cima ao centavo.`;
}
const shoppingTool: ToolModule = {
  family: "L16",
  modes: Object.keys(budgetDefinitions),
  parse: parseBudget,
  activity: (launch) => {
    const definition = budgetDefinition(launch);
    return activity({
      title: definition.title,
      prompt: `${definition.question}${definition.kind === "coins" ? ` Preço: ${money(coinPrice(launch))}.` : ""}`,
      initialState: budgetInitial(launch),
      answerLabel:
        definition.target === "compare"
          ? "Oferta mais econômica"
          : definition.target === "open"
            ? "Justifique seu plano"
            : definition.target === "margin"
              ? "Seu valor em R$ ou “não existe”"
              : "Seu valor em R$",
      choices:
        definition.target === "compare" ? ["Oferta A", "Oferta B", "Mesmo custo"] : undefined,
      answerKeys:
        definition.target === "compare" || definition.target === "open"
          ? []
          : definition.target === "balance"
            ? ["decimal", "fraction", "negative"]
            : ["decimal", "fraction"],
      answerHint:
        definition.target === "open" || definition.target === "compare"
          ? undefined
          : "Use reais, como 12,50. Não é preciso escrever R$. Nos preços por kg, arredonde só a resposta final aos centavos.",
      rubric: [
        "Comparar períodos e unidades iguais",
        "Contar cada custo uma única vez",
        "Explicar sobras, prazo e escolhas",
      ],
    });
  },
  summarize: (launch, raw) => summarizeBudget(launch, parseBudget(launch, raw)),
  assess: (launch, raw, answer) => {
    const state = parseBudget(launch, raw);
    const definition = budgetDefinition(launch);
    const summary = summarizeBudget(launch, state);
    if (state.kind === "coins") {
      if (coinTotal(state) < coinPrice(launch))
        return {
          correct: false,
          summary,
          message:
            "As moedas ainda não pagam o preço. Acrescente moedas antes de calcular o troco.",
        };
      return numberAssessment(
        answer,
        (coinTotal(state) - coinPrice(launch)) / 100,
        summary,
        "Troco = total entregue − preço. Montagens com moedas diferentes são aceitas quando o valor fecha.",
        0.000001,
        "money",
      );
    }
    if (state.kind === "shop") {
      const a = offerMetrics(state.offerA, state.needed, state.packsA);
      const b = offerMetrics(state.offerB, state.needed, state.packsB);
      if (definition.target === "compare") {
        const unit = launch.mode === "unidade-comum";
        const costA = unit ? a.unitCentsPerKg : a.minimumTotalCents;
        const costB = unit ? b.unitCentsPerKg : b.minimumTotalCents;
        return choiceAssessment(
          answer,
          Math.abs(costA - costB) < 1e-8 ? "Mesmo custo" : costA < costB ? "Oferta A" : "Oferta B",
          summary,
          unit
            ? `Na mesma unidade: A custa ${money(costA)} por kg e B ${money(costB)} por kg, antes de frete e perdas.`
            : `Com pacotes inteiros suficientes: A custa ${money(costA)} (${a.minimumPacks} pacotes); B custa ${money(costB)} (${b.minimumPacks} pacotes).`,
        );
      }
      if (definition.target === "packs" && state.packsA !== a.minimumPacks)
        return {
          correct: false,
          summary,
          message: `A montagem precisa usar o menor número de pacotes suficiente: ${a.minimumPacks}. Confira a quantidade útil de cada pacote.`,
        };
      const expectedCents =
        definition.target === "unit"
          ? a.unitCentsPerKg
          : definition.target === "useful"
            ? a.minimumTotalCents * state.purchases
            : a.minimumTotalCents;
      return roundedAssessment(
        answer,
        expectedCents / 100,
        summary,
        definition.target === "unit"
          ? `Preço por kg = preço do pacote ÷ gramas × 1000 = ${money(expectedCents)}.`
          : `A compra mínima usa ${a.minimumPacks} pacotes por pedido. Total pedido: ${money(a.minimumTotalCents)}${definition.target === "useful" ? `; em ${state.purchases} pedidos: ${money(expectedCents)}` : ""}.`,
        2,
        "money",
      );
    }
    const metrics = ledgerMetrics(state);
    if (definition.target === "open")
      return openAssessment(
        `${summary} A montagem ${metrics.balanceCents >= 0 ? "cabe" : "não cabe"} no orçamento atual; a meta projetada é ${money(metrics.projectedSavedCents)}.`,
        [
          "Manter saldo não negativo ou explicar o ajuste necessário",
          "Mostrar efeito sobre a meta",
          "Justificar a prioridade sem contar despesas duas vezes",
        ],
      );
    if (definition.target === "margin" && metrics.beforeEmergencyCents < 0)
      return choiceAssessment(
        answer,
        "não existe",
        summary,
        `O plano já falta ${money(-metrics.beforeEmergencyCents)} antes de imprevistos. Nem um imprevisto de zero mantém o saldo não negativo; replaneje despesas ou contribuição.`,
      );
    const expectedCents =
      definition.target === "goal"
        ? metrics.contributionNeededCents
        : definition.target === "opportunity"
          ? state.leisureCents * state.months
          : definition.target === "margin"
            ? metrics.beforeEmergencyCents
            : metrics.balanceCents;
    const explanation =
      definition.target === "goal"
        ? `Faltam ${money(state.goalCents - state.alreadySavedCents)} em ${state.months} meses: contribuição de ${money(expectedCents)}, arredondada para cima. ${metrics.affordableContributionCents >= expectedCents ? "Esse valor cabe no orçamento atual." : "Esse valor não cabe no orçamento atual; será preciso replanejar."}`
        : `Com os períodos normalizados, o resultado é ${money(expectedCents)}. Uma despesa anual entra como reserva de 1/12; o gasto semanal aparece quatro vezes neste mês didático.`;
    return numberAssessment(answer, expectedCents / 100, summary, explanation, 0.000001, "money");
  },
};
export const budgetTool: ToolModule = {
  family: "L16",
  modes: [...shoppingTool.modes, ...consumerTool.modes],
  activity: (launch) =>
    (consumerTool.modes.includes(launch.mode) ? consumerTool : shoppingTool).activity(launch),
  parse: (launch, raw) =>
    (consumerTool.modes.includes(launch.mode) ? consumerTool : shoppingTool).parse(launch, raw),
  summarize: (launch, raw) =>
    (consumerTool.modes.includes(launch.mode) ? consumerTool : shoppingTool).summarize(launch, raw),
  assess: (launch, raw, answer) =>
    (consumerTool.modes.includes(launch.mode) ? consumerTool : shoppingTool).assess(
      launch,
      raw,
      answer,
    ),
};
