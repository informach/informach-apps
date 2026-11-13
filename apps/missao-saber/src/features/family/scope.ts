import "server-only";
import { currentWebParticipationCondition } from "@informach/auth/web-participation";
import { and, eq, inArray, type SQLWrapper, sql } from "@informach/db";
import {
  familyAppProfiles,
  missaoProfiles,
  missaoStudyDeviceProfiles,
  missaoStudyDevices,
} from "@informach/db/schema";
import type { FamilyAction, FamilyTransaction } from "@informach/family";
import { profileAccessCondition } from "@informach/family/access";
import { lockProfilesAccess } from "@informach/family/context";
import { delegatedProfileAccessCondition } from "@informach/family/delegation";
import { assertAllowed } from "@/lib/errors";
import type { LearningAuthority } from "./authority";

/** Includes both the child's device capability and the issuer's current permissions. */
export function studyDeviceProfileCondition(
  userId: string,
  deviceId: SQLWrapper,
  nativeProfileId: SQLWrapper,
  connected = true,
) {
  return sql`EXISTS (
    SELECT 1 FROM ${missaoStudyDevices} study_device
    JOIN ${missaoStudyDeviceProfiles} study_grant ON study_grant.device_id = study_device.id
    JOIN ${missaoProfiles} study_profile ON study_profile.id = study_grant.profile_id
    WHERE study_device.id = ${deviceId} AND study_device.user_id = ${userId}
      AND study_profile.id = ${nativeProfileId} AND study_device.revoked_at IS NULL
      AND study_device.expires_at > statement_timestamp()
      AND ${currentWebParticipationCondition(userId, sql`study_device.web_participation_revision`)}
      ${connected ? sql`AND study_device.connected_at IS NOT NULL` : sql``}
      AND ${delegatedProfileAccessCondition(userId, "missao-saber", {
        profileId: sql`study_profile.family_profile_id`,
        groupId: sql`study_device.family_group_id`,
        delegationKey: sql`study_grant.delegation_key`,
        readGrantId: sql`study_grant.read_grant_id`,
        writeGrantId: sql`study_grant.write_grant_id`,
      })}
  )`;
}

export function studentAccessCondition(
  actor: LearningAuthority,
  nativeProfileId: SQLWrapper,
  action: FamilyAction = "read",
) {
  // A device never inherits identity management or paid AI permissions from its issuer.
  if (actor.kind === "study" && (action === "manage" || action === "use_ai")) return sql`false`;
  return sql`EXISTS (
    SELECT 1 FROM ${missaoProfiles} student
    JOIN ${familyAppProfiles} activation ON activation.id = student.family_profile_id
    WHERE student.id = ${nativeProfileId} AND activation.group_id = ${actor.familyGroupId}::uuid
      AND ${profileAccessCondition(actor.userId, "missao-saber", sql`student.family_profile_id`, action)}
      ${
        actor.kind === "study"
          ? sql`AND student.id = ${actor.profileId}::uuid
        AND ${studyDeviceProfileCondition(actor.userId, sql`${actor.deviceId}::uuid`, sql`student.id`)}`
          : sql``
      }
  )`;
}

/** Group → device (when present) → native profile; recheck after every wait. */
export async function lockStudentAccess(
  tx: FamilyTransaction,
  actor: LearningAuthority,
  nativeProfileIds: readonly string[],
  action: FamilyAction = "write",
) {
  const ids = [...new Set(nativeProfileIds)];
  assertAllowed(ids.length > 0 && ids.length <= 100, "PROFILE", "Escolha os estudantes.");
  const profiles = await tx
    .select({ id: missaoProfiles.id, activationId: missaoProfiles.familyProfileId })
    .from(missaoProfiles)
    .where(
      and(
        inArray(missaoProfiles.id, ids),
        studentAccessCondition(actor, missaoProfiles.id, action),
      ),
    );
  const activationIds = profiles.flatMap((profile) =>
    profile.activationId ? [profile.activationId] : [],
  );
  assertAllowed(activationIds.length === ids.length, "PROFILE", "Estudante não disponível.");
  await lockProfilesAccess(tx, actor.userId, "missao-saber", activationIds, action);
  if (action === "write")
    await lockProfilesAccess(tx, actor.userId, "missao-saber", activationIds, "read");
  if (actor.kind === "study") {
    const [device] = await tx
      .select({ id: missaoStudyDevices.id })
      .from(missaoStudyDevices)
      .where(
        and(
          eq(missaoStudyDevices.id, actor.deviceId),
          eq(missaoStudyDevices.userId, actor.userId),
          eq(missaoStudyDevices.familyGroupId, actor.familyGroupId),
        ),
      )
      .for("update");
    assertAllowed(device, "STUDY_AUTH", "Conexão de estudo encerrada.");
  }
  for (const profile of profiles.sort((a, b) => a.id.localeCompare(b.id))) {
    assertAllowed(profile.activationId, "PROFILE", "Estudante não disponível.");
    const [current] = await tx
      .select({ id: missaoProfiles.id })
      .from(missaoProfiles)
      .where(
        and(
          eq(missaoProfiles.id, profile.id),
          eq(missaoProfiles.familyProfileId, profile.activationId),
          studentAccessCondition(actor, missaoProfiles.id, action),
        ),
      )
      .for("update");
    assertAllowed(current, "PROFILE", "Estudante não disponível.");
  }
  // Row-lock predicates may have been evaluated before a wait. A fresh statement
  // also catches natural expiry or an issuer ban while acquiring those locks.
  const current = await tx
    .select({ id: missaoProfiles.id })
    .from(missaoProfiles)
    .where(
      and(
        inArray(missaoProfiles.id, ids),
        studentAccessCondition(actor, missaoProfiles.id, action),
      ),
    );
  assertAllowed(current.length === ids.length, "PROFILE", "Estudante não disponível.");
}
