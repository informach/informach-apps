import type { TurmaGrade } from "./limits";
import type { TurmaWithSchool } from "./types";

export function formatGrade(grade: TurmaGrade): string {
  // "5ano" → "5º ano"
  return `${grade.charAt(0)}º ano`;
}

export function formatTurmaShort(turma: Pick<TurmaWithSchool, "grade" | "classLetter">): string {
  // "5º ano A"
  return `${formatGrade(turma.grade)} ${turma.classLetter}`;
}

export function formatTurmaLabel(
  turma: Pick<TurmaWithSchool, "grade" | "classLetter" | "schoolName">,
): string {
  // "5º ano A na Escola X"
  return `${formatTurmaShort(turma)} na ${turma.schoolName}`;
}
