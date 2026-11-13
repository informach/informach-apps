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
  estrelaChildren,
  estrelaDevices,
  estrelaFamilies,
  estrelaNotificationDeliveries,
  estrelaPushSubscriptions,
  estrelaRewards,
} from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import { lockAppClosureScope, removeClosureProfileLinks } from "@informach/family/closure";
import { liveDeliveryCondition } from "../lembretes/repository";
import { eraseEstrelaProfiles } from "./cleanup-repository";

const frozenActor = (authority: WebClosureAuthority) => ({
  userId: authority.actorId,
  operationId: authority.operationId,
  expectedRevision: authority.frozenRevision,
});
type Scope = Awaited<ReturnType<typeof lockAppClosureScope>>;

async function pendingDeliveries(tx: FamilyTransaction, actorId: string) {
  const [pending] = await tx
    .select({ id: estrelaNotificationDeliveries.id })
    .from(estrelaNotificationDeliveries)
    .where(and(eq(estrelaNotificationDeliveries.userId, actorId), liveDeliveryCondition()))
    .limit(1);
  return !!pending;
}

async function describeEstrelaClosure(
  tx: FamilyTransaction,
  scope: Scope,
  actorId: string,
): Promise<WebClosurePlan> {
  const removed = scope.remove.map((profile) => profile.id);
  const exclusive = scope.groups.filter((group) => group.exclusive).map((group) => group.id);
  const preserved = scope.preserve.map((profile) => profile.id);
  const sharedGroups = scope.groups.filter((group) => !group.exclusive).map((group) => group.id);
  const digest = createHash("sha256").update(
    JSON.stringify(["estrela-closure-v1", scope.fingerprint]),
  );
  let cursor = "";
  let personalRecords = 0;
  const deadline = performance.now() + 45_000;
  while (true) {
    if (performance.now() >= deadline) throw new Error("Estrela closure selection deadline");
    const page = await tx.execute<{ key: string; version: string }>(sql`with roots as (
      select 'child:' || id::text as key, extract(epoch from created_at)::text as version from ${estrelaChildren} where ${inArray(estrelaChildren.familyProfileId, removed)}
      union all select 'family:' || family_group_id::text, extract(epoch from created_at)::text from ${estrelaFamilies} where ${inArray(estrelaFamilies.familyGroupId, exclusive)}
      union all select 'reward:' || id::text, extract(epoch from created_at)::text from ${estrelaRewards} where ${inArray(estrelaRewards.familyGroupId, exclusive)}
    ) select key, version from roots where key > ${cursor} order by key limit 250`);
    for (const row of page) digest.update(JSON.stringify([row.key, row.version]));
    personalRecords += page.length;
    if (page.length < 250) break;
    cursor = page[page.length - 1]?.key ?? cursor;
  }
  const [counts] = await tx.execute<{ shared: number; credentials: number }>(sql`select (
    (select count(*) from ${estrelaChildren} where ${inArray(estrelaChildren.familyProfileId, preserved)})
    + (select count(*) from ${estrelaFamilies} where ${inArray(estrelaFamilies.familyGroupId, sharedGroups)})
    + (select count(*) from ${estrelaRewards} where ${inArray(estrelaRewards.familyGroupId, sharedGroups)})
  )::integer as shared, (
    (select count(*) from ${estrelaDevices} where user_id = ${actorId})
    + (select count(*) from ${estrelaPushSubscriptions} where user_id = ${actorId})
  )::integer as credentials`);
  if (!counts) throw new Error("Estrela closure counts unavailable");
  const blockers: WebClosurePlan["blockers"] = [];
  if (scope.blocked) blockers.push("responsibilities");
  if (await pendingDeliveries(tx, actorId)) blockers.push("pending_operations");
  return {
    version: 1,
    fingerprint: digest.digest("hex"),
    personalRecords,
    sharedRecords: counts.shared,
    credentials: counts.credentials,
    blockers,
  };
}

export async function prepareEstrelaClosure(tx: FamilyTransaction, authority: WebClosureAuthority) {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  const scope = await lockAppClosureScope(tx, frozenActor(authority), "dia-de-estrela");
  return describeEstrelaClosure(tx, scope, authority.actorId);
}

export async function executeEstrelaClosure(tx: FamilyTransaction, context: WebClosureExecution) {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  const actor = frozenActor(context);
  if (context.phase === "resume") {
    await lockFrozenWebParticipation(tx, actor);
    if (await pendingDeliveries(tx, context.actorId)) throw new WebClosureError("not-ready");
    // Keep de-duplication receipts, so a delayed job cannot recreate an old
    // notification when the account reopens. Its claim cannot return to sent.
    await tx
      .update(estrelaNotificationDeliveries)
      .set({ status: "failed" })
      .where(
        and(
          eq(estrelaNotificationDeliveries.userId, context.actorId),
          eq(estrelaNotificationDeliveries.status, "processing"),
        ),
      );
  } else {
    const scope = await lockAppClosureScope(tx, actor, "dia-de-estrela");
    const current = await describeEstrelaClosure(tx, scope, context.actorId);
    if (
      !context.plan ||
      current.blockers.length ||
      current.fingerprint !== context.plan.fingerprint
    )
      throw new WebClosureError("stale-plan");
    await eraseEstrelaProfiles(
      tx,
      scope.remove.map((profile) => profile.id),
    );
    const exclusive = scope.groups.filter((group) => group.exclusive).map((group) => group.id);
    if (exclusive.length) {
      await tx.delete(estrelaRewards).where(inArray(estrelaRewards.familyGroupId, exclusive));
      await tx.delete(estrelaFamilies).where(inArray(estrelaFamilies.familyGroupId, exclusive));
    }
    await removeClosureProfileLinks(tx, actor, "dia-de-estrela", scope.fingerprint);
    await tx
      .delete(estrelaNotificationDeliveries)
      .where(eq(estrelaNotificationDeliveries.userId, context.actorId));
  }
  // Tokens/codes and endpoints belong to the issuer, never the historical
  // creator of the family. The freeze prevents new issuance in this revision.
  await tx.delete(estrelaDevices).where(eq(estrelaDevices.userId, context.actorId));
  await tx
    .delete(estrelaPushSubscriptions)
    .where(eq(estrelaPushSubscriptions.userId, context.actorId));
}
