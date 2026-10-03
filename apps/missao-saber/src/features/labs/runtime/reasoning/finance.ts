import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import {
  activity,
  choiceAssessment,
  decimal,
  ensureMode,
  money,
  openAssessment,
  roundedAssessment,
} from "./common";

const moneyValue = z.number().int().min(0).max(100000000);
export const financeSchema = z
  .object({
    principalCents: moneyValue,
    rateBps: z.number().int().min(-500).max(500),
    periods: z.number().int().min(1).max(36),
    contributionCents: moneyValue,
    timing: z.enum(["beginning", "end"]),
    inflationBps: z.number().int().min(-500).max(1000),
    feeCents: moneyValue,
    taxBps: z.number().int().min(0).max(5000),
    downCents: moneyValue,
    installmentCents: moneyValue,
    portfolioA: z.number().int().min(0).max(100),
    returnABps: z.number().int().min(-10000).max(10000),
    returnBBps: z.number().int().min(-10000).max(10000),
    priceCents: z.number().int().min(1).max(1000000),
    variableCostCents: moneyValue,
    fixedCostCents: moneyValue,
    liquidityMonths: z.number().int().min(0).max(36),
    deadlineMonths: z.number().int().min(0).max(36),
    flows: z
      .array(
        z
          .object({
            id: z.number().int().min(1).max(1000000),
            month: z.number().int().min(0).max(36),
            cents: z.number().int().min(-100000000).max(100000000),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    assumptions: z.array(z.enum(["taxa", "liquidez", "custos", "risco", "inflacao"])).max(5),
  })
  .strict();
export type FinanceState = z.infer<typeof financeSchema>;
export type FinanceMetric =
  | "simple"
  | "compound"
  | "contributions"
  | "credit"
  | "present"
  | "installments"
  | "flows"
  | "real"
  | "basket"
  | "net"
  | "return"
  | "portfolio"
  | "average"
  | "breakeven"
  | "annual-rate"
  | "liquidity"
  | "open";
export type FinanceField =
  | "principalCents"
  | "rateBps"
  | "periods"
  | "contributionCents"
  | "inflationBps"
  | "feeCents"
  | "taxBps"
  | "downCents"
  | "installmentCents"
  | "portfolioA"
  | "returnABps"
  | "returnBBps"
  | "priceCents"
  | "variableCostCents"
  | "fixedCostCents"
  | "liquidityMonths"
  | "deadlineMonths";
type FinanceDefinition = {
  title: string;
  question: string;
  metric: FinanceMetric;
  fields: FinanceField[];
  display?: "timeline" | "portfolio" | "basket" | "risk" | "business";
  rubric?: string[];
};
const growthFields: FinanceField[] = ["principalCents", "rateBps", "periods"];
const riskFields: FinanceField[] = [
  "principalCents",
  "portfolioA",
  "returnABps",
  "returnBBps",
  "liquidityMonths",
  "deadlineMonths",
];
export const financeDefinitions: Record<string, FinanceDefinition> = {
  "juros-simples": {
    title: "Juros sempre sobre o capital inicial",
    question:
      "Qual é o montante no final do prazo, com juros simples mensais? Observe que o acréscimo de cada mês é constante.",
    metric: "simple",
    fields: growthFields,
  },
  "juros-compostos": {
    title: "Juros sobre o saldo de cada mês",
    question:
      "Qual é o montante no final do prazo, com juros compostos mensais? Compare a base de cálculo de dois meses consecutivos.",
    metric: "compound",
    fields: growthFields,
  },
  "entrada-e-parcelas": {
    title: "O total pago inclui a entrada",
    question:
      "Qual é o total nominal pago pela compra, somando a entrada no mês zero e todas as parcelas mensais iguais? Compare-o com o preço à vista. O total nominal não desconta datas diferentes.",
    metric: "credit",
    fields: ["principalCents", "downCents", "installmentCents", "periods"],
  },
  "divida-versus-poupar": {
    title: "Duas estratégias na mesma data",
    question:
      "Compare o custo do crédito com a estratégia de guardar o valor da parcela ao final de cada mês. Explique o efeito da data em que o bem fica disponível e do custo de esperar.",
    metric: "open",
    fields: ["principalCents", "rateBps", "periods", "downCents", "installmentCents"],
    rubric: [
      "Comparar os valores na mesma data",
      "Declarar o rendimento assumido",
      "Considerar necessidade e custo de esperar",
    ],
  },
  "comparar-creditos": {
    title: "Preço à vista e valor presente das parcelas",
    question:
      "Pela taxa mensal informada, qual é o valor presente da entrada e das parcelas? A entrada ocorre hoje e a primeira parcela no final do primeiro mês. Compare depois com o preço à vista.",
    metric: "installments",
    fields: ["principalCents", "rateBps", "downCents", "installmentCents", "periods"],
  },
  "cesta-e-poder-compra": {
    title: "A mesma cesta, novos preços",
    question:
      "A cesta inicial tem os pesos indicados para os grupos A e B. Qual é a variação percentual do custo da mesma cesta após os reajustes? As quantidades compradas permanecem iguais.",
    metric: "basket",
    fields: ["principalCents", "portfolioA", "returnABps", "returnBBps"],
    display: "basket",
  },
  "nominal-real": {
    title: "O saldo cresce mais que os preços?",
    question:
      "Qual é a variação real percentual do poder de compra no prazo? Use o fator do rendimento nominal dividido pelo fator da inflação acumulada; subtrair taxas é apenas aproximação.",
    metric: "real",
    fields: [...growthFields, "inflationBps"],
  },
  "indice-ponderado": {
    title: "Itens diferentes têm pesos diferentes",
    question:
      "Calcule o índice percentual de reajuste da cesta de quantidades fixas. Use a participação inicial de cada grupo no custo total.",
    metric: "basket",
    fields: ["principalCents", "portfolioA", "returnABps", "returnBBps"],
    display: "basket",
  },
  "valores-no-tempo": {
    title: "Um gráfico em reais de hoje",
    question:
      "Qual é a variação real percentual no prazo? Compare a curva nominal com a curva corrigida pela inflação mensal informada.",
    metric: "real",
    fields: [...growthFields, "inflationBps"],
  },
  "analisar-afirmacoes": {
    title: "Crescer em reais basta para enriquecer?",
    question:
      "Use as curvas nominal e real para avaliar a frase “se o saldo aumentou em reais, o poder de compra aumentou”. Declare em quais condições ela é verdadeira ou falsa.",
    metric: "open",
    fields: [...growthFields, "inflationBps"],
    rubric: [
      "Comparar fatores acumulados",
      "Identificar a inflação do mesmo período",
      "Apresentar uma conclusão condicional",
    ],
  },
  "rendimento-e-premissas": {
    title: "Uma projeção depende das hipóteses",
    question:
      "Qual é o montante projetado sob taxa mensal constante e capitalização composta? Identifique a hipótese que permite prolongar a curva.",
    metric: "compound",
    fields: growthFields,
  },
  "crescimento-e-aportes": {
    title: "O momento do aporte muda o resultado",
    question:
      "Qual é o saldo após os meses indicados, com aportes mensais iguais? Compare aportar no início e no fim de cada mês.",
    metric: "contributions",
    fields: [...growthFields, "contributionCents"],
  },
  "risco-liquidez-prazo": {
    title: "O dinheiro estará disponível a tempo?",
    question:
      "O recurso fica disponível no fim da carência indicada. Ele atende à data da necessidade? Esta comparação de datas não elimina o risco de perda.",
    metric: "liquidity",
    fields: riskFields,
    display: "risk",
  },
  diversificacao: {
    title: "Distribuir sem prometer ausência de risco",
    question:
      "Compare carteiras com pesos diferentes nos dois ativos do cenário. Explique como perdas simultâneas podem atingir até uma carteira diversificada.",
    metric: "open",
    fields: riskFields,
    display: "portfolio",
    rubric: [
      "Usar os pesos da carteira",
      "Testar perdas simultâneas",
      "Não confundir diversificação com garantia",
    ],
  },
  "objetivos-custos-cenarios": {
    title: "O objetivo muda a comparação",
    question:
      "Compare montante líquido, prazo de disponibilidade e cenários de retorno. Justifique uma escolha para o objetivo informado, indicando o que mudaria sua conclusão.",
    metric: "open",
    fields: [...growthFields, "feeCents", "taxBps", "liquidityMonths", "deadlineMonths"],
    display: "risk",
    rubric: [
      "Descontar custos",
      "Conferir a data da necessidade",
      "Explicitar os riscos e as hipóteses",
    ],
  },
  "linear-exponencial": {
    title: "Acréscimo fixo ou crescimento proporcional",
    question:
      "Qual é o montante composto no final do prazo? Compare sua curva com os juros simples sobre o mesmo capital, taxa mensal e prazo.",
    metric: "compound",
    fields: growthFields,
  },
  "parametros-graficos": {
    title: "O que cada parâmetro muda na curva",
    question:
      "Mude capital, taxa ou prazo separadamente. Qual é o montante composto da configuração atual? Observe intercepto, crescimento e horizonte.",
    metric: "compound",
    fields: growthFields,
  },
  "ponto-equilibrio": {
    title: "Receita cobre o custo?",
    question:
      "Quantas unidades inteiras precisam ser vendidas para que a receita cubra custo fixo e custo variável? O preço e o custo por unidade são constantes. Se não houver equilíbrio, responda “não existe”.",
    metric: "breakeven",
    fields: ["fixedCostCents", "priceCents", "variableCostCents"],
    display: "business",
  },
  "taxas-equivalentes": {
    title: "Uma taxa mensal vira uma taxa anual",
    question:
      "Qual é a taxa efetiva equivalente em 12 meses? Capitalização composta: não basta multiplicar a taxa mensal por 12.",
    metric: "annual-rate",
    fields: ["rateBps"],
  },
  "modelar-premissas": {
    title: "Escolha o modelo e declare seus limites",
    question:
      "Compare as curvas simples e composta. Diga que hipótese sobre a base de juros faz cada modelo adequado e quais dados faltariam para modelar uma situação real.",
    metric: "open",
    fields: growthFields,
    rubric: [
      "Nomear a base de cálculo",
      "Vincular taxa e período",
      "Distinguir hipótese de dado observado",
    ],
  },
  "presente-futuro": {
    title: "Trazer um valor futuro para hoje",
    question:
      "O valor principal será recebido ao final do prazo. Qual é seu valor presente pela taxa composta mensal informada? Mantenha as datas explícitas.",
    metric: "present",
    fields: growthFields,
  },
  "valor-presente-parcelas": {
    title: "Cada parcela tem sua data",
    question:
      "Qual é o valor presente da entrada e das parcelas? A entrada é no mês 0; as parcelas iguais vencem nos meses 1 até o prazo informado.",
    metric: "installments",
    fields: ["rateBps", "periods", "downCents", "installmentCents"],
  },
  "antecipacao-atraso": {
    title: "Mudar a data muda a comparação",
    question:
      "Um pagamento principal está previsto para o fim do prazo. Qual valor hoje é equivalente a ele pela taxa mensal indicada? Compare antecipar com capitalizar novamente até a data original.",
    metric: "present",
    fields: growthFields,
  },
  "fluxos-em-datas": {
    title: "Entradas e saídas em datas diferentes",
    question:
      "Qual é o valor presente líquido dos fluxos? Entradas são positivas; saídas são negativas. Traga cada fluxo ao mês 0 pela mesma taxa mensal.",
    metric: "flows",
    fields: ["rateBps"],
    display: "timeline",
  },
  "comparar-premissas": {
    title: "A mesma sequência, outra taxa",
    question:
      "Mude a taxa de comparação e observe o valor presente dos fluxos. Explique por que uma escolha pode mudar e indique a hipótese que sustenta sua conclusão.",
    metric: "open",
    fields: ["rateBps"],
    display: "timeline",
    rubric: [
      "Comparar fluxos na mesma data",
      "Usar uma taxa por mês",
      "Explicar a sensibilidade à taxa",
    ],
  },
  "prefixado-posfixado-inflacao": {
    title: "Taxa definida, indexada ou ligada à inflação",
    question:
      "O cenário A aplica a taxa mensal informada; o cenário B acompanha a inflação mais um adicional mensal de 0,5%, multiplicando os fatores. Compare-os e explique por que uma taxa futura indexada depende de hipótese.",
    metric: "open",
    fields: [...growthFields, "inflationBps"],
    rubric: [
      "Comparar fatores no mesmo prazo",
      "Distinguir taxa conhecida de indexador projetado",
      "Relacionar retorno nominal e real",
    ],
  },
  "prazo-carencia-liquidez": {
    title: "Vencimento não é disponibilidade imediata",
    question:
      "Pela carência informada, será possível usar o dinheiro até o mês da necessidade? A disponibilidade acontece no fim do mês de carência.",
    metric: "liquidity",
    fields: ["liquidityMonths", "deadlineMonths"],
    display: "risk",
  },
  "impostos-taxas-liquido": {
    title: "Do valor bruto ao valor líquido",
    question:
      "Qual é o montante líquido no resgate? Neste modelo, a taxa de imposto didática incide só sobre rendimento positivo; a tarifa fixa é cobrada no resgate. Arredonde apenas o resultado final aos centavos.",
    metric: "net",
    fields: [...growthFields, "feeCents", "taxBps"],
  },
  "credito-garantias": {
    title: "Garantia exige condições",
    question:
      "Dois emissores podem ter a mesma projeção e riscos diferentes. Liste quais condições precisaria conhecer sobre emissor, cobertura, limite e prazo de ressarcimento antes de concluir que existe proteção adequada.",
    metric: "open",
    fields: ["principalCents", "liquidityMonths", "deadlineMonths"],
    display: "risk",
    rubric: [
      "Distinguir promessa de retorno e capacidade de pagamento",
      "Pedir condições da garantia",
      "Considerar limites e tempo de recuperação sem presumir cobertura",
    ],
  },
  "comparar-objetivos": {
    title: "Um bom cenário para qual objetivo?",
    question:
      "Compare o valor líquido e a data disponível com a necessidade. Justifique a adequação ao objetivo e diga quais custos ou riscos ainda precisam ser conhecidos.",
    metric: "open",
    fields: [...growthFields, "feeCents", "taxBps", "liquidityMonths", "deadlineMonths"],
    display: "risk",
    rubric: [
      "Comparar com a data do objetivo",
      "Avaliar valor líquido",
      "Identificar informações faltantes",
    ],
  },
  "preco-retorno": {
    title: "Variação do preço e retorno",
    question:
      "Qual é o retorno percentual entre o preço inicial e o preço final? Não há dividendos, impostos nem tarifas neste modo. Relacione o valor ganho ou perdido com o preço inicial.",
    metric: "return",
    fields: ["principalCents", "priceCents"],
    display: "portfolio",
  },
  "oscilacao-perdas": {
    title: "Subir depois de cair",
    question:
      "Aplique primeiro o retorno A e depois o retorno B ao saldo restante. Qual é o retorno percentual acumulado? Uma alta e uma queda do mesmo percentual não se anulam.",
    metric: "average",
    fields: ["principalCents", "returnABps", "returnBBps"],
    display: "portfolio",
  },
  "pesos-carteira": {
    title: "O retorno de uma carteira",
    question:
      "Os dois retornos ocorrem no mesmo período. Qual é o retorno percentual da carteira, usando os pesos iniciais? Não há rebalanceamento, aportes nem custos neste modo.",
    metric: "portfolio",
    fields: ["principalCents", "portfolioA", "returnABps", "returnBBps"],
    display: "portfolio",
  },
  "medias-e-passado": {
    title: "A média aritmética não é o crescimento composto",
    question:
      "Aplique os retornos A e B em dois meses consecutivos. Qual é o retorno acumulado? Compare a média aritmética com a taxa constante equivalente; o histórico não garante o próximo retorno.",
    metric: "average",
    fields: ["principalCents", "returnABps", "returnBBps"],
    display: "portfolio",
  },
  "cenarios-carteira": {
    title: "Pesos diante de cenários diferentes",
    question:
      "Varie pesos e retornos e compare os três cenários. Justifique qual perda sua conclusão admite e por que o cenário central não é uma promessa.",
    metric: "open",
    fields: riskFields,
    display: "portfolio",
    rubric: [
      "Declarar pesos e retornos",
      "Examinar cenário adverso",
      "Não tratar projeção como garantia",
    ],
  },
  "dados-premissas-faltantes": {
    title: "O que sabemos e o que estamos supondo?",
    question:
      "Marque as informações que precisam ser confirmadas. Explique quais são dados do cenário, quais são hipóteses e quais informações faltam para uma decisão.",
    metric: "open",
    fields: [...growthFields, "feeCents", "liquidityMonths", "deadlineMonths"],
    display: "risk",
    rubric: [
      "Distinguir dado e hipótese",
      "Identificar informação decisiva ausente",
      "Limitar a conclusão aos dados disponíveis",
    ],
  },
  sensibilidade: {
    title: "Uma mudança de cada vez",
    question:
      "Mude apenas a taxa mensal e compare as curvas para taxa menor, central e maior. Qual é o montante do cenário central no prazo indicado? A diferença entre cenários mostra sensibilidade, não uma faixa garantida.",
    metric: "compound",
    fields: growthFields,
  },
  "tres-cenarios": {
    title: "Adverso, central e favorável",
    question:
      "Compare três trajetórias: taxa mensal 1 ponto percentual abaixo, igual e 1 ponto acima da hipótese central. Apresente uma conclusão que continue explícita sobre qual cenário está sendo usado.",
    metric: "open",
    fields: growthFields,
    rubric: [
      "Comparar cenários com mesmo capital e prazo",
      "Identificar a variável alterada",
      "Não atribuir probabilidades que o modelo não forneceu",
    ],
  },
  "multiplos-criterios": {
    title: "Não existe uma só coluna na decisão",
    question:
      "Compare retorno, custo e disponibilidade. Explique um compromisso entre os critérios e qual prioridade decorre da data da necessidade.",
    metric: "open",
    fields: [...growthFields, "feeCents", "taxBps", "liquidityMonths", "deadlineMonths"],
    display: "risk",
    rubric: ["Usar ao menos dois critérios", "Explicitar a prioridade", "Conferir as datas"],
  },
  "conclusao-condicional": {
    title: "Se as hipóteses mudarem…",
    question:
      "Escreva uma conclusão no formato “Se …, então …; caso …, a escolha muda”. Teste no controle pelo menos uma mudança que poderia alterar a conclusão.",
    metric: "open",
    fields: [...growthFields, "inflationBps", "feeCents", "liquidityMonths", "deadlineMonths"],
    display: "risk",
    rubric: [
      "Nomear as hipóteses",
      "Mostrar a conclusão sob essas hipóteses",
      "Indicar uma mudança que altera o resultado",
    ],
  },
};

export function financeDefinition(launch: ToolLaunch) {
  ensureMode(launch, "L17", Object.keys(financeDefinitions));
  const definition = financeDefinitions[launch.mode];
  if (!definition) throw new Error("Cenário financeiro não publicado.");
  return definition;
}
export function financeInitial(launch: ToolLaunch): FinanceState {
  financeDefinition(launch);
  return {
    principalCents: 100000 + launch.variant * 50000,
    rateBps: 100 + launch.variant * 50,
    periods: 6 + launch.variant * 3,
    contributionCents: 10000,
    timing: "end",
    inflationBps: 50 + launch.variant * 25,
    feeCents: 500,
    taxBps: 1500,
    downCents: 20000,
    installmentCents: 15000 + launch.variant * 2000,
    portfolioA: 60 - launch.variant * 20,
    returnABps: 1000 + launch.variant * 500,
    returnBBps: -500 - launch.variant * 500,
    priceCents:
      launch.mode === "preco-retorno"
        ? 110000 + launch.variant * 70000
        : 2500 + launch.variant * 500,
    variableCostCents: 1500,
    fixedCostCents: 50000 + launch.variant * 10000,
    liquidityMonths: 6 + launch.variant * 2,
    deadlineMonths: 4 + launch.variant * 5,
    flows: [
      { id: 1, month: 0, cents: -100000 - launch.variant * 50000 },
      { id: 2, month: 1, cents: 40000 + launch.variant * 20000 },
      { id: 3, month: 2, cents: 40000 + launch.variant * 20000 },
      { id: 4, month: 3, cents: 40000 + launch.variant * 20000 },
    ],
    assumptions: [],
  };
}
export function parseFinance(launch: ToolLaunch, raw: unknown) {
  financeDefinition(launch);
  const state = financeSchema.parse(raw);
  if (new Set(state.flows.map((flow) => flow.id)).size !== state.flows.length)
    throw new Error("Cada fluxo precisa ter uma identidade distinta.");
  if (new Set(state.assumptions).size !== state.assumptions.length)
    throw new Error("Uma premissa não deve aparecer repetida.");
  if (
    state.principalCents === 0 &&
    ["real", "return", "portfolio", "average", "basket"].includes(financeDefinition(launch).metric)
  )
    throw new Error("A base de comparação percentual deve ser maior que zero.");
  return state;
}
/** No intermediate monetary rounding: this is an explicit mathematical projection. */
export function compoundCents(principalCents: number, rateBps: number, months: number) {
  return principalCents * (1 + rateBps / 10000) ** months;
}
export function simpleCents(principalCents: number, rateBps: number, months: number) {
  return principalCents * (1 + (rateBps / 10000) * months);
}
export function contributionBalance(
  state: Pick<FinanceState, "principalCents" | "rateBps" | "contributionCents" | "timing">,
  months: number,
) {
  let value = state.principalCents;
  for (let month = 1; month <= months; month++)
    value =
      state.timing === "beginning"
        ? (value + state.contributionCents) * (1 + state.rateBps / 10000)
        : value * (1 + state.rateBps / 10000) + state.contributionCents;
  return value;
}
export function presentValue(flows: readonly { month: number; cents: number }[], rateBps: number) {
  return flows.reduce((sum, flow) => sum + flow.cents / (1 + rateBps / 10000) ** flow.month, 0);
}
export function financialMetrics(state: FinanceState) {
  const future = compoundCents(state.principalCents, state.rateBps, state.periods);
  const gain = future - state.principalCents;
  const tax = (Math.max(0, gain) * state.taxBps) / 10000;
  const rateA = state.returnABps / 10000;
  const rateB = state.returnBBps / 10000;
  const weightedReturn = (state.portfolioA / 100) * rateA + (1 - state.portfolioA / 100) * rateB;
  const sequentialReturn = (1 + rateA) * (1 + rateB) - 1;
  const installmentFlows = [
    { month: 0, cents: state.downCents },
    ...Array.from({ length: state.periods }, (_, index) => ({
      month: index + 1,
      cents: state.installmentCents,
    })),
  ];
  const margin = state.priceCents - state.variableCostCents;
  return {
    simple: simpleCents(state.principalCents, state.rateBps, state.periods),
    future,
    contributionFuture: contributionBalance(state, state.periods),
    present: state.principalCents / (1 + state.rateBps / 10000) ** state.periods,
    installmentsPresent: presentValue(installmentFlows, state.rateBps),
    creditTotal: state.downCents + state.installmentCents * state.periods,
    flowsPresent: presentValue(state.flows, state.rateBps),
    net: future - tax - state.feeCents,
    tax,
    realPercent:
      ((1 + state.rateBps / 10000) ** state.periods /
        (1 + state.inflationBps / 10000) ** state.periods -
        1) *
      100,
    weightedPercent: weightedReturn * 100,
    priceReturnPercent: (state.priceCents / state.principalCents - 1) * 100,
    weightedFuture: state.principalCents * (1 + weightedReturn),
    sequentialPercent: sequentialReturn * 100,
    sequentialFuture: state.principalCents * (1 + sequentialReturn),
    arithmeticMeanPercent: ((rateA + rateB) / 2) * 100,
    geometricMeanPercent: (Math.sqrt((1 + rateA) * (1 + rateB)) - 1) * 100,
    breakEven:
      state.fixedCostCents === 0
        ? 0
        : margin <= 0
          ? null
          : Math.ceil(state.fixedCostCents / margin),
    annualPercent: ((1 + state.rateBps / 10000) ** 12 - 1) * 100,
    liquidInTime: state.liquidityMonths <= state.deadlineMonths,
  };
}
export function financeTimeline(state: FinanceState) {
  return Array.from({ length: state.periods + 1 }, (_, month) => ({
    month,
    simple: simpleCents(state.principalCents, state.rateBps, month),
    compound: compoundCents(state.principalCents, state.rateBps, month),
    contributions: contributionBalance(state, month),
    real:
      compoundCents(state.principalCents, state.rateBps, month) /
      (1 + state.inflationBps / 10000) ** month,
    lower: compoundCents(state.principalCents, state.rateBps - 100, month),
    higher: compoundCents(state.principalCents, state.rateBps + 100, month),
    indexed: state.principalCents * ((1 + state.inflationBps / 10000) * 1.005) ** month,
  }));
}
export function summarizeFinance(launch: ToolLaunch, state: FinanceState) {
  const definition = financeDefinition(launch);
  const metrics = financialMetrics(state);
  const parts = [definition.title];
  if (definition.fields.includes("principalCents"))
    parts.push(`Valor de referência: ${money(state.principalCents)}`);
  if (definition.fields.includes("rateBps"))
    parts.push(`Taxa: ${decimal(state.rateBps / 100)}% ao mês`);
  if (definition.fields.includes("periods")) parts.push(`Prazo: ${state.periods} meses`);
  if (definition.metric === "contributions")
    parts.push(
      `Aportes: ${money(state.contributionCents)} no ${state.timing === "beginning" ? "início" : "fim"} de cada mês`,
    );
  if (definition.fields.includes("inflationBps"))
    parts.push(`Inflação: ${decimal(state.inflationBps / 100)}% ao mês`);
  if (definition.metric === "return")
    parts.push(
      `Preço final: ${money(state.priceCents)}; retorno: ${decimal(metrics.priceReturnPercent)}%`,
    );
  else if (definition.metric === "average")
    parts.push(
      `Retornos sequenciais: ${decimal(state.returnABps / 100)}% e ${decimal(state.returnBBps / 100)}%; acumulado: ${decimal(metrics.sequentialPercent)}%`,
    );
  else if (definition.display === "portfolio" || definition.display === "basket")
    parts.push(
      `Peso A: ${state.portfolioA}%; variações A ${decimal(state.returnABps / 100)}% e B ${decimal(state.returnBBps / 100)}%; resultado ponderado ${decimal(metrics.weightedPercent)}%`,
    );
  if (definition.display === "timeline")
    parts.push(
      `Fluxos: ${state.flows.map((flow) => `mês ${flow.month}: ${money(flow.cents)}`).join("; ")}`,
    );
  if (definition.display === "risk")
    parts.push(
      `Disponível no fim do mês ${state.liquidityMonths}; necessidade no fim do mês ${state.deadlineMonths}`,
    );
  if (definition.fields.includes("feeCents"))
    parts.push(`Tarifa no resgate: ${money(state.feeCents)}`);
  if (definition.fields.includes("taxBps"))
    parts.push(`Imposto didático sobre ganho positivo: ${decimal(state.taxBps / 100)}%`);
  if (definition.display === "business")
    parts.push(
      `Custo fixo ${money(state.fixedCostCents)}, custo por unidade ${money(state.variableCostCents)}, preço por unidade ${money(state.priceCents)}`,
    );
  if (definition.metric === "credit" || definition.metric === "installments")
    parts.push(
      `Entrada ${money(state.downCents)} no mês zero; parcelas de ${money(state.installmentCents)} nos meses 1 a ${state.periods}`,
    );
  parts.push("Sem arredondamento intermediário; resposta monetária final em centavos");
  return `${parts.join(". ")}.`;
}
export const financeTool: ToolModule = {
  family: "L17",
  modes: Object.keys(financeDefinitions),
  parse: parseFinance,
  activity: (launch) => {
    const definition = financeDefinition(launch);
    const percent = ["real", "basket", "return", "portfolio", "average", "annual-rate"].includes(
      definition.metric,
    );
    return activity({
      title: definition.title,
      prompt: definition.question,
      initialState: financeInitial(launch),
      answerLabel:
        definition.metric === "open"
          ? "Sua conclusão com as hipóteses"
          : definition.metric === "liquidity"
            ? "O prazo atende à necessidade?"
            : definition.metric === "breakeven"
              ? "Unidades inteiras ou “não existe”"
              : percent
                ? "Resultado percentual (de 0 a 100 corresponde a 0% a 100%)"
                : "Seu valor em R$",
      answerHint: percent
        ? "Use o percentual, como 12,5 para 12,5%. Valores negativos são aceitos. Arredonde a resposta final a duas casas decimais."
        : "Projeção didática com períodos mensais. Não arredonde os cálculos intermediários; arredonde o valor final aos centavos.",
      choices: definition.metric === "liquidity" ? ["Sim", "Não"] : undefined,
      answerKeys: ["open", "liquidity", "breakeven"].includes(definition.metric)
        ? []
        : ["decimal", "fraction", "negative"],
      rubric: definition.rubric ?? [
        "Vincular cada taxa ao seu período",
        "Declarar datas, custos e hipóteses",
        "Separar projeção de garantia",
      ],
    });
  },
  summarize: (launch, raw) => summarizeFinance(launch, parseFinance(launch, raw)),
  assess: (launch, raw, answer) => {
    const state = parseFinance(launch, raw);
    const definition = financeDefinition(launch);
    const metrics = financialMetrics(state);
    const summary = summarizeFinance(launch, state);
    if (definition.metric === "open")
      return openAssessment(
        summary,
        definition.rubric ?? [
          "Comparar na mesma data",
          "Explicitar hipóteses",
          "Identificar informação ausente",
        ],
      );
    if (definition.metric === "liquidity")
      return choiceAssessment(
        answer,
        metrics.liquidInTime ? "Sim" : "Não",
        summary,
        `A disponibilidade ocorre no fim do mês ${state.liquidityMonths}; a necessidade é no fim do mês ${state.deadlineMonths}. Isso verifica o prazo assumido, não garante ausência de perdas.`,
      );
    if (definition.metric === "breakeven" && metrics.breakEven === null)
      return choiceAssessment(
        answer,
        "não existe",
        summary,
        "Cada venda acrescenta receita menor ou igual ao custo variável e há custo fixo positivo. Nenhuma quantidade vendida cobre o total.",
      );
    const expected =
      definition.metric === "simple"
        ? metrics.simple / 100
        : definition.metric === "compound"
          ? metrics.future / 100
          : definition.metric === "contributions"
            ? metrics.contributionFuture / 100
            : definition.metric === "credit"
              ? metrics.creditTotal / 100
              : definition.metric === "present"
                ? metrics.present / 100
                : definition.metric === "installments"
                  ? metrics.installmentsPresent / 100
                  : definition.metric === "flows"
                    ? metrics.flowsPresent / 100
                    : definition.metric === "real"
                      ? metrics.realPercent
                      : definition.metric === "net"
                        ? metrics.net / 100
                        : definition.metric === "return"
                          ? metrics.priceReturnPercent
                          : definition.metric === "portfolio" || definition.metric === "basket"
                            ? metrics.weightedPercent
                            : definition.metric === "average"
                              ? metrics.sequentialPercent
                              : definition.metric === "annual-rate"
                                ? metrics.annualPercent
                                : (metrics.breakEven ?? 0);
    const explanation =
      definition.metric === "real"
        ? "Divida o fator nominal acumulado pelo fator da inflação acumulada e subtraia 1."
        : definition.metric === "average"
          ? `Multiplique os fatores: (1 + ${decimal(state.returnABps / 100)}%) × (1 + ${decimal(state.returnBBps / 100)}%) − 1. A média aritmética não é o retorno acumulado.`
          : definition.metric === "installments" ||
              definition.metric === "flows" ||
              definition.metric === "present"
            ? "Cada valor é dividido pelo fator mensal elevado ao número de meses até sua data; o fluxo no mês zero não é descontado."
            : definition.metric === "breakeven"
              ? "Divida o custo fixo pela margem de cada unidade e arredonde para cima, pois a venda usa unidades inteiras."
              : definition.metric === "net"
                ? "Calcule o montante bruto, desconte o imposto didático sobre o rendimento positivo e a tarifa fixa do resgate."
                : definition.metric === "annual-rate"
                  ? "A equivalência composta usa (1 + taxa mensal)¹² − 1, mantendo o mesmo regime e sem custos."
                  : "Use as hipóteses e as datas do cenário; arredonde somente o resultado final.";
    return roundedAssessment(
      answer,
      expected,
      summary,
      `${explanation} Resultado: ${decimal(expected)}.`,
      definition.metric === "breakeven" ? 0 : 2,
      ["real", "basket", "return", "portfolio", "average", "annual-rate"].includes(
        definition.metric,
      )
        ? "percent"
        : definition.metric === "breakeven"
          ? "number"
          : "money",
    );
  },
};
