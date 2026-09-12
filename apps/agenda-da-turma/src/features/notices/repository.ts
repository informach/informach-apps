import "server-only";
import { and, asc, db, desc, eq, inArray, sql } from "@informach/db";
import {
  agendaActivityRevisions,
  agendaFamilyMembers,
  agendaFamilyProfileAccess,
  agendaNoticeActions,
  agendaNoticeApplications,
  agendaNotices,
  agendaStudentProfiles,
  users,
} from "@informach/db/schema";
import { accessibleProfileCondition } from "@/features/family/access";

export async function listNoticeActions(
  userId: string,
  options: {
    from?: string;
    to?: string;
    includeFinished?: boolean;
    profileId?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const query = db
    .select({
      action: agendaNoticeActions,
      profileName: agendaStudentProfiles.name,
      ownerUserId: agendaStudentProfiles.userId,
      source: agendaNotices.source,
      assignedName: users.name,
    })
    .from(agendaNoticeActions)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaNoticeActions.profileId))
    .leftJoin(agendaNotices, eq(agendaNotices.id, agendaNoticeActions.noticeId))
    .leftJoin(users, eq(users.id, agendaNoticeActions.assignedToUserId))
    .where(
      and(
        accessibleProfileCondition(userId),
        options.profileId ? eq(agendaNoticeActions.profileId, options.profileId) : undefined,
        options.includeFinished ? undefined : eq(agendaNoticeActions.status, "pending"),
        options.from ? sql`${agendaNoticeActions.dueAt} >= ${options.from}::date` : undefined,
        options.to ? sql`${agendaNoticeActions.dueAt} <= ${options.to}::date` : undefined,
      ),
    )
    .orderBy(
      asc(agendaNoticeActions.dueAt),
      asc(agendaNoticeActions.time),
      desc(agendaNoticeActions.createdAt),
      asc(agendaNoticeActions.id),
    );
  return options.limit ? query.limit(options.limit).offset(options.offset ?? 0) : query;
}
export type NoticeActionRow = Awaited<ReturnType<typeof listNoticeActions>>[number];

export async function getNoticeAction(userId: string, id: string) {
  const [row] = await db
    .select({
      action: agendaNoticeActions,
      profileName: agendaStudentProfiles.name,
      ownerUserId: agendaStudentProfiles.userId,
    })
    .from(agendaNoticeActions)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaNoticeActions.profileId))
    .where(and(eq(agendaNoticeActions.id, id), accessibleProfileCondition(userId)));
  return row ?? null;
}

export function sourceAccessCondition(userId: string) {
  // The reviewed scope belongs to the whole original, including children who
  // have no extracted actions. Empty/unreviewed scope never grants guest access.
  return sql`(
    ${agendaNotices.ownerUserId} = ${userId}
    OR (${agendaNotices.createdByUserId} = ${userId}
      AND ${agendaNotices.captureProfileId} IN (SELECT ${agendaStudentProfiles.id} FROM ${agendaStudentProfiles} WHERE ${accessibleProfileCondition(userId)}))
    OR (${agendaNotices.status} = 'confirmed'
      AND jsonb_array_length(coalesce(${agendaNotices.sourceProfileIds}, '[]'::jsonb)) > 0
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(${agendaNotices.sourceProfileIds}) scope(profile_id)
        WHERE scope.profile_id::uuid NOT IN (
          SELECT ${agendaStudentProfiles.id} FROM ${agendaStudentProfiles} WHERE ${accessibleProfileCondition(userId)}
        )))
  )`;
}

export async function listNoticeApplications(userId: string, noticeId: string) {
  return db
    .select({ profileId: agendaNoticeApplications.profileId })
    .from(agendaNoticeApplications)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaNoticeApplications.profileId),
    )
    .where(
      and(eq(agendaNoticeApplications.noticeId, noticeId), accessibleProfileCondition(userId)),
    );
}

export async function getNoticeSource(userId: string, id: string) {
  const [notice] = await db
    .select()
    .from(agendaNotices)
    .where(and(eq(agendaNotices.id, id), sourceAccessCondition(userId)));
  return notice ?? null;
}

export async function listReadyNotices(userId: string) {
  return db
    .select({
      id: agendaNotices.id,
      source: agendaNotices.source,
      createdAt: agendaNotices.createdAt,
    })
    .from(agendaNotices)
    .where(and(eq(agendaNotices.status, "ready"), sourceAccessCondition(userId)))
    .orderBy(desc(agendaNotices.createdAt))
    .limit(20);
}

export async function getNoticeActionHistory(userId: string, id: string) {
  if (!(await getNoticeAction(userId, id))) return [];
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
    .where(eq(agendaActivityRevisions.noticeActionId, id))
    .orderBy(desc(agendaActivityRevisions.version))
    .limit(100);
}

export async function listAssignableAdults(userId: string) {
  const ownProfiles = db
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .where(accessibleProfileCondition(userId));
  const owners = await db
    .select({ profileId: agendaStudentProfiles.id, userId: users.id, name: users.name })
    .from(agendaStudentProfiles)
    .innerJoin(users, eq(users.id, agendaStudentProfiles.userId))
    .where(inArray(agendaStudentProfiles.id, ownProfiles));
  const guests = await db
    .select({ profileId: agendaFamilyProfileAccess.profileId, userId: users.id, name: users.name })
    .from(agendaFamilyProfileAccess)
    .innerJoin(agendaFamilyMembers, eq(agendaFamilyMembers.id, agendaFamilyProfileAccess.memberId))
    .innerJoin(users, eq(users.id, agendaFamilyMembers.userId))
    .where(inArray(agendaFamilyProfileAccess.profileId, ownProfiles));
  return [...owners, ...guests];
}
