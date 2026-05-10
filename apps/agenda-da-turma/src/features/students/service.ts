import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { billing } from "@/features/billing/service";
import { FREE_STUDENT_PROFILE_LIMIT, PRO_STUDENT_PROFILE_LIMIT } from "./limits";
import {
  countProfilesWithoutActiveTurmaByUser,
  countStudentProfilesByUser,
  deleteStudentProfileForUser,
  findStudentProfileByIdForUser,
  findStudentProfilesByUser,
  findStudentProfilesWithActiveTurmaByUser,
  insertStudentProfileWithinLimit,
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
  userId: string,
  input: CreateStudentProfileInput,
): Promise<Result<StudentProfile, CreateStudentProfileError>> {
  const isPro = await billing.hasProSubscription({ type: "user", id: userId });
  const limit = isPro ? PRO_STUDENT_PROFILE_LIMIT : FREE_STUDENT_PROFILE_LIMIT;

  const result = await insertStudentProfileWithinLimit(
    { userId, name: input.name, birthDate: input.birthDate },
    limit,
  );
  if (!result.ok) {
    return err({
      code: "PLAN_LIMIT_REACHED",
      limit,
      current: result.current,
      isPro,
    });
  }
  return ok(result.profile);
}

export async function updateStudentProfile(
  userId: string,
  id: string,
  input: Omit<UpdateStudentProfileInput, "id">,
): Promise<Result<StudentProfile, StudentProfileNotFoundError>> {
  const row = await updateStudentProfileForUser(userId, id, {
    name: input.name,
    birthDate: input.birthDate,
  });
  if (!row) return err({ code: "NOT_FOUND" });
  return ok(row);
}

export async function deleteStudentProfile(
  userId: string,
  id: string,
): Promise<Result<true, StudentProfileNotFoundError>> {
  const removed = await deleteStudentProfileForUser(userId, id);
  if (!removed) return err({ code: "NOT_FOUND" });
  return ok(true);
}

export async function getStudentProfileForUser(
  userId: string,
  id: string,
): Promise<Result<StudentProfile, StudentProfileNotFoundError>> {
  const row = await findStudentProfileByIdForUser(userId, id);
  if (!row) return err({ code: "NOT_FOUND" });
  return ok(row);
}

export async function listStudentProfilesForUser(userId: string): Promise<StudentProfile[]> {
  return findStudentProfilesByUser(userId);
}

export async function listStudentProfilesWithActiveTurmaForUser(
  userId: string,
): Promise<StudentProfileWithActiveTurma[]> {
  return findStudentProfilesWithActiveTurmaByUser(userId);
}

export async function countUserStudentProfiles(userId: string): Promise<number> {
  return countStudentProfilesByUser(userId);
}

export async function countUserProfilesWithoutTurma(userId: string): Promise<number> {
  return countProfilesWithoutActiveTurmaByUser(userId);
}
