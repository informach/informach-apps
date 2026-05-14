import type { AgendaClassDay } from "@informach/db/schema";

export type Subject = {
  id: string;
  turmaId: string;
  name: string;
  teacherName: string | null;
  colorIndex: number;
  classDays: AgendaClassDay[];
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
