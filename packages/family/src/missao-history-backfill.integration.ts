import { randomUUID } from "node:crypto";
import { eq } from "@informach/db";
import {
  familyAppProfiles,
  missaoCompetitions,
  missaoCompetitors,
  missaoFamilies,
  missaoFamilyChallenges,
  missaoProfiles,
  users,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { withHistoricalDatabase } from "./testing/historical-database";

describe("Historical Missão family and school history", () => {
  it("keeps native IDs, challenges, participants and results when legacy app preferences are removed, while global custody remains protected", async () => {
    await withHistoricalDatabase(async ({ db, connection, migrateTo }) => {
      const owner = randomUUID(),
        profileId = randomUUID(),
        competitionId = randomUUID(),
        participantId = randomUUID();
      await connection`insert into core.users(id,name,email,email_verified) values (${owner}, 'Adult', ${`${owner}@example.test`}, true)`;
      await connection`insert into missao_saber.families(user_id,consent_version) values (${owner}, 'fixture')`;
      await connection`insert into missao_saber.profiles(id,user_id,nickname,grade,course_id) values (${profileId},${owner},'Estudante',6,'olitef-n1')`;
      await connection`insert into missao_saber.family_challenges(user_id,week_start,goal) values (${owner},'2026-11-09',8)`;
      await connection`insert into missao_saber.competitions(id,user_id,title,area,problem_count,challenge_count,problem_seconds,challenge_seconds,seed,request_key,status)
        values (${competitionId},${owner},'Encontro','matematica',1,0,90,300,42,${randomUUID()},'finished')`;
      await connection`insert into missao_saber.competitors(id,competition_id,profile_id,seat,nickname,avatar,grade,level,band)
        values (${participantId},${competitionId},${profileId},0,'Nome no encontro','lua',6,'Nível histórico','c')`;
      await migrateTo();
      const [profile] = await db
        .select()
        .from(missaoProfiles)
        .where(eq(missaoProfiles.id, profileId));
      if (!profile?.familyProfileId) throw new Error("Missing canonical profile");
      const [activation] = await db
        .select()
        .from(familyAppProfiles)
        .where(eq(familyAppProfiles.id, profile.familyProfileId));
      if (!activation) throw new Error("Missing activation");
      expect(activation.sourceKey).toBe(profileId);
      expect(
        await db
          .select()
          .from(missaoFamilyChallenges)
          .where(eq(missaoFamilyChallenges.familyGroupId, activation.groupId)),
      ).toMatchObject([{ goal: 8, weekStart: "2026-11-09" }]);
      expect(
        await db.select().from(missaoCompetitions).where(eq(missaoCompetitions.id, competitionId)),
      ).toMatchObject([{ familyGroupId: activation.groupId, seed: 42, status: "finished" }]);
      await expect(db.delete(users).where(eq(users.id, owner))).rejects.toThrow();
      await db.delete(missaoFamilies).where(eq(missaoFamilies.userId, owner));
      expect(
        await db.select().from(missaoProfiles).where(eq(missaoProfiles.id, profileId)),
      ).toMatchObject([{ id: profileId, userId: owner }]);
      expect(
        await db.select().from(missaoCompetitions).where(eq(missaoCompetitions.id, competitionId)),
      ).toMatchObject([{ id: competitionId, userId: owner }]);
      expect(
        await db.select().from(missaoCompetitors).where(eq(missaoCompetitors.id, participantId)),
      ).toMatchObject([{ profileId, nickname: "Nome no encontro", avatar: "lua", grade: 6 }]);
      expect(
        await db
          .select()
          .from(missaoFamilyChallenges)
          .where(eq(missaoFamilyChallenges.familyGroupId, activation.groupId)),
      ).toMatchObject([{ userId: owner, goal: 8 }]);
      await migrateTo();
    });
  }, 60000);
  it("rolls back a competition with cross-family participant provenance until its recorded origin is repaired", async () => {
    await withHistoricalDatabase(async ({ db, connection, migrateTo }) => {
      const owner = randomUUID(),
        other = randomUUID(),
        ownProfile = randomUUID(),
        foreignProfile = randomUUID(),
        competitionId = randomUUID(),
        participantId = randomUUID();
      for (const [userId, profileId] of [
        [owner, ownProfile],
        [other, foreignProfile],
      ] as const) {
        await connection`insert into core.users(id,name,email,email_verified) values (${userId},'Adult',${`${userId}@example.test`},true)`;
        await connection`insert into missao_saber.families(user_id,consent_version) values (${userId},'fixture')`;
        await connection`insert into missao_saber.profiles(id,user_id,nickname,grade,course_id) values (${profileId},${userId},'Same name',6,'olitef-n1')`;
      }
      await connection`insert into missao_saber.competitions(id,user_id,title,area,problem_count,challenge_count,problem_seconds,challenge_seconds,seed,request_key)
        values (${competitionId},${owner},'Encontro','matematica',1,0,90,300,42,${randomUUID()})`;
      await connection`insert into missao_saber.competitors(id,competition_id,profile_id,seat,nickname,avatar,grade,level,band)
        values (${participantId},${competitionId},${foreignProfile},0,'Same name','lua',6,'Nível','c')`;
      await migrateTo(109);
      await expect(migrateTo()).rejects.toThrow();
      const [unresolved] =
        await connection`select family_group_id from missao_saber.competitions where id=${competitionId}`;
      expect(unresolved?.family_group_id).toBeNull();
      await db
        .update(missaoCompetitors)
        .set({ profileId: ownProfile })
        .where(eq(missaoCompetitors.id, participantId));
      await migrateTo();
      expect(
        (
          await db.select().from(missaoCompetitions).where(eq(missaoCompetitions.id, competitionId))
        )[0]?.familyGroupId,
      ).toBeTruthy();
    });
  }, 60000);
});
