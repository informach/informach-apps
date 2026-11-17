import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { FamilyError } from "@informach/family";
import type { AgendaAuthority } from "@/features/family/authority";
import { findTurmaWithSchoolById } from "@/features/turmas/repository";
import { attachAlternatingSlots, canContributeToClass, listSubjectsForTurma } from "./repository";
import type {
  CreateSubjectInput,
  CreateSubjectsBatchInput,
  DeleteSubjectInput,
  UpdateSubjectInput,
} from "./schemas";
import type { Subject } from "./types";
import * as writes from "./write-repository";
export type SubjectError =
  | { code: "TURMA_NOT_FOUND" }
  | { code: "NOT_A_MEMBER" }
  | { code: "FORBIDDEN" }
  | { code: "NOT_FOUND" }
  | { code: "DUPLICATE" }
  | { code: "IN_USE" }
  | { code: "NAME_CHANGE_TOO_BIG" }
  | { code: "SLOT_DAY_NOT_IN_CLASS_DAYS"; day: string }
  | { code: "INVALID_PAIRED_SUBJECT" }
  | { code: "INVALID_ANCHOR_DATE"; day: string };

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

async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof FamilyError)) throw error;
    return err({ code: "NOT_A_MEMBER" } as const);
  }
}
export const createSubject = (actor: AgendaAuthority, input: CreateSubjectInput) =>
  guarded(() => writes.createSubject(actor, input));
export const createSubjectsBatch = (actor: AgendaAuthority, input: CreateSubjectsBatchInput) =>
  guarded(() => writes.createSubjectsBatch(actor, input));
export const updateSubject = (actor: AgendaAuthority, input: UpdateSubjectInput) =>
  guarded(() => writes.updateSubject(actor, input));
export const deleteSubject = (actor: AgendaAuthority, input: DeleteSubjectInput) =>
  guarded(() => writes.deleteSubject(actor, input));
export async function getSubjectsForUserAndTurma(actor: AgendaAuthority, turmaId: string) {
  const turma = await findTurmaWithSchoolById(actor, turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" } as const);
  const subjects = await attachAlternatingSlots(actor, await listSubjectsForTurma(actor, turmaId));
  return ok({ turma, subjects, canCreateSubject: await canContributeToClass(actor, turmaId) });
}
