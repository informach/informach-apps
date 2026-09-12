import "server-only";

import { and, db, eq, or, sql } from "@informach/db";
import {
  agendaFamilyMembers,
  agendaFamilyProfileAccess,
  agendaStudentProfiles,
} from "@informach/db/schema";

// This predicate must be applied to every query returning child-specific data.
// It uses the authenticated adult; it never impersonates the household owner.
export function accessibleProfileCondition(userId: string) {
  return or(
    eq(agendaStudentProfiles.userId, userId),
    sql`EXISTS (
      SELECT 1 FROM ${agendaFamilyProfileAccess} fpa
      INNER JOIN ${agendaFamilyMembers} fm ON fm.id = fpa.member_id
      WHERE fpa.profile_id = ${agendaStudentProfiles.id} AND fm.user_id = ${userId}
        AND fm.owner_user_id = ${agendaStudentProfiles.userId}
    )`,
  );
}

export async function findAccessibleProfile(userId: string, profileId: string) {
  const [profile] = await db
    .select()
    .from(agendaStudentProfiles)
    .where(and(eq(agendaStudentProfiles.id, profileId), accessibleProfileCondition(userId)))
    .limit(1);
  return profile ?? null;
}

export async function listAccessibleProfiles(userId: string) {
  return db.select().from(agendaStudentProfiles).where(accessibleProfileCondition(userId));
}

export async function canAccessProfile(userId: string, profileId: string): Promise<boolean> {
  return (await findAccessibleProfile(userId, profileId)) !== null;
}
