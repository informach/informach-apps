import { subjectsParserSchema } from "@/ai/subjects-parser/schema";
export class NoSubjectsFoundError extends Error {
  constructor(readonly reason: string) {
    super("NO_SUBJECTS_FOUND");
  }
}
export function validatedSubjectResult(value: unknown) {
  const result = subjectsParserSchema.parse(value);
  if (!result.isValidInput || !result.subjects.length)
    throw new NoSubjectsFoundError(
      result.reason || "Não identifiquei matérias. Confira o conteúdo e tente novamente.",
    );
  return result;
}
