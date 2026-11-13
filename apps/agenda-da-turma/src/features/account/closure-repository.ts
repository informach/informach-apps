import "server-only";
import { createHash } from "node:crypto";
import {
  type WebClosureAuthority,
  WebClosureError,
  type WebClosureExecution,
  type WebClosurePlan,
} from "@informach/account/closure";
import { lockFrozenWebParticipation } from "@informach/auth/web-participation";
import { and, eq, inArray, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityAcceptances,
  agendaCalendarFeeds,
  agendaFamilySettings,
  agendaIdempotentWrites,
  agendaNotices,
  agendaNotificationDeliveries,
  agendaNotificationPreferences,
  agendaProductEvents,
  agendaPushSubscriptions,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmas,
  agentRuns,
  aiOperationReceipts,
  familyGroups,
} from "@informach/db/schema";
import { type FamilyTransaction, requireFamilyCondition } from "@informach/family";
import { lockAppClosureScope, removeClosureProfileLinks } from "@informach/family/closure";
import { liveAgendaDeliveryCondition } from "@/features/notifications/delivery-repository";
import { eraseAgendaProfiles } from "./cleanup-repository";
import { selectAgendaNoticeClosure } from "./notice-closure-repository";
import { lockAgendaProfileSchoolContexts } from "./school-closure-repository";

const frozenActor = (authority: WebClosureAuthority) => ({
  userId: authority.actorId,
  operationId: authority.operationId,
  expectedRevision: authority.frozenRevision,
});
type Scope = Awaited<ReturnType<typeof lockAppClosureScope>>;

