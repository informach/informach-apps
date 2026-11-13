import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { FamilyError } from "@informach/family";
import type { AgendaAuthority } from "@/features/family/authority";
import { findProfileSubjectByIdForUser } from "@/features/profile-subjects/repository";
import {
  deleteProfileSubjectActivityById,
  insertProfileSubjectActivity,
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
export function createProfileSubjectActivity(
  actor: AgendaAuthority,
  input: CreateProfileSubjectActivityInput,
) {
  return guarded(() => insertProfileSubjectActivity(actor, input));
}
export function updateProfileSubjectActivity(
  actor: AgendaAuthority,
  input: UpdateProfileSubjectActivityInput,
) {
  return guarded(() => updateProfileSubjectActivityById(actor, input));
}
export function deleteProfileSubjectActivity(
  actor: AgendaAuthority,
  input: DeleteProfileSubjectActivityInput,
) {
  return guarded(() => deleteProfileSubjectActivityById(actor, input));
}
export function setProfileSubjectActivityStatusForUser(
  actor: AgendaAuthority,
  input: SetProfileSubjectActivityStatusInput,
) {
  return guarded(() => setProfileSubjectActivityStatus(actor, input));
}
export async function getProfileSubjectWithActivitiesForUser(
  actor: AgendaAuthority,
  profileSubjectId: string,
) {
  const subject = await findProfileSubjectByIdForUser(actor, profileSubjectId);
  if (!subject) return err({ code: "PROFILE_SUBJECT_NOT_FOUND" } as const);
  return ok({
    subject,
    activities: await listProfileSubjectActivitiesForSubject(actor, subject.id),
  });
}
