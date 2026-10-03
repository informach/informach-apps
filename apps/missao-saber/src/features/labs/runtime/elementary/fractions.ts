import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import {
  activity,
  assessFraction,
  equalRational,
  fractionText,
  plusRational,
  rational,
  requireMode,
} from "./math";

const stripSchema = z
  .object({
    whole: z.number().int().min(1).max(4),
    pieces: z.array(z.number().int().min(1).max(24)).min(1).max(24),
    painted: z.array(z.boolean()).min(1).max(24),
  })
  .strict()
  .refine(
    (strip) =>
      strip.pieces.length === strip.painted.length && strip.pieces.reduce((a, b) => a + b, 0) <= 48,
    "As partes e as marcações precisam corresponder a um inteiro válido.",
  );
export const fractionsSchema = z
  .object({
    first: stripSchema,
    second: stripSchema,
    quantity: z.number().int().min(1).max(120),
    representation: z.enum(["faixa", "regiao", "reta"]).default("faixa"),
  })
  .strict();
export type FractionStrip = z.infer<typeof stripSchema>;
export type FractionsState = z.infer<typeof fractionsSchema>;
type Definition = {
  title: string;
  task:
    | "construct"
    | "compare"
    | "equivalent"
    | "add"
    | "argument"
    | "quantity"
    | "inverse"
    | "complement"
    | "divide"
    | "difference"
    | "equivalence-general";
  prompt: string;
};
export const fractionCases: Record<string, Definition> = {
  "fracao-de-quantidade": {
    title: "Uma fração de uma coleção",
    task: "quantity",
    prompt:
      "O inteiro representa a coleção indicada. Divida a faixa e pinte a fração que quer separar. Quantos objetos essa fração representa? A resposta pode ser fracionária; para separar objetos inteiros, escolha uma divisão que dê uma quantidade inteira.",
  },
  "recuperar-inteiro": {
    title: "Conhecer a parte, descobrir o todo",
    task: "inverse",
    prompt:
      "A parte pintada corresponde à quantidade indicada. Pinte uma fração diferente de zero e descubra quantos objetos corresponderiam ao inteiro. Dividir a quantidade pela fração recupera o todo.",
  },
  "complemento-do-inteiro": {
    title: "Quanto falta para completar?",
    task: "complement",
    prompt:
      "Pinte a parte que já foi usada. Que fração do inteiro ainda está sem pintar? Confira que a parte usada e a parte que falta somam um inteiro.",
  },
  "dividir-por-fracao": {
    title: "Quantas medidas cabem?",
    task: "divide",
    prompt:
      "A faixa A pintada é o comprimento disponível. A faixa B pintada é o comprimento de cada pedaço. Quantas medidas B cabem em A? Pode haver uma parte de medida no final; responda a razão completa, não só os pedaços inteiros.",
  },
  "comparar-fracoes": {
    title: "Comparar duas quantidades",
    task: "difference",
    prompt:
      "Pinte as duas faixas e compare suas medidas, considerando o inteiro de cada uma. Quanto B tem a mais que A, em metros? Um resultado negativo significa que B é menor.",
  },
  "equivalencia-geral": {
    title: "A mesma fração em outra divisão",
    task: "equivalence-general",
    prompt:
      "Pinte uma fração não nula na faixa A e represente essa mesma fração em outra divisão na faixa B. Escreva a fração representada, em qualquer forma equivalente.",
  },
  "partes-iguais": {
    title: "Metade do inteiro",
    task: "construct",
    prompt:
      "Pinte metade do comprimento de cada inteiro. As partes podem ter tamanhos diferentes: compare o comprimento pintado, não só a quantidade de pedaços. Escreva a parte do inteiro que você pintou na faixa A.",
  },
  "comparar-referencias": {
    title: "Metades de inteiros diferentes",
    task: "compare",
    prompt:
      "Pinte a mesma fração nas duas faixas. Cada faixa tem seu próprio comprimento total, indicado em metros. Quantos metros a faixa B pintada tem a mais que a faixa A? Se B for menor, use um valor negativo.",
  },
  "equivalencia-e-razao": {
    title: "Outra divisão, mesma quantidade",
    task: "equivalent",
    prompt:
      "Faça duas divisões diferentes e pinte metade de cada inteiro. Confira pela medida: 1/2 e 2/4 podem cobrir a mesma parte mesmo com números diferentes. Escreva a fração pintada na faixa A.",
  },
  "operacoes-e-receitas": {
    title: "Juntar medidas de uma receita",
    task: "add",
    prompt:
      "Cada faixa representa uma jarra, e o inteiro indica sua capacidade em litros. Pinte o que vai usar de cada jarra. Quantos litros você juntou? A soma depende tanto da fração quanto da capacidade de cada jarra.",
  },
  "argumentar-referencias": {
    title: "Qual é o inteiro?",
    task: "argument",
    prompt:
      "Construa duas metades de inteiros com comprimentos diferentes. Explique por que ser metade não garante ter a mesma quantidade em metros. Cite as medidas da sua montagem.",
  },
  "fracao-decimal-unidade": {
    title: "Meio metro de quatro jeitos",
    task: "construct",
    prompt:
      "A faixa A inteira mede 1 m. Pinte metade dela e escreva o comprimento pintado. Você pode usar fração ou decimal. A unidade m já está indicada no campo.",
  },
};
export function fractionDefinition(launch: ToolLaunch) {
  return requireMode(launch, "L02", fractionCases);
}
export function paintedFraction(strip: FractionStrip) {
  return rational(
    BigInt(
      strip.pieces.reduce((sum, weight, index) => sum + (strip.painted[index] ? weight : 0), 0),
    ),
    BigInt(strip.pieces.reduce((sum, weight) => sum + weight, 0)),
  );
}
export function paintedMeasure(strip: FractionStrip) {
  const fraction = paintedFraction(strip);
  return rational(fraction.numerator * BigInt(strip.whole), fraction.denominator);
}
function sameDivision(first: FractionStrip, second: FractionStrip): boolean {
  const firstTotal = first.pieces.reduce((sum, value) => sum + value, 0);
  const secondTotal = second.pieces.reduce((sum, value) => sum + value, 0);
  return (
    first.pieces.length === second.pieces.length &&
    first.pieces.every(
      (weight, index) => weight * secondTotal === (second.pieces[index] ?? 0) * firstTotal,
    )
  );
}
export function parseFractions(launch: ToolLaunch, raw: unknown): FractionsState {
  fractionDefinition(launch);
  const state = fractionsSchema.parse(raw);
  if (launch.mode === "fracao-decimal-unidade" && state.first.whole !== 1)
    throw new Error("Neste roteiro, o inteiro de referência mede 1 m.");
  return state;
}
export function fractionsSummary(launch: ToolLaunch, state: FractionsState): string {
  const task = fractionDefinition(launch).task;
  const fraction = paintedFraction(state.first);
  if (task === "quantity")
    return `${fractionText(fraction)} de ${state.quantity} objetos = ${fractionText(rational(fraction.numerator * BigInt(state.quantity), fraction.denominator))} objetos.`;
  if (task === "inverse")
    return `A parte ${fractionText(fraction)} corresponde a ${state.quantity} objetos.${fraction.numerator === 0n ? " Pinte uma parte não nula para determinar o inteiro." : ` O inteiro corresponde a ${fractionText(rational(BigInt(state.quantity) * fraction.denominator, fraction.numerator))} objetos.`}`;
  if (task === "complement")
    return `Parte usada ${fractionText(fraction)}; parte que falta ${fractionText(rational(fraction.denominator - fraction.numerator, fraction.denominator))}; total 1 inteiro.`;
  const unit = task === "add" ? "L" : "m";
  return `Faixa A: ${fractionText(paintedFraction(state.first))} de ${state.first.whole} ${unit} = ${fractionText(paintedMeasure(state.first))} ${unit}. Faixa B: ${fractionText(paintedFraction(state.second))} de ${state.second.whole} ${unit} = ${fractionText(paintedMeasure(state.second))} ${unit}.`;
}
export const fractionsTool: ToolModule = {
  family: "L02",
  modes: Object.keys(fractionCases),
  activity(launch) {
    const definition = fractionDefinition(launch);
    const pieces = launch.variant ? [1, 1, 1, 1, 2, 2] : [1, 1, 2, 4];
    const first = { whole: 1, pieces, painted: pieces.map(() => false) };
    const second = {
      whole:
        definition.task === "compare" || definition.task === "argument" ? 2 + launch.variant : 1,
      pieces: [1, 1, 1, 1],
      painted: [true, true, false, false],
    };
    return activity(
      definition.title,
      definition.prompt,
      { first, second, quantity: 24 + launch.variant * 12 },
      definition.task === "argument"
        ? "Sua explicação sobre os inteiros"
        : definition.task === "quantity" || definition.task === "inverse"
          ? "Quantidade de objetos"
          : definition.task === "divide"
            ? "Quantidade de medidas B em A"
            : definition.task === "complement"
              ? "Fração que falta para completar"
              : launch.mode === "fracao-decimal-unidade" ||
                  definition.task === "compare" ||
                  definition.task === "difference"
                ? "Seu valor em m"
                : definition.task === "add"
                  ? "Total em L"
                  : "Parte pintada do inteiro A",
      {
        ...(definition.task === "argument"
          ? {}
          : {
              answerKeys: [
                "decimal",
                "fraction",
                ...(definition.task === "compare" || definition.task === "difference"
                  ? ["negative" as const]
                  : []),
              ],
            }),
        answerHint: "Aceita 1/2, 0,5 ou 0.5. Não é preciso digitar a unidade.",
        prediction:
          "Metade de dois inteiros diferentes terá o mesmo comprimento? Como você pode testar?",
        rubric: [
          "O inteiro de referência aparece em cada medida.",
          "Partes equivalentes ocupam a mesma proporção do inteiro.",
          "A explicação diferencia fração do inteiro e quantidade medida.",
        ],
      },
    );
  },
  parse: parseFractions,
  assess(launch, raw, answer) {
    const state = parseFractions(launch, raw);
    const task = fractionDefinition(launch).task;
    const summary = fractionsSummary(launch, state);
    const fraction = paintedFraction(state.first);
    if (task === "quantity")
      return assessFraction(
        answer,
        rational(fraction.numerator * BigInt(state.quantity), fraction.denominator),
        "Divida o inteiro pelo denominador e use a quantidade de partes indicada pelo numerador.",
        summary,
      );
    if (task === "inverse") {
      if (fraction.numerator === 0n)
        return {
          correct: false,
          message:
            "Uma parte nula não pode corresponder à quantidade positiva indicada. Pinte uma fração diferente de zero.",
          summary,
        };
      return assessFraction(
        answer,
        rational(BigInt(state.quantity) * fraction.denominator, fraction.numerator),
        "A quantidade da parte dividida pela fração recupera o inteiro.",
        summary,
      );
    }
    if (task === "complement")
      return assessFraction(
        answer,
        rational(fraction.denominator - fraction.numerator, fraction.denominator),
        "Parte usada e parte restante somam um inteiro.",
        summary,
      );
    if (task === "divide") {
      const a = paintedMeasure(state.first);
      const b = paintedMeasure(state.second);
      if (b.numerator === 0n)
        return {
          correct: false,
          message: "O comprimento de cada pedaço precisa ser maior que zero. Pinte a faixa B.",
          summary,
        };
      return assessFraction(
        answer,
        rational(a.numerator * b.denominator, a.denominator * b.numerator),
        "Compare comprimentos na mesma unidade: dividir por uma fração é multiplicar pelo inverso.",
        summary,
      );
    }
    if (task === "equivalence-general") {
      if (fraction.numerator === 0n || !equalRational(fraction, paintedFraction(state.second)))
        return {
          correct: false,
          message: "Pinte uma parte não nula e construa a mesma proporção nas duas faixas.",
          summary,
        };
      if (sameDivision(state.first, state.second))
        return {
          correct: false,
          message: "Use divisões diferentes para mostrar uma equivalência.",
          summary,
        };
      return assessFraction(
        answer,
        fraction,
        "Frações equivalentes representam a mesma proporção de seus inteiros.",
        summary,
      );
    }
    if (task === "argument")
      return {
        correct: null,
        message:
          "Compare sua explicação com os critérios: nomear cada inteiro, identificar a metade e comparar as medidas. A conferência automática não valida uma justificativa aberta.",
        summary,
      };
    if (task === "construct" || task === "equivalent") {
      const half = rational(1n, 2n);
      const secondRequired = task === "equivalent" || launch.mode === "partes-iguais";
      if (
        !equalRational(paintedFraction(state.first), half) ||
        (secondRequired && !equalRational(paintedFraction(state.second), half))
      )
        return {
          correct: false,
          message:
            "Primeiro construa metade: o comprimento pintado deve ser igual ao que ficou sem pintar. Contar pedaços de tamanhos diferentes pode enganar.",
          summary,
        };
      if (task === "equivalent" && sameDivision(state.first, state.second))
        return {
          correct: false,
          message:
            "As duas faixas já mostram metade. Agora use divisões diferentes para representar a equivalência, por exemplo 1/2 e 2/4.",
          summary,
        };
      return assessFraction(
        answer,
        half,
        "A metade pode ser escrita como 1/2 ou 0,5.",
        summary,
        launch.mode === "fracao-decimal-unidade" ? "m" : undefined,
      );
    }
    if (
      task === "compare" &&
      !equalRational(paintedFraction(state.first), paintedFraction(state.second))
    )
      return {
        correct: false,
        message:
          "Para comparar inteiros diferentes nesta investigação, primeiro pinte a mesma fração de cada inteiro. As quantidades em metros podem continuar diferentes.",
        summary,
      };
    const a = paintedMeasure(state.first);
    const b = paintedMeasure(state.second);
    const value =
      task === "add" ? plusRational(a, b) : plusRational(b, rational(-a.numerator, a.denominator));
    return assessFraction(
      answer,
      value,
      task === "add"
        ? "Some as quantidades em litros, com um denominador comum quando necessário."
        : "Compare as medidas B e A, usando o inteiro de referência de cada faixa.",
      summary,
      task === "add" ? "L" : "m",
    );
  },
  summarize: (launch, raw) => fractionsSummary(launch, parseFractions(launch, raw)),
};
