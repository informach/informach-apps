import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { findTurmaWithSchoolById, userHasMemberInTurma } from "@/features/turmas/repository";
import type { TurmaWithSchool } from "@/features/turmas/types";
import {
  deleteSubjectById,
  findSubjectById,
  findTurmasOfUserMissingSubjects,
  insertSubjectIfNotExists,
  listSubjectsForTurma,
  updateSubjectById,
} from "./repository";
import type { CreateSubjectInput, DeleteSubjectInput, UpdateSubjectInput } from "./schemas";
import type { Subject, TurmaNeedingSubjects } from "./types";

export type SubjectError =
  | { code: "TURMA_NOT_FOUND" }
  | { code: "FORBIDDEN" }
  | { code: "NOT_FOUND" }
  | { code: "DUPLICATE" };

export async function createSubject(
  userId: string,
  input: CreateSubjectInput,
): Promise<Result<Subject, SubjectError>> {
  const turma = await findTurmaWithSchoolById(input.turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });
  if (turma.createdByUserId !== userId) return err({ code: "FORBIDDEN" });

  const result = await insertSubjectIfNotExists({
    turmaId: input.turmaId,
    name: input.name,
    teacherName: input.teacherName ?? null,
    createdByUserId: userId,
  });
  if (!result.created) return err({ code: "DUPLICATE" });
  return ok(result.subject);
}

export async function updateSubject(
  userId: string,
  input: UpdateSubjectInput,
): Promise<Result<Subject, SubjectError>> {
  const subject = await findSubjectById(input.id);
  if (!subject) return err({ code: "NOT_FOUND" });

  const turma = await findTurmaWithSchoolById(subject.turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });
  if (turma.createdByUserId !== userId) return err({ code: "FORBIDDEN" });

  const updated = await updateSubjectById(input.id, {
    name: input.name,
    teacherName: input.teacherName ?? null,
  });
  if (!updated) return err({ code: "NOT_FOUND" });
  return ok(updated);
}

export async function deleteSubject(
  userId: string,
  input: DeleteSubjectInput,
): Promise<Result<true, SubjectError>> {
  const subject = await findSubjectById(input.id);
  if (!subject) return err({ code: "NOT_FOUND" });

  const turma = await findTurmaWithSchoolById(subject.turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });
  if (turma.createdByUserId !== userId) return err({ code: "FORBIDDEN" });

  const removed = await deleteSubjectById(input.id);
  if (!removed) return err({ code: "NOT_FOUND" });
  return ok(true);
}

export type SubjectsForTurmaResult = {
  turma: TurmaWithSchool;
  subjects: Subject[];
  canManage: boolean;
};

// Acesso ao listar: creator OU algum perfil do user é membro. canManage=true só pro creator.
export async function getSubjectsForUserAndTurma(
  userId: string,
  turmaId: string,
): Promise<Result<SubjectsForTurmaResult, { code: "TURMA_NOT_FOUND" | "FORBIDDEN" }>> {
  const turma = await findTurmaWithSchoolById(turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });

  const isCreator = turma.createdByUserId === userId;
  const isMember = isCreator || (await userHasMemberInTurma(userId, turmaId));
  if (!isMember) return err({ code: "FORBIDDEN" });

  const subjects = await listSubjectsForTurma(turmaId);
  return ok({ turma, subjects, canManage: isCreator });
}

export async function listTurmasNeedingSubjectsForUser(
  userId: string,
): Promise<TurmaNeedingSubjects[]> {
  return findTurmasOfUserMissingSubjects(userId);
}
