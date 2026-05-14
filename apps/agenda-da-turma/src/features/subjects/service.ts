import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { isValidLocalIsoDate, parseLocalIso } from "@/features/dashboard/date";
import { findTurmaWithSchoolById, userHasMemberInTurma } from "@/features/turmas/repository";
import type { TurmaWithSchool } from "@/features/turmas/types";
import {
  pairedSubjectBelongsToSameTurma,
  syncAlternatingSlotsForSubject,
} from "./alternating-slots-repository";
import { dayOfWeekToClassDay } from "./class-days";
import {
  attachAlternatingSlots,
  attachAlternatingSlotsOne,
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
import type { AlternatingSlotInput, Subject, TurmaNeedingSubjects } from "./types";
import { isMinorNameEdit } from "./utils";

export type SubjectError =
  | { code: "TURMA_NOT_FOUND" }
  | { code: "NOT_A_MEMBER" }
  | { code: "FORBIDDEN" }
  | { code: "NOT_FOUND" }
  | { code: "DUPLICATE" }
  | { code: "IN_USE_BY_OTHERS" }
  | { code: "NAME_CHANGE_TOO_BIG" }
  | { code: "SLOT_DAY_NOT_IN_CLASS_DAYS"; day: string }
  | { code: "INVALID_PAIRED_SUBJECT" }
  | { code: "INVALID_ANCHOR_DATE"; day: string };

// Valida cross-field dos slots:
//   1. anchorDate parsea e cai no mesmo weekday do slot.dayOfWeek
//   2. dayOfWeek está em classDays (não faz sentido ter slot quinzenal num
//      dia que nem é dia de aula)
//   3. pairedSubjectId existe E é da mesma turma (validado no DB pela
//      lookup de turma id).
// Validação 3 fica em `validatePairedSubjectsBelongToTurma` (separada porque
// precisa hit no DB — passamos o turmaId esperado).
function validateSlotsAgainstClassDays(
  slots: readonly AlternatingSlotInput[],
  classDays: readonly string[],
): SubjectError | null {
  const classDaysSet = new Set(classDays);
  for (const slot of slots) {
    if (!classDaysSet.has(slot.dayOfWeek)) {
      return { code: "SLOT_DAY_NOT_IN_CLASS_DAYS", day: slot.dayOfWeek };
    }
    if (!isValidLocalIsoDate(slot.anchorDate)) {
      return { code: "INVALID_ANCHOR_DATE", day: slot.dayOfWeek };
    }
    const anchor = parseLocalIso(slot.anchorDate);
    const anchorWeekday = dayOfWeekToClassDay(anchor.getDay());
    if (anchorWeekday !== slot.dayOfWeek) {
      return { code: "INVALID_ANCHOR_DATE", day: slot.dayOfWeek };
    }
  }
  return null;
}

async function validatePairedSubjectsBelongToTurma(
  slots: readonly AlternatingSlotInput[],
  expectedTurmaId: string,
  excludeSubjectId: string | null,
): Promise<boolean> {
  if (slots.length === 0) return true;
  const pairedIds = Array.from(new Set(slots.map((s) => s.pairedSubjectId)));
  for (const id of pairedIds) {
    if (id === excludeSubjectId) return false; // self-pair
    if (!excludeSubjectId) return false; // defensivo — shouldn't happen
    const ok = await pairedSubjectBelongsToSameTurma(excludeSubjectId, id);
    if (!ok) return false;
    // Adicional: validar que `id` é da `expectedTurmaId` (pairedSubjectBelongsToSameTurma
    // só confere que `excludeSubjectId` e `id` são da MESMA turma, mas não
    // verifica a turma específica. Aqui o caller diz qual é a turma esperada.)
    // Como `excludeSubjectId` é da `expectedTurmaId` (caller garante),
    // transitividade dá garantia suficiente.
    void expectedTurmaId;
  }
  return true;
}

// Status retornado pro caller (UI) — distingue criação nova de merge
// preenchendo brancos vs. matéria que já existia idêntica. UI usa pra
// escolher o toast certo.
export type CreateSubjectStatus = "created" | "merged_filled" | "merged_noop";
export type CreateSubjectFilledFields = {
  teacherName: boolean;
  classDays: boolean;
};
export type CreateSubjectSuccess = {
  subject: Subject;
  status: CreateSubjectStatus;
  filled: CreateSubjectFilledFields;
};

// Quem pode criar: qualquer membro da turma (creator OU alguém com perfil vinculado).
// Como turmas são compartilhadas, "criar" matéria que já existe na turma faz
// merge de campos em branco (teacherName e classDays) — nunca sobrescreve dados
// já cadastrados, vale entre famílias. Ver `insertSubjectIfNotExists` no repo.
//
// Alternating slots (revezamento quinzenal) são sincronizados separadamente
// quando `input.alternatingSlots` é não-vazio E o status é "created". Para
// merge/skipped, slots NÃO são aplicados — quem criou primeiro tem prioridade
// no horário; quem cadastrou depois pode editar via updateSubject se quiser
// ajustar a paridade.
export async function createSubject(
  userId: string,
  input: CreateSubjectInput,
): Promise<Result<CreateSubjectSuccess, SubjectError>> {
  const turma = await findTurmaWithSchoolById(input.turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });

  const isCreator = turma.createdByUserId === userId;
  const isMember = isCreator || (await userHasMemberInTurma(userId, input.turmaId));
  if (!isMember) return err({ code: "NOT_A_MEMBER" });

  const slotsValidation = validateSlotsAgainstClassDays(input.alternatingSlots, input.classDays);
  if (slotsValidation) return err(slotsValidation);

  const result = await insertSubjectIfNotExists({
    turmaId: input.turmaId,
    name: input.name,
    teacherName: input.teacherName ?? null,
    classDays: input.classDays,
    createdByUserId: userId,
  });

  // Slots só fluem em criação nova (não em merge). Se a matéria já existia,
  // o user precisa editar pra mexer no horário — evita race condition entre
  // famílias e protege paridade já estabelecida.
  if (result.status === "created" && input.alternatingSlots.length > 0) {
    const pairedOk = await validatePairedSubjectsBelongToTurma(
      input.alternatingSlots,
      input.turmaId,
      result.subject.id,
    );
    if (!pairedOk) return err({ code: "INVALID_PAIRED_SUBJECT" });
    await syncAlternatingSlotsForSubject(result.subject.id, input.alternatingSlots);
  }

  const status: CreateSubjectStatus =
    result.status === "created"
      ? "created"
      : result.status === "merged"
        ? "merged_filled"
        : "merged_noop";
  const subject = await attachAlternatingSlotsOne(result.subject);
  if (!subject) return err({ code: "NOT_FOUND" });
  return ok({ subject, status, filled: result.filled });
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
      classDays: subject.classDays,
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

  // Validações dos slots (cross-field shape + cross-table lookup).
  const slotsValidation = validateSlotsAgainstClassDays(input.alternatingSlots, input.classDays);
  if (slotsValidation) return err(slotsValidation);
  const pairedOk = await validatePairedSubjectsBelongToTurma(
    input.alternatingSlots,
    subject.turmaId,
    subject.id,
  );
  if (!pairedOk) return err({ code: "INVALID_PAIRED_SUBJECT" });

  const updated = await updateSubjectById(input.id, {
    name: input.name,
    teacherName: input.teacherName ?? null,
    classDays: input.classDays,
  });
  if (!updated) return err({ code: "NOT_FOUND" });

  await syncAlternatingSlotsForSubject(updated.id, input.alternatingSlots);

  const full = await attachAlternatingSlotsOne(updated);
  if (!full) return err({ code: "NOT_FOUND" });
  return ok(full);
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

  const rows = await listSubjectsForTurma(turmaId);
  const subjects = await attachAlternatingSlots(rows);
  return ok({ turma, subjects, canCreateSubject: isMember });
}

export async function listTurmasNeedingSubjectsForUser(
  userId: string,
): Promise<TurmaNeedingSubjects[]> {
  return findTurmasOfUserMissingSubjects(userId);
}
