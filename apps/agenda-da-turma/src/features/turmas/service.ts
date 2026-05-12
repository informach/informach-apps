import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { findStudentProfileByIdForUser } from "@/features/students/repository";
import {
  deleteTurmaById,
  deleteTurmaMember,
  findTurmaByCode,
  findTurmaWithSchoolById,
  generateUniqueTurmaCode,
  hasOtherFamilyMembersInTurma,
  insertTurmaIfNotExists,
  insertTurmaMember,
  listTurmasForUser,
  setActiveTurma as setActiveTurmaInDb,
  turmaHasActivities,
  updateTurma as updateTurmaInDb,
  verifyMembership,
} from "./repository";
import type {
  CreateTurmaInput,
  DeleteTurmaInput,
  JoinByCodeInput,
  LeaveTurmaInput,
  SetActiveTurmaInput,
  UpdateTurmaInput,
} from "./schemas";
import type { TurmaForUser, TurmaWithSchool } from "./types";

export type TurmaError =
  | { code: "PROFILE_NOT_FOUND" }
  | { code: "TURMA_NOT_FOUND" }
  | { code: "NOT_A_MEMBER" }
  | { code: "FORBIDDEN" }
  | { code: "HAS_OTHER_MEMBERS" }
  | { code: "HAS_ACTIVITIES" }
  | { code: "CONFLICT_EXISTING_TURMA" };

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

// Apagar turma: só o creator, e só enquanto a turma estiver "fresca" — sem
// outras famílias vinculadas E sem atividades cadastradas. Atividades existirem
// (próprias ou alheias) bloqueia o apagar pra evitar perda acidental via
// cascade (agenda.activities ON DELETE cascade, idem matérias e statuses).
// Cascade do schema (agenda.subjects ON DELETE cascade, agenda.turma_members
// ON DELETE cascade, agenda.student_profiles.active_turma_id ON DELETE SET
// NULL) cuida da limpeza derivada — incluindo perfis do próprio creator
// vinculados à turma.
export async function deleteTurma(
  userId: string,
  input: DeleteTurmaInput,
): Promise<Result<true, TurmaError>> {
  const turma = await findTurmaWithSchoolById(input.turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });
  if (turma.createdByUserId !== userId) return err({ code: "FORBIDDEN" });

  if (await hasOtherFamilyMembersInTurma(input.turmaId, userId)) {
    return err({ code: "HAS_OTHER_MEMBERS" });
  }

  if (await turmaHasActivities(input.turmaId)) {
    return err({ code: "HAS_ACTIVITIES" });
  }

  await deleteTurmaById(input.turmaId);
  return ok(true);
}

// Editar turma: mesma regra do apagar — só o creator, só enquanto a turma
// estiver "fresca". Edita grade/year/classLetter (escola NÃO editável: escola
// diferente = turma diferente). UNIQUE em (school+grade+year+letter) protege
// contra criar duplicata; service retorna CONFLICT_EXISTING_TURMA quando as
// novas coordenadas batem com outra turma da mesma escola.
export async function updateTurma(
  userId: string,
  input: UpdateTurmaInput,
): Promise<Result<{ turma: TurmaWithSchool }, TurmaError>> {
  const turma = await findTurmaWithSchoolById(input.turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });
  if (turma.createdByUserId !== userId) return err({ code: "FORBIDDEN" });

  if (await hasOtherFamilyMembersInTurma(input.turmaId, userId)) {
    return err({ code: "HAS_OTHER_MEMBERS" });
  }

  if (await turmaHasActivities(input.turmaId)) {
    return err({ code: "HAS_ACTIVITIES" });
  }

  const result = await updateTurmaInDb(input.turmaId, {
    grade: input.grade,
    year: input.year,
    classLetter: input.classLetter,
  });
  if (!result.ok) {
    if (result.code === "CONFLICT_EXISTING_TURMA") return err({ code: "CONFLICT_EXISTING_TURMA" });
    return err({ code: "TURMA_NOT_FOUND" });
  }

  const refreshed = await findTurmaWithSchoolById(input.turmaId);
  if (!refreshed) return err({ code: "TURMA_NOT_FOUND" });
  return ok({ turma: refreshed });
}
