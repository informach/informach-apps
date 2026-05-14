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
  subjectNameExistsInTurmaExceptId,
  updateSubjectById,
} from "./repository";
import type {
  CreateSubjectInput,
  CreateSubjectsBatchInput,
  DeleteSubjectInput,
  UpdateSubjectInput,
} from "./schemas";
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
  // Fluxo single-create mantém semântica antiga: só "created" conta como
  // sucesso. "merged" e "skipped" (vindos da extensão pro batch) são
  // tratados como duplicata pra esse caller — o user clicou "Nova matéria"
  // e nada novo foi criado.
  if (result.status !== "created") return err({ code: "DUPLICATE" });
  return ok(result.subject);
}

// ──────────────────────────────────────────────────────────────────────────
// Batch insert (consumido pelo fluxo "cadastrar matérias por voz/imagem"
// via IA). Single advisor lock por turma serializa color picking; cada item
// roda numa transação separada para que falha em um não aborte os outros.
// ──────────────────────────────────────────────────────────────────────────

export type BatchSubjectResultItem =
  | { name: string; status: "created"; id: string }
  | { name: string; status: "merged"; id: string }
  | { name: string; status: "skipped"; id: string };

export type CreateSubjectsBatchCounts = {
  created: number;
  merged: number;
  skipped: number;
};

export type CreateSubjectsBatchResult = {
  items: BatchSubjectResultItem[];
  counts: CreateSubjectsBatchCounts;
  turmaId: string;
};

export type CreateSubjectsBatchError = { code: "TURMA_NOT_FOUND" } | { code: "NOT_A_MEMBER" };

/**
 * Insere N matérias numa única turma. Checa membership uma vez no início —
 * se não-membro, recusa toda a chamada (vira nada). Itera serialmente sobre
 * os itens; falha em um (improvável depois da validação Zod) NÃO aborta os
 * outros — vira `skipped` com `name` registrado pra que a UI mostre.
 */
export async function createSubjectsBatch(
  userId: string,
  input: CreateSubjectsBatchInput,
): Promise<Result<CreateSubjectsBatchResult, CreateSubjectsBatchError>> {
  const turma = await findTurmaWithSchoolById(input.turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });

  const isCreator = turma.createdByUserId === userId;
  const isMember = isCreator || (await userHasMemberInTurma(userId, input.turmaId));
  if (!isMember) return err({ code: "NOT_A_MEMBER" });

  const items: BatchSubjectResultItem[] = [];
  const counts: CreateSubjectsBatchCounts = { created: 0, merged: 0, skipped: 0 };

  for (const subject of input.subjects) {
    const result = await insertSubjectIfNotExists({
      turmaId: input.turmaId,
      name: subject.name,
      teacherName: subject.teacherName ?? null,
      createdByUserId: userId,
    });
    items.push({ name: subject.name, status: result.status, id: result.subject.id });
    counts[result.status]++;
  }

  return ok({ items, counts, turmaId: input.turmaId });
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
    if (await subjectNameExistsInTurmaExceptId(subject.turmaId, input.name, subject.id)) {
      return err({ code: "DUPLICATE" });
    }

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