export class AgendaClosurePendingError extends Error {
  constructor() {
    super("Agenda operations are still settling");
    this.name = "AgendaClosurePendingError";
  }
}
async function hasPendingOperations(tx: FamilyTransaction, actorId: string) {
  const [row] = await tx.execute<{ pending: boolean }>(sql`select (
    exists (select 1 from ${agendaNotices} where created_by_user_id = ${actorId} and status = 'processing' and updated_at > clock_timestamp() - interval '10 minutes')
    or exists (select 1 from ${aiOperationReceipts} where app = 'agenda-da-turma' and actor_user_id = ${actorId} and phase = 'processing' and lease_until > clock_timestamp())
    or exists (select 1 from billing.credit_reservations where status = 'active' and (
      (app = 'agenda-da-turma' and owner_type = 'user' and owner_id = ${actorId})
      or (app = 'compasso' and consumer_app = 'agenda-da-turma' and actor_user_id = ${actorId})))
    or exists (select 1 from ${agendaNotificationDeliveries} where user_id = ${actorId} and ${liveAgendaDeliveryCondition()})
  ) as pending`);
  if (!row) throw new Error("Agenda pending operations unavailable");
  return row.pending;
}
async function lockScope(tx: FamilyTransaction, authority: WebClosureAuthority) {
  return lockAppClosureScope(
    tx,
    frozenActor(authority),
    "agenda-da-turma",
    async ({ profileIds, groupIds }) => {
      const verifySchool = await lockAgendaProfileSchoolContexts(tx, profileIds, authority.actorId);
      // Private originals may remain in a former family after all grants were
      // revoked. Their historical author still owns that private original, but
      // family mutations must be serialized even without a current membership.
      const originalGroups = () =>
        tx
          .selectDistinct({ id: agendaNotices.familyGroupId })
          .from(agendaNotices)
          .where(eq(agendaNotices.createdByUserId, authority.actorId));
      const ids = [
        ...new Set([...groupIds, ...(await originalGroups()).map((row) => row.id)]),
      ].sort();
      if (ids.length)
        await tx
          .select({ id: familyGroups.id })
          .from(familyGroups)
          .where(inArray(familyGroups.id, ids))
          .orderBy(familyGroups.id)
          .for("update");
      return async () => {
        await verifySchool();
        requireFamilyCondition(
          (await originalGroups()).every((row) => ids.includes(row.id)),
          "CONFLICT",
          "O histórico mudou. Atualize a página.",
        );
      };
    },
  );
}
async function selectClosure(tx: FamilyTransaction, scope: Scope, actorId: string) {
  const removed = scope.remove.map((profile) => profile.id);
  const native = await tx
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .where(inArray(agendaStudentProfiles.familyProfileId, removed));
  const nativeIds = native.map((profile) => profile.id);
  const notices = await selectAgendaNoticeClosure(tx, actorId, nativeIds, true);
  const digest = createHash("sha256").update(
    JSON.stringify([
      "agenda-closure-v1",
      scope.fingerprint,
      notices.erase,
      notices.preserved,
      notices.blocked,
    ]),
  );
  let cursor = "",
    personalRecords = notices.erase.length,
    schoolSharedRecords = 0;
  const deadline = performance.now() + 45_000;
  while (true) {
    if (performance.now() >= deadline) throw new Error("Agenda closure selection deadline");
    const rows = await tx.execute<{
      key: string;
      version: string;
      retained: boolean;
    }>(sql`with roots as (
      select 'profile:' || id::text as key, extract(epoch from updated_at)::text as version, false as retained from ${agendaStudentProfiles} where ${inArray(agendaStudentProfiles.familyProfileId, removed)}
      union all select 'preferences:' || id::text, extract(epoch from updated_at)::text, false from ${agendaNotificationPreferences} where user_id = ${actorId}
      union all select 'onboarding:' || family_group_id::text, extract(epoch from updated_at)::text, false from ${agendaFamilySettings} where user_id = ${actorId}
      union all select 'class-administration:' || id::text, extract(epoch from created_at)::text, false from ${agendaTurmas} where created_by_user_id = ${actorId}
      union all select 'subject:' || id::text, extract(epoch from created_at)::text, true from ${agendaSubjects} where created_by_user_id = ${actorId}
      union all select 'publication:' || id::text, extract(epoch from created_at)::text,
        (visibility = 'shared_with_turma' or exists (select 1 from ${agendaTasks} t where t.shared_activity_id = ${agendaActivities.id} and not (${inArray(sql`t.profile_id`, nativeIds)})))
        from ${agendaActivities} where created_by_user_id = ${actorId}
    ) select key, version, retained from roots where key > ${cursor} order by key limit 250`);
    for (const row of rows) {
      digest.update(JSON.stringify([row.key, row.version, row.retained]));
      if (row.retained) schoolSharedRecords++;
      else personalRecords++;
    }
    if (rows.length < 250) break;
    cursor = rows[rows.length - 1]?.key ?? cursor;
  }
  const [counts] = await tx.execute<{ shared: number; credentials: number }>(sql`select
    (select count(*)::integer from ${agendaStudentProfiles} where ${inArray(
      agendaStudentProfiles.familyProfileId,
      scope.preserve.map((p) => p.id),
    )}) as shared,
    ((select count(*) from ${agendaPushSubscriptions} where user_id = ${actorId}) + (select count(*) from ${agendaCalendarFeeds} where user_id = ${actorId}))::integer as credentials`);
  if (!counts) throw new Error("Agenda closure counts unavailable");
  const blockers: WebClosurePlan["blockers"] = [];
  if (scope.blocked || notices.blocked) blockers.push("responsibilities");
  if (await hasPendingOperations(tx, actorId)) blockers.push("pending_operations");
  const plan: WebClosurePlan = {
    version: 1,
    fingerprint: digest.digest("hex"),
    personalRecords,
    sharedRecords: counts.shared + notices.preserved.length + schoolSharedRecords,
    credentials: counts.credentials,
    blockers,
  };
  return { plan, removed, notices };
}
export async function prepareAgendaClosure(tx: FamilyTransaction, authority: WebClosureAuthority) {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  return (await selectClosure(tx, await lockScope(tx, authority), authority.actorId)).plan;
}

