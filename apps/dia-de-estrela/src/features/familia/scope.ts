import "server-only";
import { currentWebParticipationCondition } from "@informach/auth/web-participation";
import { and, eq, inArray, type SQLWrapper, sql } from "@informach/db";
import {
  estrelaChildren,
  estrelaDeviceChildren,
  estrelaDevices,
  estrelaFamilies,
  familyAppProfiles,
} from "@informach/db/schema";
import type { FamilyAction, FamilyTransaction } from "@informach/family";
import { profileAccessCondition } from "@informach/family/access";
import { lockProfilesAccess } from "@informach/family/context";
import { delegatedProfileAccessCondition } from "@informach/family/delegation";
import { assertAllowed } from "@/lib/errors";
import type { EstrelaAuthority, PinAuthority } from "./authority";

/** A device keeps the exact delegation that authorized it, never a renewed/recreated grant. */
export function deviceChildCondition(
  userId: string | SQLWrapper,
  deviceId: SQLWrapper,
  nativeChildId: SQLWrapper,
  connected = true,
) {
  return sql`EXISTS (
    SELECT 1 FROM ${estrelaDevices} child_device
    JOIN ${estrelaDeviceChildren} child_grant ON child_grant.device_id = child_device.id
    JOIN ${estrelaChildren} device_child ON device_child.id = child_grant.child_id
    WHERE child_device.id = ${deviceId} AND child_device.user_id = ${userId}
      AND device_child.id = ${nativeChildId} AND child_device.revoked_at IS NULL
      AND child_device.expires_at > statement_timestamp()
      AND ${currentWebParticipationCondition(userId, sql`child_device.web_participation_revision`)}
      ${connected ? sql`AND child_device.connected_at IS NOT NULL` : sql``}
      AND ${delegatedProfileAccessCondition(userId, "dia-de-estrela", {
        profileId: sql`device_child.family_profile_id`,
        groupId: sql`child_device.family_group_id`,
        delegationKey: sql`child_grant.delegation_key`,
        readGrantId: sql`child_grant.read_grant_id`,
        writeGrantId: sql`child_grant.write_grant_id`,
      })}
  )`;
}

/** PIN changes and expiry invalidate an already opened parent screen at the database boundary. */
function pinCondition(actor: PinAuthority) {
  if (!Number.isSafeInteger(actor.unlockedUntil)) return sql`false`;
  return sql`EXISTS (SELECT 1 FROM ${estrelaFamilies} pin_family
    WHERE pin_family.family_group_id = ${actor.familyGroupId}::uuid
      AND pin_family.pin_generation = ${actor.pinGeneration}::uuid
      AND pin_family.pin_hash IS NOT NULL
      AND to_timestamp(${actor.unlockedUntil}::double precision / 1000) > statement_timestamp())`;
}

export function childAccessCondition(
  actor: EstrelaAuthority,
  nativeChildId: SQLWrapper,
  action: FamilyAction = "read",
) {
  if (action === "use_ai" || (actor.kind !== "adult" && action === "manage")) return sql`false`;
  return sql`EXISTS (
    SELECT 1 FROM ${estrelaChildren} authorized_child
    JOIN ${familyAppProfiles} child_activation ON child_activation.id = authorized_child.family_profile_id
    WHERE authorized_child.id = ${nativeChildId}
      AND child_activation.group_id = ${actor.familyGroupId}::uuid
      AND ${profileAccessCondition(actor.userId, "dia-de-estrela", sql`authorized_child.family_profile_id`, action)}
      ${actor.kind === "child" ? sql`AND authorized_child.id = ${actor.childId}::uuid` : sql``}
      ${actor.kind !== "adult" ? sql`AND ${deviceChildCondition(actor.userId, sql`${actor.deviceId}::uuid`, sql`authorized_child.id`)}` : sql``}
      ${actor.kind === "pin" ? sql`AND ${pinCondition(actor)}` : sql``}
  )`;
}

/** Group → device → native children in a stable order; never trust a pre-lock permission. */
export async function lockChildAccess(
  tx: FamilyTransaction,
  actor: EstrelaAuthority,
  childIds: readonly string[],
  action: FamilyAction = "write",
) {
  const ids = [...new Set(childIds)];
  assertAllowed(ids.length > 0 && ids.length <= 100, "CHILD", "Escolha as crianças.");
  const children = await tx
    .select({ id: estrelaChildren.id, activationId: estrelaChildren.familyProfileId })
    .from(estrelaChildren)
    .where(
      and(
        inArray(estrelaChildren.id, ids),
        childAccessCondition(actor, estrelaChildren.id, action),
      ),
    );
  const activationIds = children.flatMap((child) =>
    child.activationId ? [child.activationId] : [],
  );
  assertAllowed(activationIds.length === ids.length, "CHILD", "Criança não disponível.");
  await lockProfilesAccess(tx, actor.userId, "dia-de-estrela", activationIds, action);
  if (action === "write")
    await lockProfilesAccess(tx, actor.userId, "dia-de-estrela", activationIds, "read");
  if (actor.kind !== "adult") {
    const [device] = await tx
      .select({ id: estrelaDevices.id })
      .from(estrelaDevices)
      .where(
        and(
          eq(estrelaDevices.id, actor.deviceId),
          eq(estrelaDevices.userId, actor.userId),
          eq(estrelaDevices.familyGroupId, actor.familyGroupId),
        ),
      )
      .for("update");
    assertAllowed(device, "DEVICE", "A conexão deste aparelho foi encerrada.");
  }
  for (const child of children.sort((a, b) => a.id.localeCompare(b.id))) {
    assertAllowed(child.activationId, "CHILD", "Criança não disponível.");
    const [current] = await tx
      .select({ id: estrelaChildren.id })
      .from(estrelaChildren)
      .where(
        and(
          eq(estrelaChildren.id, child.id),
          eq(estrelaChildren.familyProfileId, child.activationId),
          childAccessCondition(actor, estrelaChildren.id, action),
        ),
      )
      .for("update");
    assertAllowed(current, "CHILD", "Criança não disponível.");
  }
  const current = await tx
    .select({ id: estrelaChildren.id })
    .from(estrelaChildren)
    .where(
      and(
        inArray(estrelaChildren.id, ids),
        childAccessCondition(actor, estrelaChildren.id, action),
      ),
    );
  assertAllowed(current.length === ids.length, "CHILD", "Criança não disponível.");
}
