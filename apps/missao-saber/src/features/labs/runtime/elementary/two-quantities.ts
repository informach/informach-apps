import { z } from "zod";
import type { ToolAssessment, ToolLaunch } from "../types";
import { activity, assessNumber } from "./math";

export const twoQuantitiesMode = "duas-quantidades";
export const noteValues: readonly number[] = [2, 5, 10, 20, 50];
const amount = z.number().int().min(0).max(60);
const trialSchema = z.object({ first: amount, second: amount }).strict();
export const twoQuantitiesSchema = z
  .object({
    kind: z.enum(["animais", "notas", "precos", "diferenca", "dobro"]),
    first: amount,
    second: amount,
    targetTotal: amount,
    targetValue: z.number().int().min(0).max(60),
    firstValue: z.number().int().min(1).max(50),
    secondValue: z.number().int().min(1).max(50),
    difference: amount,
    trials: z.array(trialSchema).max(12),
    enumerated: z.boolean(),
  })
  .strict()
  .refine(
    (state) =>
      state.kind !== "notas" ||
      (noteValues.includes(state.firstValue) && noteValues.includes(state.secondValue)),
    "Escolha uma das cédulas disponíveis: 2, 5, 10, 20 ou 50 reais.",
  )
  .refine(
    (state) => state.kind !== "precos" || (state.firstValue <= 10 && state.secondValue <= 10),
    "Neste desenho, cada preço vai de 1 a 10 reais.",
  );
export type TwoQuantitiesState = z.infer<typeof twoQuantitiesSchema>;
export const parseTwoQuantities = (raw: unknown) => twoQuantitiesSchema.parse(raw);
export const usesMoney = (state: TwoQuantitiesState) =>
  state.kind === "notas" || state.kind === "precos";

export function twoQuantitiesChecks(state: TwoQuantitiesState) {
  const total = state.first + state.second;
  const weighted = state.first * state.firstValue + state.second * state.secondValue;
  const checks = usesMoney(state)
    ? [{ label: "Valor em reais", actual: weighted, expected: state.targetValue }]
    : [
        { label: "Quantidade ao todo", actual: total, expected: state.targetTotal },
        state.kind === "animais"
          ? {
              label: "Patas ao todo",
              actual: state.first * 2 + state.second * 4,
              expected: state.targetValue,
            }
          : state.kind === "diferenca"
            ? {
                label: "Quanto A tem a mais que B",
                actual: state.first - state.second,
                expected: state.difference,
              }
            : {
                label: "Quantidade em A (o dobro de B)",
                actual: state.first,
                expected: state.second * 2,
              },
      ];
  return checks.map((check) => ({ ...check, met: check.actual === check.expected }));
}

/** Nonnegative quantities are bounded by the given total, or by the positive note values. */
export function twoQuantitiesSolutions(state: TwoQuantitiesState) {
  const limitA = usesMoney(state)
    ? Math.floor(state.targetValue / state.firstValue)
    : state.targetTotal;
  const limitB = usesMoney(state)
    ? Math.floor(state.targetValue / state.secondValue)
    : state.targetTotal;
  const solutions: { first: number; second: number }[] = [];
  for (let first = 0; first <= limitA; first++)
    for (let second = 0; second <= limitB; second++)
      if (twoQuantitiesChecks({ ...state, first, second }).every((check) => check.met))
        solutions.push({ first, second });
  return solutions;
}

export function twoQuantitiesSummary(state: TwoQuantitiesState) {
  const names =
    state.kind === "animais"
      ? ["galinhas", "cachorros"]
      : state.kind === "notas"
        ? [`notas de ${state.firstValue} reais`, `notas de ${state.secondValue} reais`]
        : state.kind === "precos"
          ? [`objetos A de ${state.firstValue} reais`, `objetos B de ${state.secondValue} reais`]
          : ["objetos em A", "objetos em B"];
  return `${state.first} ${names[0]} e ${state.second} ${names[1]}. ${twoQuantitiesChecks(state)
    .map(
      (check) =>
        `${check.label}: ${check.actual}; procuramos ${check.expected} (${check.met ? "confere" : "ainda não confere"})`,
    )
    .join(". ")}.`;
}

export function twoQuantitiesActivity(launch: ToolLaunch) {
  return activity(
    "Tente duas quantidades",
    "Monte dois grupos e confira todas as condições. Comece com galinhas e cachorros: o total de animais e o de patas precisam conferir juntos. Você também pode investigar notas, uma diferença ou o dobro. Anote as tentativas para não repetir caminhos.",
    {
      kind: "animais",
      first: 6 + launch.variant * 2,
      second: 0,
      targetTotal: 6 + launch.variant * 2,
      targetValue: 16 + launch.variant * 6,
      firstValue: 2,
      secondValue: 5,
      difference: 2,
      trials: [],
      enumerated: false,
    },
    "Quantidade no grupo B, ou escreva impossível",
    {
      prediction:
        "Se trocar uma galinha por um cachorro, o que muda no número de animais e no número de patas?",
      observation: "Anote uma tentativa. Confira cada condição e decida o que mudar na próxima.",
      explanation:
        "Mostre como seus dois grupos atendem a tudo o que o problema pede. Uma tentativa que falhou basta para dizer que é impossível?",
      answerHint:
        "A quantidade em B só confere quando a montagem atende a todas as condições. Para concluir impossível, use a conferência de todas as tentativas possíveis.",
      rubric: [
        "Desenhei cada objeto em um dos dois grupos.",
        "Conferi todas as condições, não apenas uma.",
        "Anotei as tentativas e expliquei minha conclusão.",
      ],
    },
  );
}

export function assessTwoQuantities(raw: unknown, answer: string): ToolAssessment {
  const state = parseTwoQuantities(raw);
  const summary = twoQuantitiesSummary(state);
  if (
    answer
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") === "impossivel"
  ) {
    const correct = state.enumerated && twoQuantitiesSolutions(state).length === 0;
    return {
      correct,
      summary,
      message: correct
        ? "Conferiu: a lista completa não tem nenhuma montagem que atenda a todas as condições."
        : "Uma tentativa que falhou não prova que é impossível. Confira todas as possibilidades e procure uma que atenda a tudo.",
    };
  }
  if (!twoQuantitiesChecks(state).every((check) => check.met))
    return {
      correct: false,
      summary,
      message:
        "Sua montagem ainda não atende a todas as condições. Compare os totais com o que procuramos e tente novamente.",
    };
  return assessNumber(
    answer,
    state.second,
    "Os dois grupos atendem a todas as condições ao mesmo tempo.",
    summary,
  );
}
