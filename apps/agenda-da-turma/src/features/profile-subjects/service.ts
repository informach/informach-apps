import "server-only";
import { err, ok, type Result } from "@informach/auth/server-actions";
import { FamilyError } from "@informach/family";
import { todayLocalIso } from "@/features/dashboard/date";
import type { AgendaAuthority } from "@/features/family/authority";
import { findStudentProfileByIdForUser } from "@/features/students/repository";
import {
  deleteProfileSubjectById,
  insertProfileSubjectWithinLimit,
  listActiveProfileSubjectsForProfile,
  listProfileSubjectsForProfile,
  loadActivityCountsForProfileSubjects,
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
  | { code: "PROFILE_NOT_FOUND" | "NOT_FOUND" | "DUPLICATE_NAME" | "PROFILE_LIMIT_REACHED" }
  | { code: "PLAN_LIMIT_REACHED"; limit: number; current: number; isPro: boolean };
async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof FamilyError)
      return err({
        code:
          error.code === "CAPACITY_EXCEEDED"
            ? ("PROFILE_LIMIT_REACHED" as const)
            : ("NOT_FOUND" as const),
      });
    throw error;
  }
}
export function createProfileSubject(actor: AgendaAuthority, input: CreateProfileSubjectInput) {
  return guarded(() => insertProfileSubjectWithinLimit(actor, input));
}
export function updateProfileSubject(actor: AgendaAuthority, input: UpdateProfileSubjectInput) {
  return guarded(() => updateProfileSubjectById(actor, input));
}
export function deleteProfileSubject(actor: AgendaAuthority, input: DeleteProfileSubjectInput) {
  return guarded(() => deleteProfileSubjectById(actor, input.id));
}
export function setProfileSubjectStatusForUser(
  actor: AgendaAuthority,
  input: SetProfileSubjectStatusInput,
) {
  return guarded(() =>
    setProfileSubjectStatus(actor, input, input.status === "paused" ? todayLocalIso() : null),
  );
}

export type ProfileSubjectsListForProfile = {
  profileId: string;
  canWrite: boolean;
  subjects: ProfileSubjectWithCounts[];
};

// Lista todas as extras do perfil + counts de atividades pra montar UI da
// página `/perfis/[id]/extras` em um único round-trip.
export async function getProfileSubjectsForUserAndProfile(
  actor: AgendaAuthority,
  profileId: string,
): Promise<Result<ProfileSubjectsListForProfile, ProfileSubjectError>> {
  const profile = await findStudentProfileByIdForUser(actor, profileId);
  if (!profile) return err({ code: "PROFILE_NOT_FOUND" });

  const subjects = await listProfileSubjectsForProfile(actor, profileId);
  if (subjects.length === 0) {
    return ok({ profileId, canWrite: profile.canWrite, subjects: [] });
  }
  const counts = await loadActivityCountsForProfileSubjects(
    actor,
    subjects.map((s) => s.id),
  );
  const enriched: ProfileSubjectWithCounts[] = subjects.map((s) => {
    const c = counts.get(s.id);
    return {
      ...s,
      pendingActivitiesCount: c?.pending ?? 0,
      doneActivitiesCount: c?.done ?? 0,
    };
  });
  return ok({ profileId, canWrite: profile.canWrite, subjects: enriched });
}

// Lista só as ativas — utility re-exportada pra consumo do today-subjects-service.
export async function listActiveProfileSubjectsForUserProfile(
  actor: AgendaAuthority,
  profileId: string,
): Promise<ProfileSubject[]> {
  const profile = await findStudentProfileByIdForUser(actor, profileId);
  if (!profile) return [];
  return listActiveProfileSubjectsForProfile(actor, profileId);
}
