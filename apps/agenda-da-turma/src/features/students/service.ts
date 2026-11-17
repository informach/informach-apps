import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { FamilyError } from "@informach/family";
import { AgendaOriginalScopeError } from "@/features/account/closure-errors";
import type { AgendaAuthority } from "@/features/family/authority";
import {
  countProfilesWithoutActiveTurmaByUser,
  countStudentProfilesByUser,
  deleteStudentProfileForUser,
  findStudentProfileByIdForUser,
  findStudentProfilesByUser,
  findStudentProfilesWithActiveTurmaByUser,
  insertStudentProfileWithinLimit,
  StudentCapacityError,
  updateStudentProfileForUser,
} from "./repository";
import type { CreateStudentProfileInput, UpdateStudentProfileInput } from "./schemas";
import type { StudentProfile, StudentProfileWithActiveTurma } from "./types";

export type CreateStudentProfileError = {
  code: "PLAN_LIMIT_REACHED";
  limit: number;
  current: number;
  isPro: boolean;
};

export type StudentProfileNotFoundError = { code: "NOT_FOUND" };

export async function createStudentProfile(
  actor: AgendaAuthority,
  input: CreateStudentProfileInput,
): Promise<Result<StudentProfile, CreateStudentProfileError | { code: "PROFILE_UNAVAILABLE" }>> {
  try {
    return ok(await insertStudentProfileWithinLimit(actor, input));
  } catch (error) {
    if (error instanceof StudentCapacityError)
      return err({
        code: "PLAN_LIMIT_REACHED",
        current: error.current,
        limit: error.limit,
        isPro: error.isPro,
      });
    if (error instanceof FamilyError) return err({ code: "PROFILE_UNAVAILABLE" });
    throw error;
  }
}

export async function updateStudentProfile(
  actor: AgendaAuthority,
  id: string,
  input: Omit<UpdateStudentProfileInput, "id">,
): Promise<Result<StudentProfile, StudentProfileNotFoundError>> {
  const row = await updateStudentProfileForUser(actor, id, {
    birthDate: input.birthDate,
  });
  if (!row) return err({ code: "NOT_FOUND" });
  return ok(row);
}

export async function deleteStudentProfile(
  actor: AgendaAuthority,
  id: string,
): Promise<Result<true, StudentProfileNotFoundError | { code: "SHARED_ORIGINAL" }>> {
  try {
    const removed = await deleteStudentProfileForUser(actor, id);
    if (!removed) return err({ code: "NOT_FOUND" });
    return ok(true);
  } catch (error) {
    if (error instanceof AgendaOriginalScopeError) return err({ code: "SHARED_ORIGINAL" });
    throw error;
  }
}

export async function getStudentProfileForUser(
  actor: AgendaAuthority,
  id: string,
): Promise<Result<StudentProfile, StudentProfileNotFoundError>> {
  const row = await findStudentProfileByIdForUser(actor, id);
  if (!row) return err({ code: "NOT_FOUND" });
  return ok(row);
}

export async function listStudentProfilesForUser(
  actor: AgendaAuthority,
): Promise<StudentProfile[]> {
  return findStudentProfilesByUser(actor);
}

export async function listStudentProfilesWithActiveTurmaForUser(
  actor: AgendaAuthority,
): Promise<StudentProfileWithActiveTurma[]> {
  return findStudentProfilesWithActiveTurmaByUser(actor);
}

export async function countUserStudentProfiles(actor: AgendaAuthority): Promise<number> {
  return countStudentProfilesByUser(actor);
}

export async function countUserProfilesWithoutTurma(actor: AgendaAuthority): Promise<number> {
  return countProfilesWithoutActiveTurmaByUser(actor);
}
