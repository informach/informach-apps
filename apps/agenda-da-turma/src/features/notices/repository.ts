import "server-only";
import { and, asc, db, desc, eq, getTableColumns, inArray, sql } from "@informach/db";
import {
  agendaActivityRevisions,
  agendaNoticeApplications,
  agendaNotices,
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  familyAccessGrants,
  users,
} from "@informach/db/schema";
import { profileAccessCondition } from "@informach/family/access";
import { accessibleProfileCondition } from "@/features/family/access";
import type { AgendaAuthority } from "@/features/family/authority";
import { studentGroupId, studentName } from "@/features/family/scope";
import { activeProfileSubjectCondition } from "@/features/profile-subjects/visibility";

import { currentAssigneeId } from "@/features/unified-activities/assignment-repository";

export async function listNoticeActions(
  actor: AgendaAuthority,
  options: {
    from?: string;
    to?: string;
    includeFinished?: boolean;
    profileId?: string;
    limit?: number;
    offset?: number;
    ids?: string[];
    noticeId?: string;
  } = {},
) {
  if (options.ids?.length === 0) return [];
  const query = db
    .select({
      action: { ...getTableColumns(agendaTasks), assignedToUserId: currentAssigneeId },
      profileName: studentName,
      familyGroupId: studentGroupId,
      source: agendaNotices.source,
      assignedName: users.name,
      // Nome e cor da matéria vinculada (turma ou extracurricular), para que a
      // providência seja lida por matéria como as atividades escolares. Nulos
      // quando não há vínculo — a UI cai no rótulo do tipo.
      subjectName: sql<
        string | null
      >`COALESCE(${agendaSubjects.name}, ${agendaProfileSubjects.name})`,
      subjectColorIndex: sql<
        number | null
      >`COALESCE(${agendaSubjects.colorIndex}, ${agendaProfileSubjects.colorIndex})`,
    })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .leftJoin(agendaNotices, eq(agendaNotices.id, agendaTasks.noticeId))
    .leftJoin(users, eq(users.id, currentAssigneeId))
    .leftJoin(agendaSubjects, eq(agendaSubjects.id, agendaTasks.subjectId))
    .leftJoin(agendaProfileSubjects, eq(agendaProfileSubjects.id, agendaTasks.profileSubjectId))
    .where(
      and(
        accessibleProfileCondition(actor),
        // Pausada é silêncio também aqui — e aqui mais do que em qualquer lugar.
        // Esta é a fonte do resumo por e-mail e do feed de calendário: sem o
        // predicado, a atividade sumia de todas as telas e mesmo assim o e-mail
        // das 20h nomeava o treino de natação que a família tinha acabado de
        // pausar.
        activeProfileSubjectCondition,
        options.ids ? inArray(agendaTasks.id, options.ids) : undefined,
        options.noticeId ? eq(agendaTasks.noticeId, options.noticeId) : undefined,
        options.profileId ? eq(agendaTasks.profileId, options.profileId) : undefined,
        options.includeFinished ? undefined : eq(agendaTasks.status, "pending"),
        options.from ? sql`${agendaTasks.dueAt} >= ${options.from}::date` : undefined,
        options.to ? sql`${agendaTasks.dueAt} <= ${options.to}::date` : undefined,
      ),
    )
    .orderBy(
      asc(agendaTasks.dueAt),
      asc(agendaTasks.time),
      desc(agendaTasks.createdAt),
      asc(agendaTasks.id),
    );
  return options.limit ? query.limit(options.limit).offset(options.offset ?? 0) : query;
}
export type NoticeActionRow = Awaited<ReturnType<typeof listNoticeActions>>[number];

export async function getNoticeAction(actor: AgendaAuthority, id: string) {
  const [row] = await db
    .select({
      action: { ...getTableColumns(agendaTasks), assignedToUserId: currentAssigneeId },
      profileName: studentName,
      familyGroupId: studentGroupId,
    })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(and(eq(agendaTasks.id, id), accessibleProfileCondition(actor)));
  return row ?? null;
}

