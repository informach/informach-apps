import type { ToolActivity, ToolAssessment, ToolLaunch, ToolState } from "../types";
import { formatNumber, numericAnswer } from "./math";
export function assertMode(launch: ToolLaunch, family: string, modes: readonly string[]) {
  if (launch.family !== family || !modes.includes(launch.mode))
    throw new Error("Modo de laboratório inválido.");
  if (
    !Number.isInteger(launch.grade) ||
    launch.grade < 2 ||
    launch.grade > 12 ||
    ![0, 1].includes(launch.variant)
  )
    throw new Error("Faixa ou variante inválida.");
}
export function activity(
  title: string,
  prompt: string,
  state: ToolState,
  options: Partial<ToolActivity> = {},
): ToolActivity {
  return {
    title,
    prompt,
    initialState: state,
    prediction: "O que você acha que vai acontecer? Faça uma previsão antes de mexer.",
    observation: "Mude uma coisa de cada vez. O que mudou? O que permaneceu igual?",
    explanation: "Como a representação ajuda a explicar sua resposta?",
    rubric: [
      "Relacionar a resposta à montagem atual.",
      "Comparar pelo menos duas configurações.",
      "Explicar as condições necessárias para a regra valer.",
    ],
    answerLabel: "Sua resposta",
    answerHint: "Você pode escrever decimal com vírgula ou uma fração, como 1/2.",
    answerKeys: options.choices ? undefined : ["decimal", "fraction"],
    ...options,
  };
}
export function checked(
  correct: boolean,
  expected: string,
  reasoning: string,
  summary: string,
): ToolAssessment {
  return {
    correct,
    message: correct
      ? `Isso! ${reasoning}`
      : `Nesta montagem, a resposta é ${expected}. ${reasoning} Mude a montagem e tente prever antes de conferir.`,
    summary,
  };
}
export function numericChecked(
  answer: string,
  value: number,
  reasoning: string,
  summary: string,
  tolerance = 1e-8,
) {
  return checked(numericAnswer(answer, value, tolerance), formatNumber(value), reasoning, summary);
}
export const normalized = (answer: string) =>
  answer
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
