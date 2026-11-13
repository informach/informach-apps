import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import {
  currentWebParticipationCondition,
  lockActiveWebParticipation,
  WebParticipationError,
} from "@informach/auth/web-participation";
import { and, db, eq, inArray, isNull, sql } from "@informach/db";
import {
  agendaCalendarFeedProfiles,
  agendaCalendarFeeds,
  agendaStudentProfiles,
  agendaTasks,
} from "@informach/db/schema";
import { FamilyError } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import {
  captureProfileReadDelegations,
  delegatedProfileReadCondition,
} from "@informach/family/delegation";
import { agendaAccessInTransaction } from "@/features/billing/access-repository";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition, studentName } from "@/features/family/scope";
import { hashFamilyToken } from "@/features/family/tokens";
import { activeProfileSubjectCondition } from "@/features/profile-subjects/visibility";

function validFeed(token: string) {
  return and(
    eq(agendaCalendarFeeds.tokenHash, hashFamilyToken(token)),
    isNull(agendaCalendarFeeds.revokedAt),
    sql`(${agendaCalendarFeeds.expiresAt} IS NULL OR ${agendaCalendarFeeds.expiresAt} > statement_timestamp())`,
  );
}
function validClaim() {
  return and(
    currentWebParticipationCondition(
      agendaCalendarFeeds.userId,
      agendaCalendarFeeds.webParticipationRevision,
    ),
    delegatedProfileReadCondition(agendaCalendarFeeds.userId, "agenda-da-turma", {
      profileId: agendaCalendarFeedProfiles.profileId,
      groupId: agendaCalendarFeedProfiles.groupId,
      readGrantId: agendaCalendarFeedProfiles.readGrantId,
      delegationKey: agendaCalendarFeedProfiles.activationGeneration,
    }),
  );
}
function ownContext(actor: AgendaAuthority) {
  return and(
    eq(agendaCalendarFeeds.userId, actor.userId),
    sql`(
    ${agendaCalendarFeeds.familyGroupId} = ${actor.familyGroupId}::uuid
    OR (${agendaCalendarFeeds.familyGroupId} IS NULL AND EXISTS (
      SELECT 1 FROM ${agendaCalendarFeedProfiles} fcp WHERE fcp.feed_id = ${agendaCalendarFeeds.id} AND fcp.group_id = ${actor.familyGroupId}::uuid
    )))`,
  );
}

export async function replaceCalendarFeed(actor: AgendaAuthority, token: string) {
  return db.transaction(async (tx) => {
    const access = await agendaAccessInTransaction(tx, actor);
    if (!access.enabled) return err({ code: "PRO_REQUIRED" } as const);
    const webParticipationRevision = await lockActiveWebParticipation(tx, actor.userId);
    const profiles = await tx
      .select({ activationId: agendaStudentProfiles.familyProfileId })
      .from(agendaStudentProfiles)
      .where(agendaProfileCondition(actor));
    const ids = profiles.flatMap((p) => (p.activationId ? [p.activationId] : []));
    if (!ids.length) return err({ code: "NO_PROFILES" } as const);
    const claims = await captureProfileReadDelegations(
      tx,
      actor.userId,
      "agenda-da-turma",
      actor.familyGroupId,
      ids,
    );
    // Serializes rotations by the same adult, including a legacy multi-household token.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:feed:${actor.userId}`}))`);
    await tx.update(agendaCalendarFeeds).set({ revokedAt: new Date() }).where(ownContext(actor));
    const [feed] = await tx
      .insert(agendaCalendarFeeds)
      .values({
        userId: actor.userId,
        familyGroupId: actor.familyGroupId,
        tokenHash: hashFamilyToken(token),
        webParticipationRevision,
        expiresAt: new Date(Date.now() + 365 * 86400000),
      })
      .returning({ id: agendaCalendarFeeds.id, expiresAt: agendaCalendarFeeds.expiresAt });
    if (!feed) throw new Error("Calendar capability insert failed");
    await tx.insert(agendaCalendarFeedProfiles).values(
      claims.map((claim) => ({
        feedId: feed.id,
        profileId: claim.profileId,
        groupId: claim.groupId,
        readGrantId: claim.readGrantId,
        activationGeneration: claim.delegationKey,
      })),
    );
    return ok({ id: feed.id, expiresAt: feed.expiresAt });
  });
}

export function deleteCalendarFeeds(actor: AgendaAuthority) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:feed:${actor.userId}`}))`);
    await tx.update(agendaCalendarFeeds).set({ revokedAt: new Date() }).where(ownContext(actor));
  });
}
export async function findActiveCalendarFeed(actor: AgendaAuthority) {
  const [row] = await db
    .select({ id: agendaCalendarFeeds.id, expiresAt: agendaCalendarFeeds.expiresAt })
    .from(agendaCalendarFeeds)
    .innerJoin(
      agendaCalendarFeedProfiles,
      eq(agendaCalendarFeedProfiles.feedId, agendaCalendarFeeds.id),
    )
    .where(
      and(
        ownContext(actor),
        eq(agendaCalendarFeedProfiles.groupId, actor.familyGroupId),
        validClaim(),
        isNull(agendaCalendarFeeds.revokedAt),
        sql`(${agendaCalendarFeeds.expiresAt} IS NULL OR ${agendaCalendarFeeds.expiresAt} > statement_timestamp())`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The content query checks the capability again, including its exact grant generations. */
export function readCalendarTasks(token: string, from: string, to: string) {
  return db.transaction(async (tx) => {
    const scopes = await tx
      .select({ userId: agendaCalendarFeeds.userId, groupId: agendaCalendarFeedProfiles.groupId })
      .from(agendaCalendarFeeds)
      .innerJoin(
        agendaCalendarFeedProfiles,
        eq(agendaCalendarFeedProfiles.feedId, agendaCalendarFeeds.id),
      )
      .where(and(validFeed(token), validClaim()));
    const groups = [...new Map(scopes.map((scope) => [scope.groupId, scope])).values()].sort(
      (a, b) => a.groupId.localeCompare(b.groupId),
    );
    if (!groups.length) return null;
    const allowed: string[] = [];
    for (const scope of groups) {
      try {
        const access = await agendaAccessInTransaction(tx, {
          userId: scope.userId,
          familyGroupId: scope.groupId,
        });
        if (access.enabled) allowed.push(scope.groupId);
      } catch (error) {
        // A membership may be revoked while this public capability waits for the family lock.
        if (
          !(error instanceof WebParticipationError) &&
          (!(error instanceof FamilyError) || error.code !== "ACCESS_DENIED")
        )
          throw error;
      }
    }
    if (!allowed.length) return null;
    return tx
      .select({ action: agendaTasks, profileName: studentName })
      .from(agendaCalendarFeeds)
      .innerJoin(
        agendaCalendarFeedProfiles,
        eq(agendaCalendarFeedProfiles.feedId, agendaCalendarFeeds.id),
      )
      .innerJoin(
        agendaStudentProfiles,
        eq(agendaStudentProfiles.familyProfileId, agendaCalendarFeedProfiles.profileId),
      )
      .innerJoin(agendaTasks, eq(agendaTasks.profileId, agendaStudentProfiles.id))
      .where(
        and(
          validFeed(token),
          validClaim(),
          inArray(agendaCalendarFeedProfiles.groupId, allowed),
          activeProfileSubjectCondition,
          sql`${agendaTasks.dueAt} >= ${from}::date AND ${agendaTasks.dueAt} <= ${to}::date`,
        ),
      );
  });
}
