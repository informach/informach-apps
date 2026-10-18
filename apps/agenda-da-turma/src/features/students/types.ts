import type { TurmaGrade } from "@/features/turmas/limits";

export type StudentProfile = {
  id: string;
  userId: string;
  name: string;
  birthDate: string | null;
  activeTurmaId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StudentProfileActiveTurma = {
  id: string;
  /** A série como a coluna guarda ("3ano"), para `formatTurmaShort` dizer "3º ano". */
  grade: TurmaGrade;
  classLetter: string;
  schoolName: string;
};

export type StudentProfileWithActiveTurma = StudentProfile & {
  activeTurma: StudentProfileActiveTurma | null;
};
