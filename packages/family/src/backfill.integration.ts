import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createFamilyService } from "./index";

import { withHistoricalDatabase } from "./testing/historical-database";

const migration = await readFile(
  new URL("../../db/src/migrations/0082_compasso_identity_backfill.sql", import.meta.url),
  "utf8",
);
const statements = migration.split("--> statement-breakpoint");
async function backfill(tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) {
  for (const statement of statements) await tx.execute(sql.raw(statement));
}
// Fields that existed at migration 0081; later authorization metadata is added by the final upgrade.
const historicalProfileFields = {
  id: schema.familyAppProfiles.id,
  groupId: schema.familyAppProfiles.groupId,
  personId: schema.familyAppProfiles.personId,
  app: schema.familyAppProfiles.app,
  sourceKey: schema.familyAppProfiles.sourceKey,
  archivedAt: schema.familyAppProfiles.archivedAt,
  createdAt: schema.familyAppProfiles.createdAt,
};

describe("Compasso historical identity migration", () => {
  it(
    "preserves all four app IDs and domain data, distinguishes homonyms and carries exact child grants",
    async () =>
      withHistoricalDatabase(async ({ db, connection, migrateTo }) => {
        const family = createFamilyService({ db });
        const owner = `migration-owner-${randomUUID()}`;
        const agendaGuest = `migration-agenda-${randomUUID()}`;
        const estrelaGuest = `migration-estrela-${randomUUID()}`;
        for (const id of [owner, agendaGuest, estrelaGuest])
          await connection`insert into core.users(id, name, email, email_verified) values (${id}, 'Adult', ${`${id}@example.test`}, true)`;
        await db.insert(schema.boraFamilies).values({ userId: owner });
        await db
          .insert(schema.missaoFamilies)
          .values({ userId: owner, consentVersion: "fixture-v1" });
        await connection`insert into dia_de_estrela.families(user_id) values (${owner})`;
        const [agenda] = await connection<{ id: string; birthDate: string }[]>`
          insert into agenda.student_profiles(user_id,name,birth_date) values (${owner},'Clara','2016-02-02')
          returning id,birth_date::text as "birthDate"`;
        const [other] = await connection<{ id: string }[]>`
          insert into agenda.student_profiles(user_id,name) values (${owner},'Clara') returning id`;
        const [bora] = await connection<{ id: string; userId: string; weeklyGoal: number }[]>`
      insert into bora_treinar.profiles(user_id, name, color, weekly_goal)
      values (${owner}, 'Clara', '#123456', 5)
      returning id, user_id as "userId", weekly_goal as "weeklyGoal"`;
        if (!bora) throw new Error("Missing historical training profile");
        const sessionId = randomUUID();
        await connection`insert into bora_treinar.sessions(id, user_id, profile_id, workout_ref, workout_name, started_at, duration_seconds, mode)
      values (${sessionId}, ${owner}, ${bora.id}, 'catalogo:fixture', 'Treino preservado', now(), 90, 'manual')`;
        await connection`insert into bora_treinar.challenges(user_id, profile_id, week_start, metric, target)
      values (${owner}, ${bora.id}, '2026-11-09', 'treinos', 3), (${owner}, null, '2026-11-09', 'treinos', 5)`;
        const [missao] = await connection<{ id: string }[]>`
          insert into missao_saber.profiles(user_id,nickname,grade,grade_year,course_id,avatar)
          values (${owner},'Clara',6,2026,'fixture','cometa') returning id`;
        const [estrela] = await connection<
          { id: string; name: string; color: string; position: number }[]
        >`insert into dia_de_estrela.children(user_id,name,color,position) values (${owner}, 'Clara', '#654321', 2) returning id,name,color,position`;
        if (!agenda || !other || !bora || !missao || !estrela)
          throw new Error("Missing migration fixtures");
        const [membership] = await connection<{ id: string }[]>`
          insert into agenda.family_members(owner_user_id,user_id) values (${owner},${agendaGuest}) returning id`;
        if (!membership) throw new Error("Missing migration member");
        await connection`insert into agenda.family_profile_access(member_id,profile_id) values (${membership.id},${agenda.id})`;
        await connection`insert into dia_de_estrela.guardians(owner_user_id,user_id) values (${owner}, ${estrelaGuest})`;
        await migrateTo(82);
        const origins = await db
          .select()
          .from(schema.familyMigrationSources)
          .where(eq(schema.familyMigrationSources.sourceOwnerId, owner));
        expect(origins).toHaveLength(4);
        const groupId = origins[0]?.groupId;
        if (!groupId) throw new Error("Missing migrated group");
        expect(new Set(origins.map((row) => row.groupId)).size).toBe(1);
        const profiles = await db
          .select(historicalProfileFields)
          .from(schema.familyAppProfiles)
          .where(eq(schema.familyAppProfiles.groupId, groupId));
        expect(profiles).toHaveLength(5);
        expect(new Set(profiles.map((row) => row.personId)).size).toBe(5);
        const find = (app: string, localId: string) => {
          const profile = profiles.find((row) => row.app === app && row.sourceKey === localId);
          if (!profile) throw new Error("Missing source mapping");
          return profile;
        };
        const [agendaAfter] = await db
          .select()
          .from(schema.agendaStudentProfiles)
          .where(eq(schema.agendaStudentProfiles.id, agenda.id));
        const [boraAfter] = await db
          .select()
          .from(schema.boraProfiles)
          .where(eq(schema.boraProfiles.id, bora.id));
        const [missaoAfter] = await db
          .select()
          .from(schema.missaoProfiles)
          .where(eq(schema.missaoProfiles.id, missao.id));
        const [estrelaAfter] = await db
          .select()
          .from(schema.estrelaChildren)
          .where(eq(schema.estrelaChildren.id, estrela.id));
        expect(agendaAfter).toMatchObject({
          ...agenda,
          familyProfileId: find("agenda-da-turma", agenda.id).id,
        });
        expect(boraAfter).toMatchObject({
          ...bora,
          familyProfileId: find("bora-treinar", bora.id).id,
        });
        expect(missaoAfter).toMatchObject({
          id: missao.id,
          userId: owner,
          grade: 6,
          gradeYear: 2026,
          courseId: "fixture",
          familyProfileId: find("missao-saber", missao.id).id,
        });
        // Verify the historical migration using its own columns. Current runtime
        // authorization requires the complete schema, checked after migrateTo().
        const historicalPeople = await db
          .select({
            id: schema.familyPeople.id,
            kind: schema.familyPeople.kind,
            displayName: schema.familyPeople.displayName,
            color: schema.familyPeople.color,
            avatar: schema.familyPeople.avatar,
          })
          .from(schema.familyPeople);
        expect(
          historicalPeople.find((person) => person.id === find("missao-saber", missao.id).personId),
        ).toMatchObject({ displayName: "Clara", avatar: "cometa" });
        expect(estrelaAfter).toMatchObject({
          id: estrela.id,
          userId: owner,
          position: 2,
          familyProfileId: find("dia-de-estrela", estrela.id).id,
        });
        expect(
          historicalPeople.find((p) => p.id === find("dia-de-estrela", estrela.id).personId),
        ).toMatchObject({ displayName: "Clara", color: "#654321" });
        const boraIdentity = historicalPeople.find(
          (p) => p.id === find("bora-treinar", bora.id).personId,
        );
        expect(boraIdentity).toMatchObject({
          kind: "unclassified",
          displayName: "Clara",
          color: "#123456",
        });
        for (const profile of profiles) {
          const readers = await db
            .select({ userId: schema.familyAccessGrants.userId })
            .from(schema.familyAccessGrants)
            .where(
              and(
                eq(schema.familyAccessGrants.profileId, profile.id),
                eq(schema.familyAccessGrants.action, "read"),
              ),
            );
          const expected = [owner];
          if (profile.app === "agenda-da-turma" && profile.sourceKey === agenda.id)
            expected.push(agendaGuest);
          if (profile.app === "dia-de-estrela") expected.push(estrelaGuest);
          expect(readers.map((row) => row.userId).sort()).toEqual(expected.sort());
        }
        await db
          .delete(schema.familyAccessGrants)
          .where(
            and(
              eq(schema.familyAccessGrants.profileId, find("agenda-da-turma", agenda.id).id),
              eq(schema.familyAccessGrants.userId, agendaGuest),
              eq(schema.familyAccessGrants.action, "read"),
            ),
          );
        await db.transaction(backfill);
        const replayProfiles = await db
          .select(historicalProfileFields)
          .from(schema.familyAppProfiles)
          .where(eq(schema.familyAppProfiles.groupId, groupId));
        expect(replayProfiles).toEqual(profiles);
        const restored = await db
          .select({ profileId: schema.familyAccessGrants.profileId })
          .from(schema.familyAccessGrants)
          .where(
            and(
              eq(schema.familyAccessGrants.profileId, find("agenda-da-turma", agenda.id).id),
              eq(schema.familyAccessGrants.userId, agendaGuest),
              eq(schema.familyAccessGrants.action, "read"),
            ),
          );
        expect(restored).toHaveLength(0);
        await migrateTo();
        await migrateTo(); // The real journal skips applied DML after the destructive contract.
        for (const profile of profiles) {
          const target = {
            groupId,
            personId: profile.personId,
            app: profile.app,
            action: "read" as const,
          };
          await expect(family.assertPersonAccess(owner, target)).resolves.toEqual({
            id: profile.id,
          });
          await expect(family.assertPersonAccess(agendaGuest, target)).rejects.toMatchObject({
            code: "ACCESS_DENIED",
          });
          if (profile.app === "dia-de-estrela")
            await expect(family.assertPersonAccess(estrelaGuest, target)).resolves.toEqual({
              id: profile.id,
            });
          else
            await expect(family.assertPersonAccess(estrelaGuest, target)).rejects.toMatchObject({
              code: "ACCESS_DENIED",
            });
        }
        const [contract] = await connection<{ nullable: string; identity_columns: number }[]>`
      select is_nullable as nullable, (select count(*)::int from information_schema.columns
        where table_schema = 'bora_treinar' and table_name = 'profiles' and column_name in ('name', 'color')) as identity_columns
      from information_schema.columns where table_schema = 'bora_treinar'
        and table_name = 'profiles' and column_name = 'family_profile_id'`;
        expect(contract).toEqual({ nullable: "NO", identity_columns: 0 });
        expect(
          await db.select().from(schema.boraProfiles).where(eq(schema.boraProfiles.id, bora.id)),
        ).toMatchObject([{ ...bora, familyProfileId: find("bora-treinar", bora.id).id }]);
        expect(
          await db.select().from(schema.boraSessions).where(eq(schema.boraSessions.id, sessionId)),
        ).toMatchObject([
          { profileId: bora.id, workoutName: "Treino preservado", durationSeconds: 90 },
        ]);
        expect(
          await db
            .select()
            .from(schema.boraChallenges)
            .where(eq(schema.boraChallenges.familyGroupId, groupId)),
        ).toHaveLength(2);
        await expect(
          family.assertPersonAccess(agendaGuest, {
            groupId,
            personId: find("agenda-da-turma", agenda.id).personId,
            app: "agenda-da-turma",
            action: "read",
          }),
        ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
        // Removing the creator's app preferences cannot cascade into shared history.
        await db.delete(schema.boraFamilies).where(eq(schema.boraFamilies.userId, owner));
        expect(
          await db.select().from(schema.boraSessions).where(eq(schema.boraSessions.id, sessionId)),
        ).toHaveLength(1);
      }),
    60000,
  );

  it(
    "rolls back every new identity when an invalid historical value fails a constraint",
    async () =>
      withHistoricalDatabase(async ({ db, connection, migrateTo }) => {
        const owner = `invalid-migration-${randomUUID()}`;
        await connection`insert into core.users(id, name, email, email_verified) values (${owner}, 'Adult', ${`${owner}@example.test`}, true)`;
        const [profile] = await connection<{ id: string; name: string; family_profile_id: null }[]>`
          insert into agenda.student_profiles(user_id,name) values (${owner},${"x".repeat(81)})
          returning id,name,family_profile_id`;
        if (!profile) throw new Error("Missing invalid fixture");
        await expect(migrateTo(82)).rejects.toThrow();
        const origins = await db
          .select()
          .from(schema.familyMigrationSources)
          .where(eq(schema.familyMigrationSources.sourceOwnerId, owner));
        expect(origins).toHaveLength(0);
        const [preserved] =
          await connection`select id,name,family_profile_id from agenda.student_profiles where id=${profile.id}`;
        expect(preserved).toEqual(profile);
        await db
          .delete(schema.agendaStudentProfiles)
          .where(eq(schema.agendaStudentProfiles.id, profile.id));
        await migrateTo();
      }),
    60000,
  );
});
