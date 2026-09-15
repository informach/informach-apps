import "server-only";
import { db, eq, inArray } from "@informach/db";
import {
  agendaActivities,
  agendaFamilyMembers,
  agendaFamilyProfileAccess,
  agendaNotices,
  agendaNotificationPreferences,
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
} from "@informach/db/schema";

export async function exportAgendaAccount(userId: string) {
  const profiles = await db
    .select()
    .from(agendaStudentProfiles)
    .where(eq(agendaStudentProfiles.userId, userId));
  const ids = profiles.map((p) => p.id);
  const [actions, notices, sharedActivities, extraSubjects, memberships, preferences, family] =
    await Promise.all([
      db.select().from(agendaTasks).where(inArray(agendaTasks.profileId, ids)),
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
      // `actions` já é a lista inteira de atividades da família desde a
      // convergência — escolares, extras e vindas de recado. O que falta é o
      // fato publicado na turma, que explica de onde a atividade escolar veio.
      db
        .selectDistinct({ activity: agendaActivities })
        .from(agendaActivities)
        .innerJoin(agendaTasks, eq(agendaTasks.sharedActivityId, agendaActivities.id))
        .where(inArray(agendaTasks.profileId, ids)),
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
  const subjectIds = [...new Set(sharedActivities.map((row) => row.activity.subjectId))];
  const subjects = await db
    .select()
    .from(agendaSubjects)
    .where(inArray(agendaSubjects.id, subjectIds));
  return {
    profiles,
    actions,
    notices,
    sharedActivities,
    subjects,
    extraSubjects,
    memberships: memberships.map(({ profileId, group: { code: _code, ...group } }) => ({
      profileId,
      group,
    })),
    preferences,
    family,
  };
}
