import "server-only";
import { createHash } from "node:crypto";
import {
  type WebClosureAuthority,
  WebClosureError,
  type WebClosureExecution,
  type WebClosurePlan,
} from "@informach/account/closure";
import { lockFrozenWebParticipation } from "@informach/auth/web-participation";
import { and, eq, inArray, isNull, sql } from "@informach/db";
import {
  boraChallenges,
  boraCustomWorkouts,
  boraFamilies,
  boraProfiles,
} from "@informach/db/schema";
import { lockAppClosureScope, removeClosureProfileLinks } from "@informach/family/closure";
import { type BoraCleanupTransaction, eraseBoraProfiles } from "./cleanup-repository";

const frozenActor = (authority: WebClosureAuthority) => ({
  userId: authority.actorId,
  operationId: authority.operationId,
  expectedRevision: authority.frozenRevision,
});
type Scope = Awaited<ReturnType<typeof lockAppClosureScope>>;

async function describeBoraClosure(
  tx: BoraCleanupTransaction,
  authority: WebClosureAuthority,
  scope: Scope,
): Promise<WebClosurePlan> {
  const selected = scope.remove.map((profile) => profile.id);
  const exclusiveGroups = scope.groups.filter((group) => group.exclusive).map((group) => group.id);
  const hash = createHash("sha256").update(JSON.stringify(["bora-closure-v1", scope.fingerprint]));
  let cursor = "",
    personalRecords = 0;
  const deadline = performance.now() + 45_000;
  while (true) {
    if (performance.now() >= deadline) throw new Error("Bora closure selection deadline");
    const rows = await tx.execute<{ key: string; version: string }>(sql`with owned as (
      select 'preferences:' || user_id as key, extract(epoch from created_at)::text as version from ${boraFamilies} where user_id = ${authority.actorId}
      union all select 'workout:' || id::text, extract(epoch from updated_at)::text from ${boraCustomWorkouts} where user_id = ${authority.actorId}
      union all select 'profile:' || id::text, extract(epoch from created_at)::text from ${boraProfiles} where ${inArray(boraProfiles.familyProfileId, selected)}
      union all select 'challenge:' || id::text, extract(epoch from created_at)::text from ${boraChallenges} where profile_id is null and ${inArray(boraChallenges.familyGroupId, exclusiveGroups)}
    ) select key, version from owned where key > ${cursor} order by key limit 250`);
    for (const row of rows) hash.update(JSON.stringify([row.key, row.version]));
    personalRecords += rows.length;
    if (rows.length < 250) break;
    cursor = rows[rows.length - 1]?.key ?? cursor;
  }
  const [shared] = await tx.execute<{ total: number }>(sql`select (
    (select count(*) from ${boraProfiles} where ${inArray(
      boraProfiles.familyProfileId,
      scope.preserve.map((profile) => profile.id),
    )})
    + (select count(*) from ${boraChallenges} where profile_id is null and ${inArray(
      boraChallenges.familyGroupId,
      scope.groups.filter((group) => !group.exclusive).map((group) => group.id),
    )})
  )::integer as total`);
  if (!shared) throw new Error("Bora closure selection unavailable");
  return {
    version: 1,
    fingerprint: hash.digest("hex"),
    personalRecords,
    sharedRecords: shared.total,
    credentials: 0,
    blockers: scope.blocked ? ["responsibilities"] : [],
  };
}

export async function prepareBoraClosure(
  tx: BoraCleanupTransaction,
  authority: WebClosureAuthority,
) {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  const scope = await lockAppClosureScope(tx, frozenActor(authority), "bora-treinar");
  return describeBoraClosure(tx, authority, scope);
}

export async function executeBoraClosure(tx: BoraCleanupTransaction, context: WebClosureExecution) {
  const actor = frozenActor(context);
  if (context.phase === "resume") {
    // Camera pairing is bound to the revoked web session, with no independent
    // persistent credential or private output cache to delete on resumption.
    await lockFrozenWebParticipation(tx, actor);
    return;
  }
  const scope = await lockAppClosureScope(tx, actor, "bora-treinar");
  const current = await describeBoraClosure(tx, context, scope);
  if (!context.plan || current.blockers.length || current.fingerprint !== context.plan.fingerprint)
    throw new WebClosureError("stale-plan");
  await tx.delete(boraFamilies).where(eq(boraFamilies.userId, context.actorId));
  const exclusive = scope.groups.filter((group) => group.exclusive).map((group) => group.id);
  if (exclusive.length)
    await tx
      .delete(boraChallenges)
      .where(
        and(inArray(boraChallenges.familyGroupId, exclusive), isNull(boraChallenges.profileId)),
      );
  await eraseBoraProfiles(
    tx,
    scope.remove.map((profile) => profile.id),
  );
  await removeClosureProfileLinks(tx, actor, "bora-treinar", scope.fingerprint);
}
