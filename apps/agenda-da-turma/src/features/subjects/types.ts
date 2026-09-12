import type { AgendaClassDay } from "@informach/db/schema";

// Revezamento quinzenal pra UM dia específico desta matéria.
// `pairedSubjectId` aponta pra outra matéria da turma; `anchorDate` é uma
// data conhecida ("YYYY-MM-DD") em que ESTA matéria teve aula nesse `day`.
// Linha existe ⇒ esse dia da matéria é quinzenal. Sem linha ⇒ semanal.
export type AlternatingSlot = {
  id: string;
  subjectId: string;
  dayOfWeek: AgendaClassDay;
  pairedSubjectId: string;
  anchorDate: string;
};

// Versão pra input (form/IA) — sem `id` (ainda não existe) e sem `subjectId`
// (vem do contexto). UI manda `null` no anchorDate quando o user não quis
// configurar ainda — service rejeita persistir slot sem anchor.
export type AlternatingSlotInput = {
  dayOfWeek: AgendaClassDay;
  pairedSubjectId: string;
  anchorDate: string;
};

export type Subject = {
  id: string;
  turmaId: string;
  name: string;
  teacherName: string | null;
  colorIndex: number;
  classDays: AgendaClassDay[];
  alternatingSlots: AlternatingSlot[];
  createdByUserId: string | null;
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
