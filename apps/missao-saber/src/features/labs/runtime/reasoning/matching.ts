import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, choiceAssessment, ensureMode } from "./common";
export const matchingSchema = z
  .object({
    pets: z.array(z.enum(["gato", "cão", "peixe"])).length(3),
    eliminated: z.array(z.number().int().min(0).max(8)).max(9),
  })
  .strict();
export type MatchingState = z.infer<typeof matchingSchema>;
export const matchingAnimals: MatchingState["pets"] = ["gato", "cão", "peixe"];
export function matchingPeople(launch: ToolLaunch) {
  return launch.variant === 0 ? ["Ana", "Bruno", "Caio"] : ["Duda", "Eli", "Fábio"];
}
export function matchingClues(launch: ToolLaunch) {
  const names = matchingPeople(launch);
  return launch.variant === 0
    ? [`${names[0]} não tem o gato.`, `${names[1]} tem o peixe.`]
    : [`${names[2]} não tem o cão.`, `${names[0]} tem o peixe.`];
}
export function parseMatching(launch: ToolLaunch, raw: unknown) {
  ensureMode(launch, "L15", ["associacoes-por-pistas"]);
  const state = matchingSchema.parse(raw);
  if (new Set(state.pets).size !== 3 || new Set(state.eliminated).size !== state.eliminated.length)
    throw new Error("Cada pessoa tem um animal diferente, sem marca repetida.");
  return state;
}
export function validMatching(launch: ToolLaunch, state: MatchingState) {
  return launch.variant === 0
    ? state.pets[0] !== "gato" && state.pets[1] === "peixe"
    : state.pets[2] !== "cão" && state.pets[0] === "peixe";
}
export function validEliminations(launch: ToolLaunch, state: MatchingState) {
  // A mark excludes an association, not just the currently displayed permutation.
  const solutions = matchingAnimals
    .flatMap((first) =>
      matchingAnimals.flatMap((second) =>
        matchingAnimals.map((third) => ({ pets: [first, second, third], eliminated: [] })),
      ),
    )
    .filter((candidate) => new Set(candidate.pets).size === 3 && validMatching(launch, candidate));
  return state.eliminated.every((cell) =>
    solutions.every(
      (solution) => solution.pets[Math.floor(cell / 3)] !== matchingAnimals[cell % 3],
    ),
  );
}
export function matchingSummary(launch: ToolLaunch, state: MatchingState) {
  return `${matchingClues(launch).join(" ")} Montagem: ${matchingPeople(launch)
    .map((person, index) => `${person}: ${state.pets[index]}`)
    .join(
      "; ",
    )}. Associações riscadas: ${state.eliminated.map((cell) => `${matchingPeople(launch)[Math.floor(cell / 3)]} com ${matchingAnimals[cell % 3]}`).join("; ") || "nenhuma"}. Cada animal pertence a exatamente uma pessoa.`;
}
export const matchingTool: ToolModule = {
  family: "L15",
  modes: ["associacoes-por-pistas"],
  parse: parseMatching,
  activity: (launch) => {
    ensureMode(launch, "L15", ["associacoes-por-pistas"]);
    return activity({
      title: "Cruzar pessoas, animais e pistas",
      prompt: `Cada pessoa tem exatamente um animal diferente. ${matchingClues(launch).join(" ")} Monte a associação e conclua quem tem o gato.`,
      initialState: { pets: ["gato", "cão", "peixe"], eliminated: [] },
      answerLabel: "Quem tem o gato?",
      choices: matchingPeople(launch),
    });
  },
  summarize: (launch, raw) => matchingSummary(launch, parseMatching(launch, raw)),
  assess: (launch, raw, answer) => {
    const state = parseMatching(launch, raw);
    const summary = matchingSummary(launch, state);
    if (!validMatching(launch, state) || !validEliminations(launch, state))
      return {
        correct: false,
        summary,
        message:
          "A montagem viola uma pista ou uma associação possível foi riscada. Confira cada pista e a regra de um animal diferente por pessoa.",
      };
    const expected = matchingPeople(launch)[2];
    if (!expected) throw new Error("Pessoa do roteiro ausente.");
    return choiceAssessment(
      answer,
      expected,
      summary,
      "As pistas, junto com a regra de um animal diferente por pessoa, determinam a associação.",
    );
  },
};
