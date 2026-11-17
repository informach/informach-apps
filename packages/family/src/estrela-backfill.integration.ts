import { randomUUID } from "node:crypto";
import { and, eq, sql } from "@informach/db";
import * as schema from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { delegatedProfileAccessCondition } from "./delegation";
import { withHistoricalDatabase } from "./testing/historical-database";

describe("Historical Dia de Estrela cutover", () => {
  it("preserves identities, history, PIN and valid credentials without restoring withdrawn capabilities", async () => {
    await withHistoricalDatabase(async ({ db, connection, migrateTo }) => {
      const owner = randomUUID();
      const guest = randomUUID();
      const live = randomUUID();
      const archived = randomUUID();
      const deviceId = randomUUID();
      const retiredDevice = randomUUID();
      const taskId = randomUUID();
      const codeId = randomUUID();
      const rewardId = randomUUID();
      const completionId = randomUUID();
      const redemptionId = randomUUID();
      const tokenHash = randomUUID();
      const codeHash = randomUUID();
      const expiresAt = new Date(Date.now() + 3_600_000);
      for (const id of [owner, guest])
        await connection`insert into core.users(id, name, email, email_verified)
          values (${id}, 'Adult', ${`${id}@example.test`}, true)`;
      await connection`insert into dia_de_estrela.families(user_id, pin_hash, stars_per_real, onboarded_at)
        values (${owner}, 'historical-scrypt-hash', 17, now())`;
      await connection`insert into dia_de_estrela.guardians(owner_user_id, user_id) values (${owner}, ${guest})`;
      await connection`insert into dia_de_estrela.guardian_invitations(owner_user_id, email, token_hash, expires_at)
        values (${owner}, 'pending@example.test', ${randomUUID()}, now() + interval '1 hour')`;
      for (const [position, id] of [live, archived].entries())
        await connection`insert into dia_de_estrela.children(id, user_id, name, color, position)
          values (${id}, ${owner}, 'Same name', '#123456', ${position})`;
      for (const id of [deviceId, retiredDevice])
        await connection`insert into dia_de_estrela.devices(id, user_id, token_hash, label, expires_at)
          values (${id}, ${owner}, ${id === deviceId ? tokenHash : randomUUID()}, 'Historical tablet', ${expiresAt.toISOString()}::timestamptz)`;
      for (const childId of [live, archived])
        await connection`insert into dia_de_estrela.device_children(device_id, child_id) values (${deviceId}, ${childId})`;
      await connection`insert into dia_de_estrela.device_children(device_id, child_id) values (${retiredDevice}, ${archived})`;
      await connection`insert into dia_de_estrela.pairing_codes(id, device_id, code_hash, expires_at)
        values (${codeId}, ${deviceId}, ${codeHash}, ${expiresAt.toISOString()}::timestamptz)`;
      await connection`insert into dia_de_estrela.tasks(id, child_id, title, icon, time, days, stars)
        values (${taskId}, ${archived}, 'Preserved task', 'star', '08:00', 127, 3)`;
      await connection`insert into dia_de_estrela.task_voices(task_id, mime, data, duration_ms)
        values (${taskId}, 'audio/webm', ${Buffer.from([1, 2, 3])}, 500)`;
      await connection`insert into dia_de_estrela.completions(id, child_id, task_id, date, marked_by, status, stars)
        values (${completionId}, ${archived}, ${taskId}, '2026-11-01', 'adult', 'approved', 3)`;
      await connection`insert into dia_de_estrela.ledger(child_id, kind, stars, label, source_key)
        values (${archived}, 'task', 3, 'Preserved task', ${`task:${completionId}`})`;
      await connection`insert into dia_de_estrela.rewards(id, user_id, kind, name, icon, price_stars)
        values (${rewardId}, ${owner}, 'custom', 'Shared reward', 'star', 2)`;
      await connection`insert into dia_de_estrela.redemptions(id, child_id, reward_id, label, kind, stars, status)
        values (${redemptionId}, ${archived}, ${rewardId}, 'Shared reward', 'custom', 2, 'delivered')`;
      await connection`insert into dia_de_estrela.goals(child_id, name, stars, photo, photo_mime)
        values (${archived}, 'Preserved goal', 10, ${Buffer.from([4, 5, 6])}, 'image/png')`;
      await migrateTo(114);
      const activations = await db
        .select()
        .from(schema.familyAppProfiles)
        .where(eq(schema.familyAppProfiles.app, "dia-de-estrela"));
      const active = activations.find((row) => row.sourceKey === live);
      const inactive = activations.find((row) => row.sourceKey === archived);
      if (!active || !inactive) throw new Error("Missing canonical origin");
      expect(active.personId).not.toBe(inactive.personId);
      await db
        .update(schema.familyPeople)
        .set({ archivedAt: new Date() })
        .where(eq(schema.familyPeople.id, inactive.personId));
      await migrateTo();
      const [family] = await db
        .select()
        .from(schema.estrelaFamilies)
        .where(eq(schema.estrelaFamilies.familyGroupId, active.groupId));
      expect(family).toMatchObject({
        pinHash: "historical-scrypt-hash",
        starsPerReal: 17,
        userId: owner,
      });
      const [device] = await db
        .select()
        .from(schema.estrelaDevices)
        .where(eq(schema.estrelaDevices.id, deviceId));
      expect(device).toMatchObject({
        tokenHash,
        expiresAt,
        connectedAt: null,
        revokedAt: null,
        familyGroupId: active.groupId,
      });
      const [code] = await db
        .select()
        .from(schema.estrelaPairingCodes)
        .where(eq(schema.estrelaPairingCodes.id, codeId));
      expect(code).toMatchObject({ codeHash, expiresAt, consumedAt: null });
      const claims = await db
        .select()
        .from(schema.estrelaDeviceChildren)
        .where(eq(schema.estrelaDeviceChildren.deviceId, deviceId));
      expect(claims).toHaveLength(1);
      expect(claims[0]).toMatchObject({ childId: live, delegationKey: active.delegationKey });
      const [retired] = await db
        .select()
        .from(schema.estrelaDevices)
        .where(eq(schema.estrelaDevices.id, retiredDevice));
      expect(retired?.revokedAt).toBeInstanceOf(Date);
      const guestGrants = await db
        .select({ action: schema.familyAccessGrants.action })
        .from(schema.familyAccessGrants)
        .where(
          and(
            eq(schema.familyAccessGrants.profileId, active.id),
            eq(schema.familyAccessGrants.userId, guest),
          ),
        );
      expect(guestGrants.map((g) => g.action).sort()).toEqual(["read", "write"]);
      const [child] = await db
        .select()
        .from(schema.estrelaChildren)
        .where(eq(schema.estrelaChildren.id, archived));
      expect(child).toMatchObject({ familyProfileId: inactive.id, position: 1 });
      expect(child).not.toHaveProperty("name");
      const [identity] = await db
        .select()
        .from(schema.familyPeople)
        .where(eq(schema.familyPeople.id, inactive.personId));
      expect(identity).toMatchObject({ displayName: "Same name", color: "#123456" });
      expect(
        await db
          .select()
          .from(schema.estrelaCompletions)
          .where(eq(schema.estrelaCompletions.id, completionId)),
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(schema.estrelaRedemptions)
          .where(eq(schema.estrelaRedemptions.id, redemptionId)),
      ).toHaveLength(1);
      expect(
        (
          await db
            .select()
            .from(schema.estrelaTaskVoices)
            .where(eq(schema.estrelaTaskVoices.taskId, taskId))
        )[0]?.data,
      ).toEqual(Buffer.from([1, 2, 3]));
      expect(
        (
          await db
            .select()
            .from(schema.estrelaGoals)
            .where(eq(schema.estrelaGoals.childId, archived))
        )[0]?.photo,
      ).toEqual(Buffer.from([4, 5, 6]));
      expect(
        (
          await db
            .select()
            .from(schema.estrelaLedger)
            .where(eq(schema.estrelaLedger.childId, archived))
        )[0]?.stars,
      ).toBe(3);
      expect(
        (
          await db
            .select()
            .from(schema.estrelaRewards)
            .where(eq(schema.estrelaRewards.id, rewardId))
        )[0]?.familyGroupId,
      ).toBe(active.groupId);
      const [tables] =
        await connection`select to_regclass('dia_de_estrela.guardians') as guardians, to_regclass('dia_de_estrela.guardian_invitations') as invitations`;
      expect(tables).toMatchObject({ guardians: null, invitations: null });
      const claimed = claims[0];
      if (!claimed) throw new Error("Missing device claim");
      const authorized = () =>
        db
          .select({ id: schema.familyAppProfiles.id })
          .from(schema.familyAppProfiles)
          .where(
            and(
              eq(schema.familyAppProfiles.id, active.id),
              delegatedProfileAccessCondition(sql`${owner}`, "dia-de-estrela", {
                profileId: sql`${active.id}::uuid`,
                groupId: sql`${active.groupId}::uuid`,
                delegationKey: sql`${claimed.delegationKey}::uuid`,
                readGrantId: sql`${claimed.readGrantId}::uuid`,
                writeGrantId: sql`${claimed.writeGrantId}::uuid`,
              }),
            ),
          );
      expect(await authorized()).toHaveLength(1);
      await db
        .delete(schema.familyAccessGrants)
        .where(eq(schema.familyAccessGrants.id, claimed.writeGrantId));
      await db
        .insert(schema.familyAccessGrants)
        .values({ groupId: active.groupId, profileId: active.id, userId: owner, action: "write" });
      await migrateTo();
      expect(await authorized()).toHaveLength(0);
      expect(
        await db
          .select()
          .from(schema.estrelaDeviceChildren)
          .where(eq(schema.estrelaDeviceChildren.deviceId, deviceId)),
      ).toEqual(claims);
    });
  }, 60_000);

  it("aborts conflicting household provenance atomically and permits repair before retry", async () => {
    await withHistoricalDatabase(async ({ db, connection, migrateTo }) => {
      const owner = randomUUID();
      const childId = randomUUID();
      await connection`insert into core.users(id, name, email, email_verified) values (${owner}, 'Adult', ${`${owner}@example.test`}, true)`;
      await connection`insert into dia_de_estrela.families(user_id) values (${owner})`;
      await connection`insert into dia_de_estrela.children(id, user_id, name, color) values (${childId}, ${owner}, 'Child', '#123456')`;
      await migrateTo(114);
      const [origin] = await db
        .select()
        .from(schema.familyMigrationSources)
        .where(
          and(
            eq(schema.familyMigrationSources.app, "dia-de-estrela"),
            eq(schema.familyMigrationSources.sourceOwnerId, owner),
          ),
        );
      if (!origin) throw new Error("Missing origin");
      const [other] = await db
        .insert(schema.familyGroups)
        .values({ name: "Unrelated household" })
        .returning();
      if (!other) throw new Error("Missing other group");
      await connection`update dia_de_estrela.families set family_group_id = ${other.id} where user_id = ${owner}`;
      const before =
        await connection`select count(*)::int as count from drizzle.__drizzle_migrations`;
      await expect(migrateTo()).rejects.toThrow();
      expect(
        await connection`select count(*)::int as count from drizzle.__drizzle_migrations`,
      ).toEqual(before);
      expect(
        (await connection`select name from dia_de_estrela.children where id = ${childId}`)[0]?.name,
      ).toBe("Child");
      await connection`update dia_de_estrela.families set family_group_id = ${origin.groupId} where user_id = ${owner}`;
      await migrateTo();
      expect(
        await db
          .select()
          .from(schema.estrelaChildren)
          .where(eq(schema.estrelaChildren.id, childId)),
      ).toHaveLength(1);
    });
  }, 60_000);
});
