import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { findTurmaWithSchoolById, userHasMemberInTurma } from "@/features/turmas/repository";
import type { TurmaWithSchool } from "@/features/turmas/types";
import {
  deleteSubjectById,
  findSubjectById,
  findTurmasOfUserMissingSubjects,
  insertSubjectIfNotExists,
  isSubjectInUseByOtherUsers,
  listSubjectsForTurma,
  updateSubjectById,
} from "./repository";
import type { CreateSubjectInput, DeleteSubjectInput, UpdateSubjectInput } from "./schemas";
import type { Subject, TurmaNeedingSubjects } from "./types";
import { isMinorNameEdit } from "./utils";

export type SubjectError =
  | { code: "TURMA_NOT_FOUND" }
  | { code: "NOT_A_MEMBER" }
  | { code: "FORBIDDEN" }
  | { code: "NOT_FOUND" }
  | { code: "DUPLICATE" }
  | { code: "IN_USE_BY_OTHERS" }
  | { code: "NAME_CHANGE_TOO_BIG" };

// Quem pode criar: qualquer membro da turma (creator OU alguém com perfil vinculado).
export async function createSubject(
  userId: string,
  input: CreateSubjectInput,
): Promise<Result<Subject, SubjectError>> {
  const turma = await findTurmaWithSchoolById(input.turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });

  const isCreator = turma.createdByUserId === userId;
  const isMember = isCreator || (await userHasMemberInTurma(userId, input.turmaId));
  if (!isMember) return err({ code: "NOT_A_MEMBER" });

  const result = await insertSubjectIfNotExists({
    turmaId: input.turmaId,
    name: input.name,
    teacherName: input.teacherName ?? null,
    createdByUserId: userId,
  });
  if (!result.created) return err({ code: "DUPLICATE" });
  return ok(result.subject);
}

// Quem pode editar: só quem criou a matéria.
// Regras adicionais:
//   - `teacherName` é sempre livre — não afeta semântica da matéria.
//   - `name` é livre quando ninguém mais usa a matéria. Quando outras famílias
//     já usam (atividades vinculadas), só permite "ajuste pequeno" — acento,
//     caixa, pontuação ou erro de digitação até ~3 caracteres. Mudar
//     "Matemática" pra "Educação Física" bloqueia com NAME_CHANGE_TOO_BIG.
//     (Critério em `isMinorNameEdit` — `utils.ts`.)
export async function updateSubject(
  userId: string,
  input: UpdateSubjectInput,
): Promise<Result<Subject, SubjectError>> {
  const subject = await findSubjectById(input.id);
  if (!subject) return err({ code: "NOT_FOUND" });
  if (subject.createdByUserId !== userId) return err({ code: "FORBIDDEN" });

  if (subject.name !== input.name) {
    const inUse = await isSubjectInUseByOtherUsers(subject.id, userId);
    if (inUse && !isMinorNameEdit(subject.name, input.name)) {
      return err({ code: "NAME_CHANGE_TOO_BIG" });
    }
  }

  const updated = await updateSubjectById(input.id, {
    name: input.name,
    teacherName: input.teacherName ?? null,
  });
  if (!updated) return err({ code: "NOT_FOUND" });
  return ok(updated);
}

// Quem pode excluir: mesmas regras de edit.
export async function deleteSubject(
  userId: string,
  input: DeleteSubjectInput,
): Promise<Result<true, SubjectError>> {
  const subject = await findSubjectById(input.id);
  if (!subject) return err({ code: "NOT_FOUND" });
  if (subject.createdByUserId !== userId) return err({ code: "FORBIDDEN" });

  if (await isSubjectInUseByOtherUsers(subject.id, userId)) {
    return err({ code: "IN_USE_BY_OTHERS" });
  }

  const removed = await deleteSubjectById(input.id);
  if (!removed) return err({ code: "NOT_FOUND" });
  return ok(true);
}

export type SubjectsForTurmaResult = {
  turma: TurmaWithSchool;
  subjects: Subject[];
  // Pode adicionar matérias? Qualquer membro (creator ou perfil vinculado) pode.
  // Editar/excluir é per-matéria (subject.createdByUserId === currentUserId no client).
  canCreateSubject: boolean;
};

// Acesso ao listar: creator OU algum perfil do user é membro.
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
  return ok({ turma, subjects, canCreateSubject: isMember });
}

export async function listTurmasNeedingSubjectsForUser(
  userId: string,
): Promise<TurmaNeedingSubjects[]> {
  return findTurmasOfUserMissingSubjects(userId);
}