export function sourceAccessCondition(actor: AgendaAuthority) {
  // The reviewed scope belongs to the whole original, including children who
  // have no extracted actions. Empty/unreviewed scope never grants guest access.
  return sql`${agendaNotices.familyGroupId} = ${actor.familyGroupId} AND (
    (${agendaNotices.status} <> 'confirmed'
      AND ${agendaNotices.createdByUserId} = ${actor.userId}
      AND ${agendaNotices.captureProfileId} IN (SELECT ${agendaStudentProfiles.id} FROM ${agendaStudentProfiles} WHERE ${accessibleProfileCondition(actor)}))
    OR (${agendaNotices.status} = 'confirmed'
      AND (${agendaNotices.sharedWithinFamily} OR ${agendaNotices.createdByUserId} = ${actor.userId})
      AND jsonb_array_length(coalesce(${agendaNotices.sourceProfileIds}, '[]'::jsonb)) > 0
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(${agendaNotices.sourceProfileIds}) scope(profile_id)
        WHERE scope.profile_id::uuid NOT IN (
          SELECT ${agendaStudentProfiles.id} FROM ${agendaStudentProfiles} WHERE ${accessibleProfileCondition(actor)}
        )))
  )`;
}

export async function listNoticeApplications(actor: AgendaAuthority, noticeId: string) {
  return db
    .select({ profileId: agendaNoticeApplications.profileId })
    .from(agendaNoticeApplications)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaNoticeApplications.profileId),
    )
    .where(and(eq(agendaNoticeApplications.noticeId, noticeId), accessibleProfileCondition(actor)));
}

export async function getNoticeSource(actor: AgendaAuthority, id: string) {
  const [notice] = await db
    .select()
    .from(agendaNotices)
    .where(and(eq(agendaNotices.id, id), sourceAccessCondition(actor)));
  return notice ?? null;
}

export async function listReadyNotices(actor: AgendaAuthority) {
  return db
    .select({
      id: agendaNotices.id,
      source: agendaNotices.source,
      createdAt: agendaNotices.createdAt,
    })
    .from(agendaNotices)
    .where(and(eq(agendaNotices.status, "ready"), sourceAccessCondition(actor)))
    .orderBy(desc(agendaNotices.createdAt))
    .limit(20);
}

export async function listNoticeOriginals(
  actor: AgendaAuthority,
  options: { page: number; profileId?: string },
) {
  return db
    .select({
      id: agendaNotices.id,
      source: agendaNotices.source,
      preview: sql<string>`left(${agendaNotices.text}, 240)`,
      attachmentName: agendaNotices.attachmentName,
      publishedAt: agendaNotices.publishedAt,
      createdAt: agendaNotices.createdAt,
    })
    .from(agendaNotices)
    .where(
      and(
        eq(agendaNotices.status, "confirmed"),
        sourceAccessCondition(actor),
        options.profileId
          ? sql`(
      ${agendaNotices.captureProfileId} = ${options.profileId}::uuid
      OR coalesce(${agendaNotices.sourceProfileIds}, '[]'::jsonb) ? ${options.profileId}
      OR EXISTS (SELECT 1 FROM ${agendaNoticeApplications}
        WHERE ${agendaNoticeApplications.noticeId} = ${agendaNotices.id}
          AND ${agendaNoticeApplications.profileId} = ${options.profileId}::uuid)
    )`
          : undefined,
      ),
    )
    .orderBy(desc(agendaNotices.createdAt), desc(agendaNotices.id))
    .limit(31)
    .offset((options.page - 1) * 30);
}

export async function getNoticeActionHistory(actor: AgendaAuthority, id: string) {
  return db
    .select({
      version: agendaActivityRevisions.version,
      previous: agendaActivityRevisions.previous,
      current: agendaActivityRevisions.current,
      createdAt: agendaActivityRevisions.createdAt,
      actor: users.name,
    })
    .from(agendaActivityRevisions)
    .leftJoin(users, eq(users.id, agendaActivityRevisions.actorId))
    .innerJoin(agendaTasks, eq(agendaTasks.id, agendaActivityRevisions.taskId))
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(and(eq(agendaActivityRevisions.taskId, id), accessibleProfileCondition(actor)))
    .orderBy(desc(agendaActivityRevisions.version))
    .limit(100);
}

export function listAssignableAdults(actor: AgendaAuthority) {
  return db
    .select({ profileId: agendaStudentProfiles.id, userId: users.id, name: users.name })
    .from(agendaStudentProfiles)
    .innerJoin(
      familyAccessGrants,
      and(
        eq(familyAccessGrants.profileId, agendaStudentProfiles.familyProfileId),
        eq(familyAccessGrants.action, "read"),
      ),
    )
    .innerJoin(users, eq(users.id, familyAccessGrants.userId))
    .where(
      and(
        accessibleProfileCondition(actor),
        profileAccessCondition(
          users.id,
          "agenda-da-turma",
          agendaStudentProfiles.familyProfileId,
          "read",
        ),
      ),
    );
}
