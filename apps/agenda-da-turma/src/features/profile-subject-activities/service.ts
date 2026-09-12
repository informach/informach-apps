import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { FREE_ACTIVITY_LIMIT } from "@/features/activities/limits";
import { billing } from "@/features/billing/service";
import { findProfileSubjectByIdForUser } from "@/features/profile-subjects/repository";
import type { ProfileSubject } from "@/features/profile-subjects/types";
import {
  deleteProfileSubjectActivityById,
  findProfileSubjectActivityForUser,
  insertProfileSubjectActivity,
  insertProfileSubjectActivityWithinFreeLimit,
  listProfileSubjectActivitiesForSubject,
  setProfileSubjectActivityStatus,
  updateProfileSubjectActivityById,
} from "./repository";
import type {
  CreateProfileSubjectActivityInput,
  DeleteProfileSubjectActivityInput,
  SetProfileSubjectActivityStatusInput,
  UpdateProfileSubjectActivityInput,
} from "./schemas";
import type { ProfileSubjectActivity } from "./types";

export type ProfileSubjectActivityError =
  | { code: "PROFILE_SUBJECT_NOT_FOUND" }
  | { code: "NOT_FOUND" }
  | { code: "FORBIDDEN" }
  | { code: "ACTIVITY_LIMIT_REACHED"; limit: number; current: number };

function userSubject(userId: string) {
  return { type: "user", id: userId } as const;
}

// Cria atividade vinculada a uma matéria extracurricular. Pré-condições:
//   - O profileSubject existe e pertence ao user (via JOIN)
//   - Free respeita FREE_ACTIVITY_LIMIT combinado (turma + extra)
//   - Pro é ilimitado
export async function createProfileSubjectActivity(
  userId: string,
  input: CreateProfileSubjectActivityInput,
): Promise<Result<ProfileSubjectActivity, ProfileSubjectActivityError>> {
  const profileSubject = await findProfileSubjectByIdForUser(userId, input.profileSubjectId);
  if (!profileSubject) return err({ code: "PROFILE_SUBJECT_NOT_FOUND" });

  const isPro = await billing.hasProSubscription(userSubject(userId));

  const payload = {
    profileId: profileSubject.profileId,
    profileSubjectId: profileSubject.id,
    createdByUserId: userId,
    type: input.type,
    title: input.title,
    description: input.description ?? null,
    dueAt: input.dueAt,
  };

  if (!isPro) {
    const limited = await insertProfileSubjectActivityWithinFreeLimit(payload, FREE_ACTIVITY_LIMIT);
    if (!limited.ok) {
      return err({
        code: "ACTIVITY_LIMIT_REACHED",
        limit: FREE_ACTIVITY_LIMIT,
        current: limited.current,
      });
    }
    return ok(limited.activity);
  }

  const activity = await insertProfileSubjectActivity(payload);
  return ok(activity);
}

export async function updateProfileSubjectActivity(
  userId: string,
  input: UpdateProfileSubjectActivityInput,
): Promise<Result<ProfileSubjectActivity, ProfileSubjectActivityError>> {
  const activity = await findProfileSubjectActivityForUser(userId, input.id);
  if (!activity) return err({ code: "NOT_FOUND" });
  if (activity.createdByUserId !== userId) return err({ code: "FORBIDDEN" });

  const updated = await updateProfileSubjectActivityById(input.id, {
    type: input.type,
    title: input.title,
    description: input.description ?? null,
    dueAt: input.dueAt,
  });
  if (!updated) return err({ code: "NOT_FOUND" });
  return ok(updated);
}

export async function deleteProfileSubjectActivity(
  userId: string,
  input: DeleteProfileSubjectActivityInput,
): Promise<Result<true, ProfileSubjectActivityError>> {
  const activity = await findProfileSubjectActivityForUser(userId, input.id);
  if (!activity) return err({ code: "NOT_FOUND" });
  if (activity.createdByUserId !== userId) return err({ code: "FORBIDDEN" });
  const removed = await deleteProfileSubjectActivityById(input.id);
  if (!removed) return err({ code: "NOT_FOUND" });
  return ok(true);
}

export type ProfileSubjectWithActivities = {
  subject: ProfileSubject;
  activities: ProfileSubjectActivity[];
};

// Carrega matéria + atividades pra página de detalhe. Garante ownership
// via JOIN no `findProfileSubjectByIdForUser`. Retorna NOT_FOUND quando a
// matéria não existe ou pertence a outro user.
export async function getProfileSubjectWithActivitiesForUser(
  userId: string,
  profileSubjectId: string,
): Promise<Result<ProfileSubjectWithActivities, ProfileSubjectActivityError>> {
  const subject = await findProfileSubjectByIdForUser(userId, profileSubjectId);
  if (!subject) return err({ code: "PROFILE_SUBJECT_NOT_FOUND" });
  const activities = await listProfileSubjectActivitiesForSubject(subject.id);
  return ok({ subject, activities });
}

export async function setProfileSubjectActivityStatusForUser(
  userId: string,
  input: SetProfileSubjectActivityStatusInput,
): Promise<Result<{ id: string; status: typeof input.status }, ProfileSubjectActivityError>> {
  const activity = await findProfileSubjectActivityForUser(userId, input.id);
  if (!activity) return err({ code: "NOT_FOUND" });
  const isPro =
    input.status === "pending" &&
    (await billing.hasProSubscription(userSubject(activity.createdByUserId ?? userId)));
  const updated = await setProfileSubjectActivityStatus(
    input.id,
    input.status,
    userId,
    input.status === "pending" && !isPro ? FREE_ACTIVITY_LIMIT : null,
  );
  if (typeof updated === "object")
    return err({
      code: "ACTIVITY_LIMIT_REACHED",
      current: updated.limitReached,
      limit: FREE_ACTIVITY_LIMIT,
    });
  if (!updated) return err({ code: "NOT_FOUND" });
  return ok({ id: input.id, status: input.status });
}
