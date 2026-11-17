import "server-only";
import { and, db, eq, isNull, ne } from "@informach/db";
import { familyMembers } from "@informach/db/schema";
import { familyMembershipCondition } from "@informach/family/access";
import {
  findStudentProfileByIdForUser,
  findStudentProfilesByUser,
} from "@/features/students/repository";
import type { AgendaAuthority } from "./authority";

export { agendaProfileCondition as accessibleProfileCondition } from "./scope";
export const findAccessibleProfile = findStudentProfileByIdForUser;
export const listAccessibleProfiles = findStudentProfilesByUser;
export async function canAccessProfile(actor: AgendaAuthority, profileId: string) {
  return (await findAccessibleProfile(actor, profileId)) !== null;
}
/** Household metadata only; a second adult still needs a separate child's grant. */
export async function hasSecondAdultInFamily(actor: AgendaAuthority) {
  const [row] = await db
    .select({ id: familyMembers.userId })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.groupId, actor.familyGroupId),
        ne(familyMembers.userId, actor.userId),
        isNull(familyMembers.revokedAt),
        familyMembershipCondition(actor.userId, familyMembers.groupId),
      ),
    )
    .limit(1);
  return !!row;
}
