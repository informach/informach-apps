import { createHash } from "node:crypto";
import { errorFeedback } from "./feedback";
import type { Item, Lesson } from "./types";

// Original authoring source. A row is a distinct problem, not a downloaded or
// transformed official question. Families describe the strategy, not the story.
export type Problem = [
  prompt: string,
  answer: string,
  wrong: string[],
  explanation: string,
  family: string,
  clue: string,
];

// Revisões de autoria; sessões existentes continuam usando seu snapshot.
const lessonVersions: Readonly<Record<string, number>> = {
  "medidas-2": 2,
  "simetria-1": 2,
  "gavetas-2": 2,
  "probabilidade-1": 2,
};
export function makeLesson(
  id: string,
  skillId: string,
  title: string,
  objective: string,
  introduction: string,
  lab: Lesson["lab"],
  rows: Problem[],
  free = false,
): Lesson {
  const items: Item[] = rows.map(([prompt, answer, wrong, explanation, family, clue], index) => {
    const itemId = `${id}-${index + 1}`;
    const optionOrder = (value: string) =>
      createHash("sha256").update(`${itemId}:${value}`).digest("hex");
    const options = [...wrong, answer].sort((a, b) => optionOrder(a).localeCompare(optionOrder(b)));
    const feedback = errorFeedback[id]?.[index];
    if (!feedback || feedback.length !== wrong.length)
      throw new Error(`Missing authored feedback: ${itemId}`);
    return {
      type: "choice",
      id: `${id}-${index + 1}`,
      skillId,
      familyId: `${skillId}:${family}`,
      prompt,
      options,
      answer,
      explanation,
      hints: [
        `Lembre a ideia: ${introduction}`,
        `Aplicando a esta questão: ${clue}`,
        `Resolução guiada: ${explanation}`,
      ],
      purpose: index < 2 ? "discovery" : index < 4 ? "guided-practice" : "independent-practice",
      domain: "common",
      misconceptions: Object.fromEntries(
        wrong.map((value, choiceIndex) => [value, `${feedback[choiceIndex]} ${explanation}`]),
      ),
    };
  });
  return {
    id,
    version: lessonVersions[id] ?? 1,
    skillId,
    title,
    objective,
    introduction,
    lab,
    free,
    kind: "mission",
    stage: id.endsWith("-1") ? "discover" : "practice",
    prerequisites: [],
    estimatedMinutes: 12,
    items,
  };
}