/** No external I/O here: commitWebClosureStep owns the atomic domain receipt. */
export async function executeAgendaClosure(tx: FamilyTransaction, context: WebClosureExecution) {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  const actorId = context.actorId;
  if (context.phase === "resume") {
    await lockFrozenWebParticipation(tx, frozenActor(context));
    if (await hasPendingOperations(tx, actorId)) throw new AgendaClosurePendingError();
    // Preserve paid completed drafts. An uncharged abandoned output must not
    // become a free/replayable result when participation is reopened.
    await tx.execute(sql`update ${agendaNotices} n set
      status = case when exists (select 1 from billing.credit_reservations r where r.id = n.billing_run_id and r.status = 'committed') and n.parsed_result is not null then 'ready' else 'failed' end,
      parsed_result = case when exists (select 1 from billing.credit_reservations r where r.id = n.billing_run_id and r.status = 'committed') then n.parsed_result else null end,
      updated_at = clock_timestamp()
      where n.created_by_user_id = ${actorId} and n.status = 'processing'`);
    await tx
      .update(agendaNotificationDeliveries)
      .set({ status: "canceled" })
      .where(
        and(
          eq(agendaNotificationDeliveries.userId, actorId),
          inArray(agendaNotificationDeliveries.status, ["processing", "pending", "failed"]),
        ),
      );
  } else {
    const scope = await lockScope(tx, context);
    const selected = await selectClosure(tx, scope, actorId);
    if (
      !context.plan ||
      selected.plan.blockers.length ||
      selected.plan.fingerprint !== context.plan.fingerprint
    )
      throw new WebClosureError("stale-plan");
    if (selected.notices.erase.length)
      await tx.delete(agendaNotices).where(
        inArray(
          agendaNotices.id,
          selected.notices.erase.map((row) => row.id),
        ),
      );
    await eraseAgendaProfiles(tx, selected.removed, actorId);
    await tx.delete(agendaFamilySettings).where(eq(agendaFamilySettings.userId, actorId));
    await tx
      .delete(agendaNotificationPreferences)
      .where(eq(agendaNotificationPreferences.userId, actorId));
    await tx
      .delete(agendaNotificationDeliveries)
      .where(eq(agendaNotificationDeliveries.userId, actorId));
    await tx.delete(agendaActivityAcceptances).where(eq(agendaActivityAcceptances.userId, actorId));
    await tx.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, actorId));
    // The existing classroom contract permits orphaned rooms: retain other
    // families' publications/memberships, remove this adult's administration.
    await tx
      .update(agendaTurmas)
      .set({ createdByUserId: null })
      .where(eq(agendaTurmas.createdByUserId, actorId));
    // Historical authorship in preserved shared records stays with that history.
    // It grants no active access. Remove only unused legacy private publications.
    await tx
      .delete(agendaActivities)
      .where(
        and(
          eq(agendaActivities.createdByUserId, actorId),
          eq(agendaActivities.visibility, "individual"),
          sql`not exists (select 1 from ${agendaTasks} where ${agendaTasks.sharedActivityId} = ${agendaActivities.id})`,
        ),
      );
    await tx.delete(agentRuns).where(
      and(
        eq(agentRuns.app, "agenda-da-turma"),
        sql`(
      ${agentRuns.metadata}->>'userId' = ${actorId} or ${agentRuns.id} in (select id from billing.credit_reservations where
      (app = 'agenda-da-turma' and owner_type = 'user' and owner_id = ${actorId}) or (app = 'compasso' and consumer_app = 'agenda-da-turma' and actor_user_id = ${actorId})))`,
      ),
    );
    await removeClosureProfileLinks(tx, frozenActor(context), "agenda-da-turma", scope.fingerprint);
  }
  await tx.delete(agendaCalendarFeeds).where(eq(agendaCalendarFeeds.userId, actorId));
  await tx.delete(agendaPushSubscriptions).where(eq(agendaPushSubscriptions.userId, actorId));
  // Keep the old revision/request fence through normal 24-hour retention.
  // Deleting it would let a delayed retry purchase the same output again.
  await tx
    .update(aiOperationReceipts)
    .set({
      phase: "failed",
      result: null,
      actualCredits: null,
      leaseUntil: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiOperationReceipts.app, "agenda-da-turma"),
        eq(aiOperationReceipts.actorUserId, actorId),
      ),
    );
  // Keep the idempotency key through its normal retention, without private output.
  // A delayed offline retry must not execute a second mutation after resumption.
  await tx
    .update(agendaIdempotentWrites)
    .set({ result: { ok: false, error: { code: "NOT_FOUND" } } })
    .where(eq(agendaIdempotentWrites.userId, actorId));
}
