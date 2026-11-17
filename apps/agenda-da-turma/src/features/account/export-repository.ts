import "server-only";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  agendaActivities,
  agendaNotices,
  agendaNotificationPreferences,
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaSubjectAlternatingSlots,
  agendaSubjectKits,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
  aiOperationReceipts,
  familyAppProfiles,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition, studentName } from "@/features/family/scope";
import { sourceAccessCondition } from "@/features/notices/repository";

/** Export is a read of the current household grants, not a privilege of the old payer.
 * Hold its membership lock so a concurrent revocation cannot split the export's scope.
 * Household-owned history survives a change of payer or of the adult who first entered it.
 */
export function exportAgendaAccount(actor: AgendaAuthority) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    const profiles = await tx
      .select({
        id: agendaStudentProfiles.id,
        personId: familyAppProfiles.personId,
        name: studentName,
        birthDate: agendaStudentProfiles.birthDate,
        activeTurmaId: agendaStudentProfiles.activeTurmaId,
        createdAt: agendaStudentProfiles.createdAt,
        updatedAt: agendaStudentProfiles.updatedAt,
      })
      .from(agendaStudentProfiles)
      .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, agendaStudentProfiles.familyProfileId))
      .where(agendaProfileCondition(actor));
    const ids = profiles.map((p) => p.id);
    const actions = await tx.select().from(agendaTasks).where(inArray(agendaTasks.profileId, ids));
    const notices = await tx
      .select({
        id: agendaNotices.id,
        source: agendaNotices.source,
        text: agendaNotices.text,
        sourceUrl: agendaNotices.sourceUrl,
        publishedAt: agendaNotices.publishedAt,
        sourceProfileIds: agendaNotices.sourceProfileIds,
        sharedWithinFamily: agendaNotices.sharedWithinFamily,
        attachmentName: agendaNotices.attachmentName,
        attachmentExpiresAt: agendaNotices.attachmentExpiresAt,
        createdAt: agendaNotices.createdAt,
      })
      .from(agendaNotices)
      .where(sourceAccessCondition(actor));
    const sharedActivities = await tx
      .selectDistinct({
        id: agendaActivities.id,
        turmaId: agendaActivities.turmaId,
        subjectId: agendaActivities.subjectId,
        type: agendaActivities.type,
        title: agendaActivities.title,
        description: agendaActivities.description,
        dueAt: agendaActivities.dueAt,
      })
      .from(agendaActivities)
      .innerJoin(agendaTasks, eq(agendaTasks.sharedActivityId, agendaActivities.id))
      .where(inArray(agendaTasks.profileId, ids));
    const extraSubjects = await tx
      .select()
      .from(agendaProfileSubjects)
      .where(inArray(agendaProfileSubjects.profileId, ids));
    const memberships = await tx
      .select({
        profileId: agendaTurmaMembers.studentProfileId,
        turmaId: agendaTurmas.id,
        schoolInepCode: agendaTurmas.schoolInepCode,
        grade: agendaTurmas.grade,
        year: agendaTurmas.year,
        classLetter: agendaTurmas.classLetter,
      })
      .from(agendaTurmaMembers)
      .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaTurmaMembers.turmaId))
      .where(inArray(agendaTurmaMembers.studentProfileId, ids));
    const turmaIds = [...new Set(memberships.map((m) => m.turmaId))];
    const subjects = await tx
      .select()
      .from(agendaSubjects)
      .where(inArray(agendaSubjects.turmaId, turmaIds));
    const subjectIds = subjects.map((s) => s.id);
    const alternatingSlots = await tx
      .select()
      .from(agendaSubjectAlternatingSlots)
      .where(inArray(agendaSubjectAlternatingSlots.subjectId, subjectIds));
    const kits = await tx
      .select()
      .from(agendaSubjectKits)
      .where(inArray(agendaSubjectKits.profileId, ids));
    const preferences = await tx
      .select({
        emailEnabled: agendaNotificationPreferences.emailEnabled,
        pushEnabled: agendaNotificationPreferences.pushEnabled,
        digestHour: agendaNotificationPreferences.digestHour,
        quietStart: agendaNotificationPreferences.quietStart,
        quietEnd: agendaNotificationPreferences.quietEnd,
        suggestReminders: agendaNotificationPreferences.suggestReminders,
        weeklyDigestEnabled: agendaNotificationPreferences.weeklyDigestEnabled,
        weeklyDigestDay: agendaNotificationPreferences.weeklyDigestDay,
        weeklyDigestHour: agendaNotificationPreferences.weeklyDigestHour,
      })
      .from(agendaNotificationPreferences)
      .where(
        and(
          eq(agendaNotificationPreferences.userId, actor.userId),
          eq(agendaNotificationPreferences.familyGroupId, actor.familyGroupId),
        ),
      );
    const temporaryAiResults = await tx
      .select({
        feature: aiOperationReceipts.feature,
        profileId: aiOperationReceipts.scopeKey,
        result: aiOperationReceipts.result,
        createdAt: aiOperationReceipts.createdAt,
        expiresAt: aiOperationReceipts.expiresAt,
      })
      .from(aiOperationReceipts)
      .where(
        and(
          eq(aiOperationReceipts.app, "agenda-da-turma"),
          eq(aiOperationReceipts.phase, "complete"),
          eq(aiOperationReceipts.actorUserId, actor.userId),
          eq(aiOperationReceipts.groupId, actor.familyGroupId),
          inArray(aiOperationReceipts.scopeKey, ids),
          sql`${aiOperationReceipts.expiresAt} > statement_timestamp()`,
        ),
      );
    return {
      temporaryAiResults,
      familyGroupId: actor.familyGroupId,
      profiles,
      actions,
      notices,
      sharedActivities,
      subjects,
      alternatingSlots,
      extraSubjects,
      memberships,
      kits,
      preferences,
    };
  });
}
