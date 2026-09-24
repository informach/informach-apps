import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { findStudentProfileByIdForUser } from "@/features/students/repository";
import { joinPrivateGroup } from "./group-access";
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

const MAX_TURMA_CODE_INSERT_ATTEMPTS = 5;

export async function createOrJoinTurma(
  userId: string,
  input: CreateTurmaInput,
): Promise<Result<CreateOrJoinResult, TurmaError>> {
  const profile = await findStudentProfileByIdForUser(userId, input.profileId);
  if (!profile) return err({ code: "PROFILE_NOT_FOUND" });

  for (let attempt = 0; attempt < MAX_TURMA_CODE_INSERT_ATTEMPTS; attempt += 1) {
    const code = await generateUniqueTurmaCode();
    const result = await insertTurmaIfNotExists({
      code,
      schoolInepCode: input.schoolInepCode,
      grade: input.grade,
      year: input.year,
      shift: input.shift,
      classLetter: input.classLetter,
      createdByUserId: userId,
    });

    if ("codeConflict" in result) continue;
    if (!result.created && result.turma.createdByUserId !== userId)
      return err({ code: "FORBIDDEN" });

    await insertTurmaMember(result.turma.id, profile.id);
    if (!(await setActiveTurmaInDb(profile.id, result.turma.id, userId)))
      return err({ code: "NOT_A_MEMBER" });

    const turmaWithSchool = await findTurmaWithSchoolById(result.turma.id);
    if (!turmaWithSchool) {
      // Defensive — shouldn't happen since we just inserted/found it.
      return err({ code: "TURMA_NOT_FOUND" });
    }
    return ok({ turma: turmaWithSchool, created: result.created });
  }

  throw new Error("Failed to create turma with unique code after multiple insert attempts");
}

/**
 * A turma por trás de um código de convite, para a tela de entrar por link.
 *
 * Mostra escola, série e cidade a quem tem o código — que já é a credencial de
 * entrada. Não revela criança nenhuma, de nenhuma família.
 */
export async function findTurmaForInvite(code: string) {
  const turma = await findTurmaByCode(code);
  // Turma órfã (o criador apagou a conta) não aceita ninguém: `joinPrivateGroup`
  // recusa sem criador. Mostrar o convite com um botão que sempre falha é pior
  // do que dizer que o convite não vale.
  if (!turma?.createdByUserId) return null;
  return findTurmaWithSchoolById(turma.id);
}

export async function joinTurmaByCode(
  userId: string,
  input: JoinByCodeInput,
): Promise<Result<{ turma: TurmaWithSchool }, TurmaError>> {
  const profile = await findStudentProfileByIdForUser(userId, input.profileId);
  if (!profile) return err({ code: "PROFILE_NOT_FOUND" });

  const turma = await findTurmaByCode(input.code);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });

  const joined = await joinPrivateGroup(userId, profile.id, input.code);
  if (!joined) return err({ code: "TURMA_NOT_FOUND" });

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

  if (!(await setActiveTurmaInDb(profile.id, input.turmaId, userId)))
    return err({ code: "NOT_A_MEMBER" });
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
    shift: input.shift,
  });
  if (!result.ok) {
    if (result.code === "CONFLICT_EXISTING_TURMA") return err({ code: "CONFLICT_EXISTING_TURMA" });
    return err({ code: "TURMA_NOT_FOUND" });
  }

  const refreshed = await findTurmaWithSchoolById(input.turmaId);
  if (!refreshed) return err({ code: "TURMA_NOT_FOUND" });
  return ok({ turma: refreshed });
}
