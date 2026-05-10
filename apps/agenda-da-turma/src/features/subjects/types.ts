export type Subject = {
  id: string;
  turmaId: string;
  name: string;
  teacherName: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TurmaNeedingSubjects = {
  turmaId: string;
  schoolName: string;
  grade: string;
  classLetter: string;
  year: number;
};
