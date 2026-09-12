import "server-only";
import { db, eq, inArray } from "@informach/db";
import {
  agendaActivities,
  agendaActivityStatuses,
  agendaFamilyMembers,
  agendaFamilyProfileAccess,
  agendaNoticeActions,
  agendaNotices,
  agendaNotificationPreferences,
  agendaProfileSubjectActivities,
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTurmaMembers,
  agendaTurmas,
} from "@informach/db/schema";

export async function exportAgendaAccount(userId: string) {
  const profiles = await db
    .select()
    .from(agendaStudentProfiles)
    .where(eq(agendaStudentProfiles.userId, userId));
  const ids = profiles.map((p) => p.id);
  const [
    actions,
    notices,
    schoolActivities,
    extras,
    extraSubjects,
    memberships,
    preferences,
    family,
  ] = await Promise.all([
    db.select().from(agendaNoticeActions).where(inArray(agendaNoticeActions.profileId, ids)),
    db
      .select({
        id: agendaNotices.id,
        source: agendaNotices.source,
        text: agendaNotices.text,
        sourceUrl: agendaNotices.sourceUrl,
        publishedAt: agendaNotices.publishedAt,
        attachmentName: agendaNotices.attachmentName,
        attachmentExpiresAt: agendaNotices.attachmentExpiresAt,
        createdAt: agendaNotices.createdAt,
      })
      .from(agendaNotices)
      .where(eq(agendaNotices.ownerUserId, userId)),
    db
      .select({ activity: agendaActivities, privateStatus: agendaActivityStatuses })
      .from(agendaActivityStatuses)
      .innerJoin(agendaActivities, eq(agendaActivities.id, agendaActivityStatuses.activityId))
      .where(inArray(agendaActivityStatuses.studentProfileId, ids)),
    db
      .select()
      .from(agendaProfileSubjectActivities)
      .where(inArray(agendaProfileSubjectActivities.profileId, ids)),
    db.select().from(agendaProfileSubjects).where(inArray(agendaProfileSubjects.profileId, ids)),
    db
      .select({ profileId: agendaTurmaMembers.studentProfileId, group: agendaTurmas })
      .from(agendaTurmaMembers)
      .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaTurmaMembers.turmaId))
      .where(inArray(agendaTurmaMembers.studentProfileId, ids)),
    db
      .select()
      .from(agendaNotificationPreferences)
      .where(eq(agendaNotificationPreferences.userId, userId)),
    db
      .select({
        memberId: agendaFamilyMembers.id,
        userId: agendaFamilyMembers.userId,
        profileId: agendaFamilyProfileAccess.profileId,
      })
      .from(agendaFamilyMembers)
      .innerJoin(
        agendaFamilyProfileAccess,
        eq(agendaFamilyProfileAccess.memberId, agendaFamilyMembers.id),
      )
      .where(eq(agendaFamilyMembers.ownerUserId, userId)),
  ]);
  const subjectIds = [...new Set(schoolActivities.map((row) => row.activity.subjectId))];
  const subjects = await db
    .select()
    .from(agendaSubjects)
    .where(inArray(agendaSubjects.id, subjectIds));
  return {
    profiles,
    actions,
    notices,
    schoolActivities,
    subjects,
    extras,
    extraSubjects,
    memberships: memberships.map(({ profileId, group: { code: _code, ...group } }) => ({
      profileId,
      group,
    })),
    preferences,
    family,
  };
}
