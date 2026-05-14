import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { billing } from "@/features/billing/service";
import { todayLocalIso } from "@/features/dashboard/date";
import { findStudentProfileByIdForUser } from "@/features/students/repository";
import { FREE_PROFILE_SUBJECT_LIMIT, PRO_PROFILE_SUBJECT_LIMIT } from "./limits";
import {
  deleteProfileSubjectById,
  findProfileSubjectByIdForUser,
  insertProfileSubjectWithinLimit,
  listActiveProfileSubjectsForProfile,
  listProfileSubjectsForProfile,
  loadActivityCountsForProfileSubjects,
  profileSubjectNameExistsExceptId,
  setProfileSubjectStatus,
  updateProfileSubjectById,
} from "./repository";
import type {
  CreateProfileSubjectInput,
  DeleteProfileSubjectInput,
  SetProfileSubjectStatusInput,
  UpdateProfileSubjectInput,
} from "./schemas";
import type { ProfileSubject, ProfileSubjectWithCounts } from "./types";

export type ProfileSubjectError =
  | { code: "PROFILE_NOT_FOUND" }
  | { code: "NOT_FOUND" }
  | { code: "DUPLICATE_NAME" }
  | {
      code: "PLAN_LIMIT_REACHED";
      limit: number;
      current: number;
      isPro: boolean;
    };

export async function createProfileSubject(
  userId: string,
  input: CreateProfileSubjectInput,
): Promise<Result<ProfileSubject, ProfileSubjectError>> {
  // Garante que o perfil pertence ao user antes de qualquer side effect.
  const profile = await findStudentProfileByIdForUser(userId, input.profileId);
  if (!profile) return err({ code: "PROFILE_NOT_FOUND" });

  const isPro = await billing.hasProSubscription({ type: "user", id: userId });
  const limit = isPro ? PRO_PROFILE_SUBJECT_LIMIT : FREE_PROFILE_SUBJECT_LIMIT;

  const result = await insertProfileSubjectWithinLimit(
    {
      profileId: input.profileId,
      name: input.name,
      classDays: input.classDays,
    },
    limit,
  );
  if (!result.ok) {
    if (result.code === "DUPLICATE_NAME") return err({ code: "DUPLICATE_NAME" });
    return err({
      code: "PLAN_LIMIT_REACHED",
      limit: result.limit,
      current: result.current,
      isPro,
    });
  }
  return ok(result.subject);
}

export async function updateProfileSubject(
  userId: string,
  input: UpdateProfileSubjectInput,
): Promise<Result<ProfileSubject, ProfileSubjectError>> {
  const subject = await findProfileSubjectByIdForUser(userId, input.id);
  if (!subject) return err({ code: "NOT_FOUND" });

  if (subject.name !== input.name) {
    const duplicate = await profileSubjectNameExistsExceptId(
      subject.profileId,
      input.name,
      subject.id,
    );
    if (duplicate) return err({ code: "DUPLICATE_NAME" });
  }

  const updated = await updateProfileSubjectById(input.id, {
    name: input.name,
    classDays: input.classDays,
  });
  if (!updated) return err({ code: "NOT_FOUND" });
  return ok(updated);
}

export async function deleteProfileSubject(
  userId: string,
  input: DeleteProfileSubjectInput,
): Promise<Result<true, ProfileSubjectError>> {
  const subject = await findProfileSubjectByIdForUser(userId, input.id);
  if (!subject) return err({ code: "NOT_FOUND" });
  const removed = await deleteProfileSubjectById(input.id);
  if (!removed) return err({ code: "NOT_FOUND" });
  return ok(true);
}

// Pausa/retoma a matéria. Single source of truth pra status + paused_at —
// service garante consistência (active ⇒ paused_at NULL; paused ⇒ paused_at
// = today). O check constraint do DB é defesa em profundidade.
export async function setProfileSubjectStatusForUser(
  userId: string,
  input: SetProfileSubjectStatusInput,
): Promise<
  Result<{ subject: ProfileSubject; previousStatus: ProfileSubject["status"] }, ProfileSubjectError>
> {
  const current = await findProfileSubjectByIdForUser(userId, input.id);
  if (!current) return err({ code: "NOT_FOUND" });
  if (current.status === input.status) {
    // Noop — devolve a row atual sem update.
    return ok({ subject: current, previousStatus: current.status });
  }

  const pausedAtIso = input.status === "paused" ? todayLocalIso() : null;
  const updated = await setProfileSubjectStatus(input.id, input.status, pausedAtIso);
  if (!updated) return err({ code: "NOT_FOUND" });
  return ok({ subject: updated, previousStatus: current.status });
}

export type ProfileSubjectsListForProfile = {
  profileId: string;
  subjects: ProfileSubjectWithCounts[];
};

// Lista todas as extras do perfil + counts de atividades pra montar UI da
// página `/perfis/[id]/extras` em um único round-trip.
export async function getProfileSubjectsForUserAndProfile(
  userId: string,
  profileId: string,
): Promise<Result<ProfileSubjectsListForProfile, ProfileSubjectError>> {
  const profile = await findStudentProfileByIdForUser(userId, profileId);
  if (!profile) return err({ code: "PROFILE_NOT_FOUND" });

  const subjects = await listProfileSubjectsForProfile(profileId);
  if (subjects.length === 0) {
    return ok({ profileId, subjects: [] });
  }
  const counts = await loadActivityCountsForProfileSubjects(subjects.map((s) => s.id));
  const enriched: ProfileSubjectWithCounts[] = subjects.map((s) => {
    const c = counts.get(s.id);
    return {
      ...s,
      pendingActivitiesCount: c?.pending ?? 0,
      doneActivitiesCount: c?.done ?? 0,
    };
  });
  return ok({ profileId, subjects: enriched });
}

// Lista só as ativas — utility re-exportada pra consumo do today-subjects-service.
export async function listActiveProfileSubjectsForUserProfile(
  userId: string,
  profileId: string,
): Promise<ProfileSubject[]> {
  const profile = await findStudentProfileByIdForUser(userId, profileId);
  if (!profile) return [];
  return listActiveProfileSubjectsForProfile(profileId);
}
