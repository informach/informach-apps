import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "@informach/db";
import * as schema from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { withHistoricalDatabase } from "./testing/historical-database";

describe("Historical study devices at the Compasso cutover", () => {
  it("preserves active credentials, withdraws archived access and never recreates a deleted grant on replay", async () => {
    await withHistoricalDatabase(async ({ db, connection, migrateTo }) => {
      const owner = randomUUID();
      const live = randomUUID();
      const archived = randomUUID();
      const deviceId = randomUUID();
      const codeId = randomUUID();
      const tokenHash = createHash("sha256").update(randomUUID()).digest("hex");
      const codeHash = createHash("sha256").update(randomUUID()).digest("hex");
      const expiresAt = new Date(Date.now() + 3_600_000);
      await connection`insert into core.users(id, name, email, email_verified)
        values (${owner}, 'Adult', ${`${owner}@example.test`}, true)`;
      await connection`insert into missao_saber.families(user_id, consent_version) values (${owner}, 'fixture-v1')`;
      for (const id of [live, archived])
        await connection`insert into missao_saber.profiles(id, user_id, nickname, grade, course_id)
          values (${id}, ${owner}, 'Same name', 6, 'fixture')`;
      await connection`insert into missao_saber.study_devices(id, user_id, token_hash, label, remember, expires_at)
        values (${deviceId}, ${owner}, ${tokenHash}, 'Historical tablet', true, ${expiresAt.toISOString()}::timestamptz)`;
      await connection`insert into missao_saber.study_codes(id, device_id, code_hash, expires_at)
        values (${codeId}, ${deviceId}, ${codeHash}, ${expiresAt.toISOString()}::timestamptz)`;
      for (const id of [live, archived])
        await connection`insert into missao_saber.study_device_profiles(device_id, profile_id)
          values (${deviceId}, ${id})`;
      await migrateTo(100);
      const origins = await db
        .select()
        .from(schema.missaoProfiles)
        .where(eq(schema.missaoProfiles.userId, owner));
      const activeId = origins.find((row) => row.id === live)?.familyProfileId;
      const archivedId = origins.find((row) => row.id === archived)?.familyProfileId;
      if (!activeId || !archivedId) throw new Error("Missing canonical fixture");
      const [activation] = await db
        .select()
        .from(schema.familyAppProfiles)
        .where(eq(schema.familyAppProfiles.id, activeId));
      if (!activation) throw new Error("Missing canonical activation");
      await db
        .update(schema.familyAppProfiles)
        .set({ archivedAt: new Date() })
        .where(eq(schema.familyAppProfiles.id, archivedId));
      await migrateTo();
      const [device] = await db
        .select()
        .from(schema.missaoStudyDevices)
        .where(eq(schema.missaoStudyDevices.id, deviceId));
      expect(device).toMatchObject({
        id: deviceId,
        tokenHash,
        expiresAt,
        remember: true,
        familyGroupId: activation.groupId,
        revokedAt: null,
        connectedAt: null,
      });
      const [code] = await db
        .select()
        .from(schema.missaoStudyCodes)
        .where(eq(schema.missaoStudyCodes.id, codeId));
      expect(code).toMatchObject({ id: codeId, codeHash, expiresAt, consumedAt: null });
      const grants = await db
        .select()
        .from(schema.missaoStudyDeviceProfiles)
        .where(eq(schema.missaoStudyDeviceProfiles.deviceId, deviceId));
      expect(grants).toHaveLength(1);
      expect(grants[0]).toMatchObject({ profileId: live, delegationKey: activation.delegationKey });
      // Withdrawing operational access must not remove even an archived student's domain row.
      expect(
        await db.select().from(schema.missaoProfiles).where(eq(schema.missaoProfiles.id, archived)),
      ).toHaveLength(1);
      await db
        .delete(schema.familyAccessGrants)
        .where(
          and(
            eq(schema.familyAccessGrants.profileId, activeId),
            eq(schema.familyAccessGrants.action, "write"),
          ),
        );
      await db.insert(schema.familyAccessGrants).values({
        profileId: activeId,
        groupId: activation.groupId,
        userId: owner,
        action: "write",
      });
      await migrateTo();
      expect(
        await db
          .select()
          .from(schema.missaoStudyDeviceProfiles)
          .where(eq(schema.missaoStudyDeviceProfiles.deviceId, deviceId)),
      ).toEqual([]);
    });
  }, 60_000);

  it("aborts an active device with conflicting profile provenance before contracting any row", async () => {
    await withHistoricalDatabase(async ({ db, connection, migrateTo }) => {
      const owner = randomUUID();
      const profileId = randomUUID();
      const deviceId = randomUUID();
      await connection`insert into core.users(id, name, email, email_verified)
        values (${owner}, 'Adult', ${`${owner}@example.test`}, true)`;
      await connection`insert into missao_saber.families(user_id, consent_version) values (${owner}, 'fixture-v1')`;
      await connection`insert into missao_saber.profiles(id, user_id, nickname, grade, course_id)
        values (${profileId}, ${owner}, 'Student', 6, 'fixture')`;
      await connection`insert into missao_saber.study_devices(id, user_id, token_hash, label, expires_at)
        values (${deviceId}, ${owner}, ${randomUUID()}, 'Historical tablet', now() + interval '1 hour')`;
      await connection`insert into missao_saber.study_device_profiles(device_id, profile_id) values (${deviceId}, ${profileId})`;
      await migrateTo(101);
      const [profile] = await db
        .select()
        .from(schema.missaoProfiles)
        .where(eq(schema.missaoProfiles.id, profileId));
      if (!profile?.familyProfileId) throw new Error("Missing migration provenance");
      await db
        .update(schema.familyAppProfiles)
        .set({ sourceKey: randomUUID() })
        .where(eq(schema.familyAppProfiles.id, profile.familyProfileId));
      await expect(migrateTo()).rejects.toThrow();
      const [unchanged] =
        await connection`select family_group_id from missao_saber.study_devices where id = ${deviceId}`;
      expect(unchanged?.family_group_id).toBeNull();
      await db
        .update(schema.familyAppProfiles)
        .set({ sourceKey: profileId })
        .where(eq(schema.familyAppProfiles.id, profile.familyProfileId));
      await migrateTo();
      expect(
        await db
          .select()
          .from(schema.missaoStudyDeviceProfiles)
          .where(eq(schema.missaoStudyDeviceProfiles.deviceId, deviceId)),
      ).toHaveLength(1);
    });
  }, 60_000);
});
