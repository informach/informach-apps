import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { findStudentProfileByIdForUser } from "@/features/students/repository";
import {
  deleteTurmaMember,
  findTurmaByCode,
  findTurmaWithSchoolById,
  generateUniqueTurmaCode,
  insertTurmaIfNotExists,
  insertTurmaMember,
  listTurmasForUser,
  setActiveTurma as setActiveTurmaInDb,
  verifyMembership,
} from "./repository";
import type {
  CreateTurmaInput,
  JoinByCodeInput,
  LeaveTurmaInput,
  SetActiveTurmaInput,
} from "./schemas";
import type { TurmaForUser, TurmaWithSchool } from "./types";

export type TurmaError =
  | { code: "PROFILE_NOT_FOUND" }
  | { code: "TURMA_NOT_FOUND" }
  | { code: "NOT_A_MEMBER" };

export type CreateOrJoinResult = { turma: TurmaWithSchool; created: boolean };

export async function createOrJoinTurma(
  userId: string,
  input: CreateTurmaInput,
): Promise<Result<CreateOrJoinResult, TurmaError>> {
  const profile = await findStudentProfileByIdForUser(userId, input.profileId);
  if (!profile) return err({ code: "PROFILE_NOT_FOUND" });

  const code = await generateUniqueTurmaCode();
  const result = await insertTurmaIfNotExists({
    code,
    schoolInepCode: input.schoolInepCode,
    grade: input.grade,
    year: input.year,
    classLetter: input.classLetter,
    createdByUserId: userId,
  });

  await insertTurmaMember(result.turma.id, profile.id);
  await setActiveTurmaInDb(profile.id, result.turma.id);

  const turmaWithSchool = await findTurmaWithSchoolById(result.turma.id);
  if (!turmaWithSchool) {
    // Defensive — shouldn't happen since we just inserted/found it.
    return err({ code: "TURMA_NOT_FOUND" });
  }
  return ok({ turma: turmaWithSchool, created: result.created });
}

export async function joinTurmaByCode(
  userId: string,
  input: JoinByCodeInput,
): Promise<Result<{ turma: TurmaWithSchool }, TurmaError>> {
  const profile = await findStudentProfileByIdForUser(userId, input.profileId);
  if (!profile) return err({ code: "PROFILE_NOT_FOUND" });

  const turma = await findTurmaByCode(input.code);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });

  await insertTurmaMember(turma.id, profile.id);
  await setActiveTurmaInDb(profile.id, turma.id);

  const turmaWithSchool = await findTurmaWithSchoolById(turma.id);
  if (!turmaWithSchool) return err({ code: "TURMA_NOT_FOUND" });
  return ok({ turma: turmaWithSchool });
}

export async function setActiveTurma(
  userId: string,
  input: SetActiveTurmaInput,
): Promise<Result<true, TurmaError>> {
  const profile = await findStudentProfileByIdForUser(userId, input.profileId);
  if (!profile) return err({ code: "PROFILE_NOT_FOUND" });

  const isMember = await verifyMembership(profile.id, input.turmaId);
  if (!isMember) return err({ code: "NOT_A_MEMBER" });

  await setActiveTurmaInDb(profile.id, input.turmaId);
  return ok(true);
}

export async function leaveTurma(
  userId: string,
  input: LeaveTurmaInput,
): Promise<Result<true, TurmaError>> {
  const profile = await findStudentProfileByIdForUser(userId, input.profileId);
  if (!profile) return err({ code: "PROFILE_NOT_FOUND" });

  const removed = await deleteTurmaMember(profile.id, input.turmaId);
  if (!removed) return err({ code: "NOT_A_MEMBER" });
  return ok(true);
}

export async function listTurmasForCurrentUser(userId: string): Promise<TurmaForUser[]> {
  return listTurmasForUser(userId);
}
