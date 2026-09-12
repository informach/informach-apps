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
  grade: string;
  classLetter: string;
  schoolName: string;
};

export type StudentProfileWithActiveTurma = StudentProfile & {
  activeTurma: StudentProfileActiveTurma | null;
};
