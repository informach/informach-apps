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
  missaoCompetitions,
  missaoCompetitors,
  missaoFamilies,
  missaoFamilyChallenges,
  missaoProfiles,
  missaoReports,
  missaoStudyDevices,
} from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import { lockAppClosureScope, removeClosureProfileLinks } from "@informach/family/closure";
import { eraseMissaoProfiles } from "./cleanup-repository";

const frozenActor = (authority: WebClosureAuthority) => ({
  userId: authority.actorId,
  operationId: authority.operationId,
  expectedRevision: authority.frozenRevision,
});
type Scope = Awaited<ReturnType<typeof lockAppClosureScope>>;

async function selectMissaoClosure(tx: FamilyTransaction, scope: Scope, actorId: string) {
  const removed = scope.remove.map((profile) => profile.id);
  const native = await tx
    .select({ id: missaoProfiles.id })
    .from(missaoProfiles)
    .where(inArray(missaoProfiles.familyProfileId, removed));
  const nativeIds = native.map((profile) => profile.id);
  const exclusive = scope.groups.filter((group) => group.exclusive).map((group) => group.id);
  const groupIds = [
    ...new Set([
      ...scope.groups.map((group) => group.id),
      ...scope.remove.map((profile) => profile.groupId),
      ...scope.preserve.map((profile) => profile.groupId),
    ]),
  ];
  // A mixed competition is indivisible: deleting one participant would retain a
  // private snapshot behind SET NULL or erase the other participants' history.
  // Require the family to resolve this responsibility before confirmation.
  const competitionRows = await tx.execute<{
    id: string;
    has_selected: boolean;
    has_other: boolean;
    exclusive: boolean;
  }>(sql`
    select c.id, ${inArray(sql`c.family_group_id`, exclusive)} as exclusive,
      exists (select 1 from ${missaoCompetitors} p where p.competition_id = c.id and ${inArray(sql`p.profile_id`, nativeIds)}) as has_selected,
      exists (select 1 from ${missaoCompetitors} p where p.competition_id = c.id and (p.profile_id is null or not (${inArray(sql`p.profile_id`, nativeIds)}))) as has_other
    from ${missaoCompetitions} c where ${inArray(sql`c.family_group_id`, groupIds)} order by c.id`);
  const competitions = competitionRows
    .filter((row) => row.exclusive || (row.has_selected && !row.has_other))
    .map((row) => row.id);
  const mixedCompetition = competitionRows.some(
    (row) => !row.exclusive && row.has_selected && row.has_other,
  );
  const digest = createHash("sha256").update(
    JSON.stringify(["missao-closure-v1", scope.fingerprint, competitionRows]),
  );
  let cursor = "",
    personalRecords = 0;
  const deadline = performance.now() + 45_000;
  while (true) {
    if (performance.now() >= deadline) throw new Error("Missao closure selection deadline");
    const page = await tx.execute<{ key: string; version: string }>(sql`with roots as (
      select 'preferences:' || user_id as key, extract(epoch from created_at)::text as version from ${missaoFamilies} where user_id = ${actorId}
      union all select 'profile:' || id::text, extract(epoch from created_at)::text from ${missaoProfiles} where ${inArray(missaoProfiles.familyProfileId, removed)}
      union all select 'report:' || id::text, extract(epoch from created_at)::text from ${missaoReports} where user_id = ${actorId} and profile_id is null
      union all select 'competition:' || id::text, extract(epoch from created_at)::text from ${missaoCompetitions} where ${inArray(missaoCompetitions.id, competitions)}
      union all select 'challenge:' || family_group_id::text || ':' || week_start::text, extract(epoch from created_at)::text from ${missaoFamilyChallenges} where ${inArray(missaoFamilyChallenges.familyGroupId, exclusive)}
    ) select key, version from roots where key > ${cursor} order by key limit 250`);
    for (const row of page) digest.update(JSON.stringify([row.key, row.version]));
    personalRecords += page.length;
    if (page.length < 250) break;
    cursor = page[page.length - 1]?.key ?? cursor;
  }
  const [counts] = await tx.execute<{ shared: number; credentials: number }>(sql`select (
    (select count(*) from ${missaoProfiles} where ${inArray(
      missaoProfiles.familyProfileId,
      scope.preserve.map((profile) => profile.id),
    )})
    + (select count(*) from ${missaoFamilyChallenges} where ${inArray(
      missaoFamilyChallenges.familyGroupId,
      scope.groups.filter((group) => !group.exclusive).map((group) => group.id),
    )})
  )::integer as shared, (select count(*)::integer from ${missaoStudyDevices} where user_id = ${actorId}) as credentials`);
  if (!counts) throw new Error("Missao closure counts unavailable");
  const plan: WebClosurePlan = {
    version: 1,
    fingerprint: digest.digest("hex"),
    personalRecords,
    sharedRecords: counts.shared + competitionRows.length - competitions.length,
    credentials: counts.credentials,
    blockers: scope.blocked || mixedCompetition ? ["responsibilities"] : [],
  };
  return { plan, competitions, exclusive, removed };
}

export async function prepareMissaoClosure(tx: FamilyTransaction, authority: WebClosureAuthority) {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  const scope = await lockAppClosureScope(tx, frozenActor(authority), "missao-saber");
  return (await selectMissaoClosure(tx, scope, authority.actorId)).plan;
}

export async function executeMissaoClosure(tx: FamilyTransaction, context: WebClosureExecution) {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  const actor = frozenActor(context);
  if (context.phase === "resume") {
    await lockFrozenWebParticipation(tx, actor);
  } else {
    const scope = await lockAppClosureScope(tx, actor, "missao-saber");
    const selected = await selectMissaoClosure(tx, scope, context.actorId);
    if (
      !context.plan ||
      selected.plan.blockers.length ||
      selected.plan.fingerprint !== context.plan.fingerprint
    )
      throw new WebClosureError("stale-plan");
    if (selected.competitions.length)
      await tx
        .delete(missaoCompetitions)
        .where(inArray(missaoCompetitions.id, selected.competitions));
    await eraseMissaoProfiles(tx, selected.removed);
    if (selected.exclusive.length)
      await tx
        .delete(missaoFamilyChallenges)
        .where(inArray(missaoFamilyChallenges.familyGroupId, selected.exclusive));
    await tx
      .delete(missaoReports)
      .where(and(eq(missaoReports.userId, context.actorId), isNull(missaoReports.profileId)));
    await tx.delete(missaoFamilies).where(eq(missaoFamilies.userId, context.actorId));
    await removeClosureProfileLinks(tx, actor, "missao-saber", scope.fingerprint);
  }
  // Study tokens/pairing codes are issuer-owned; deleting preferences is not
  // a revocation mechanism. Other adults' devices remain attached to their data.
  await tx.delete(missaoStudyDevices).where(eq(missaoStudyDevices.userId, context.actorId));
}
