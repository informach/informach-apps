import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { beginWebClosure, confirmWebClosure, readWebClosure } from "@informach/account/closure";
import { beginDepartureReview, readDepartureReview } from "@informach/account/departure-reviews";
import { openCompassoAccount } from "@informach/billing/collection-accounts";
import { getCollectionApps } from "@informach/config/collections";
import { and, db, eq } from "@informach/db";
import {
  accountWebClosureConsents,
  accountWebClosureSteps,
  accountWebClosures,
  agendaStudentProfiles,
  agendaTasks,
  boraProfiles,
  boraSessions,
  collectionAccounts,
  cozyaRecipes,
  estrelaChildren,
  estrelaTasks,
  estrelaTaskVoices,
  familyAppProfiles,
  familyMembers,
  familyPeople,
  missaoNotes,
  missaoProfiles,
  missaoSessions,
  sessions,
  users,
  webParticipations,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, test } from "@playwright/test";
import { z } from "zod";

const stage = z
  .enum(["seed", "review", "begin", "prepare", "confirm", "billing", "erase", "finalize", "verify"])
  .parse(process.env.COMPASSO_CLOSURE_STAGE);
const file = resolve(process.env.COMPASSO_CLOSURE_FIXTURE ?? "");
if (
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "").hostname) ||
  basename(file) !== "closure-system.json" ||
  !basename(dirname(file)).startsWith("compasso-integration-")
)
  throw new Error("Owned, local closure fixture required");

const nativeApps = ["agenda-da-turma", "bora-treinar", "missao-saber", "dia-de-estrela"] as const;
const subjectSchema = z.object({
  actorId: z.uuid(),
  groupId: z.uuid(),
  personId: z.uuid(),
  profiles: z.array(z.object({ app: z.enum(nativeApps), id: z.uuid() })).length(4),
});
const fixtureSchema = z.object({
  owner: subjectSchema,
  other: subjectSchema,
  otherDigest: z.string().length(64),
  accountId: z.uuid(),
  reviewId: z.uuid(),
  sessionId: z.uuid(),
  independentSessionId: z.uuid(),
  operationId: z.uuid().optional(),
});
type Subject = z.infer<typeof subjectSchema>;
type Fixture = z.infer<typeof fixtureSchema>;
const family = createFamilyService({ db });

async function session(actorId: string, originApp: "conta" | null) {
  const id = randomUUID();
  await db.insert(sessions).values({
    id,
    userId: actorId,
    token: randomUUID(),
    originApp,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  return id;
}
async function subject(): Promise<Subject> {
  const actorId = randomUUID();
  await db.insert(users).values({
    id: actorId,
    name: "System closure adult",
    email: `${actorId}@example.test`,
    emailVerified: true,
  });
  const group = await family.createGroup(actorId, "System closure family");
  const person = await family.createPerson(actorId, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Same display name",
  });
  const profiles: Subject["profiles"] = [];
  for (const app of nativeApps) {
    const id = randomUUID();
    await family.activateProfile(
      actorId,
      { groupId: group.id, personId: person.id, app },
      async (tx, familyProfileId) => {
        switch (app) {
          case "agenda-da-turma":
            await tx.insert(agendaStudentProfiles).values({ id, familyProfileId });
            await tx.insert(agendaTasks).values({
              profileId: id,
              createdByUserId: actorId,
              title: "PRIVATE_TASK",
              type: "task",
              fingerprint: randomUUID(),
            });
            break;
          case "bora-treinar":
            await tx.insert(boraProfiles).values({ id, familyProfileId, userId: actorId });
            await tx.insert(boraSessions).values({
              id: randomUUID(),
              profileId: id,
              userId: actorId,
              workoutRef: "catalogo:fixture",
              workoutName: "PRIVATE_WORKOUT",
              startedAt: new Date(),
              durationSeconds: 60,
              mode: "manual",
            });
            break;
          case "missao-saber":
            await tx
              .insert(missaoProfiles)
              .values({ id, familyProfileId, userId: actorId, grade: 6, courseId: "olitef-n1" });
            await tx.insert(missaoSessions).values({
              profileId: id,
              lessonId: "fixture-lesson",
              version: 1,
              mode: "mission",
              snapshot: { private: "PRIVATE_STUDY" },
              requestKey: randomUUID(),
            });
            await tx.insert(missaoNotes).values({ profileId: id, text: "PRIVATE_NOTE" });
            break;
          case "dia-de-estrela": {
            await tx.insert(estrelaChildren).values({ id, familyProfileId, userId: actorId });
            const taskId = randomUUID();
            await tx.insert(estrelaTasks).values({
              id: taskId,
              childId: id,
              title: "PRIVATE_ROUTINE",
              icon: "star",
              time: "08:00",
              days: 127,
              stars: 3,
            });
            await tx.insert(estrelaTaskVoices).values({
              taskId,
              mime: "audio/webm",
              data: Buffer.from("PRIVATE_VOICE"),
              durationMs: 100,
            });
            break;
          }
        }
        return id;
      },
    );
    profiles.push({ app, id });
  }
  await db.insert(cozyaRecipes).values({
    userId: actorId,
    name: "PRIVATE_RECIPE",
    ingredients: "PRIVATE_INGREDIENTS",
    preparation: "PRIVATE_PREPARATION",
  });
  return { actorId, groupId: group.id, personId: person.id, profiles };
}
function nativeId(actor: Subject, app: Subject["profiles"][number]["app"]) {
  const native = actor.profiles.find((entry) => entry.app === app);
  if (!native) throw new Error("Missing system native profile");
  return native.id;
}
async function content(actor: Subject) {
  const agenda = nativeId(actor, "agenda-da-turma"),
    bora = nativeId(actor, "bora-treinar"),
    missao = nativeId(actor, "missao-saber"),
    estrela = nativeId(actor, "dia-de-estrela");
  // Every row has a stable order; the digest also detects changes to retained content.
  const values = await Promise.all([
    db.select().from(familyPeople).where(eq(familyPeople.id, actor.personId)),
    db
      .select()
      .from(familyAppProfiles)
      .where(eq(familyAppProfiles.personId, actor.personId))
      .orderBy(familyAppProfiles.id),
    db.select().from(agendaStudentProfiles).where(eq(agendaStudentProfiles.id, agenda)),
    db.select().from(agendaTasks).where(eq(agendaTasks.profileId, agenda)).orderBy(agendaTasks.id),
    db.select().from(boraProfiles).where(eq(boraProfiles.id, bora)),
    db.select().from(boraSessions).where(eq(boraSessions.profileId, bora)).orderBy(boraSessions.id),
    db.select().from(missaoProfiles).where(eq(missaoProfiles.id, missao)),
    db
      .select()
      .from(missaoSessions)
      .where(eq(missaoSessions.profileId, missao))
      .orderBy(missaoSessions.id),
    db.select().from(missaoNotes).where(eq(missaoNotes.profileId, missao)).orderBy(missaoNotes.id),
    db.select().from(estrelaChildren).where(eq(estrelaChildren.id, estrela)),
    db
      .select()
      .from(estrelaTasks)
      .where(eq(estrelaTasks.childId, estrela))
      .orderBy(estrelaTasks.id),
    db
      .select()
      .from(estrelaTaskVoices)
      .innerJoin(estrelaTasks, eq(estrelaTasks.id, estrelaTaskVoices.taskId))
      .where(eq(estrelaTasks.childId, estrela))
      .orderBy(estrelaTaskVoices.taskId),
    db
      .select()
      .from(cozyaRecipes)
      .where(eq(cozyaRecipes.userId, actor.actorId))
      .orderBy(cozyaRecipes.id),
  ]);
  return {
    rows: values.flat(),
    digest: createHash("sha256").update(JSON.stringify(values)).digest("hex"),
  };
}
async function save(fixture: Fixture, initial = false) {
  await writeFile(file, JSON.stringify(fixtureSchema.parse(fixture)), {
    flag: initial ? "wx" : "w",
  });
}

test(`real closure ${stage} through ${process.env.COMPASSO_TEST_APP}`, async ({ request }) => {
  if (stage === "seed") {
    const owner = await subject(),
      other = await subject();
    const account = await openCompassoAccount(db, owner.actorId, owner.groupId);
    await save(
      {
        owner,
        other,
        otherDigest: (await content(other)).digest,
        accountId: account.id,
        reviewId: await beginDepartureReview(db, owner.actorId),
        sessionId: await session(owner.actorId, "conta"),
        independentSessionId: await session(owner.actorId, null),
      },
      true,
    );
    return;
  }
  const f = fixtureSchema.parse(JSON.parse(await readFile(file, "utf8")));
  if (stage === "begin") {
    expect((await readDepartureReview(db, f.owner.actorId, f.reviewId)).complete).toBe(true);
    f.operationId = await beginWebClosure(
      db,
      { actorId: f.owner.actorId, sessionId: f.sessionId },
      f.reviewId,
    );
    expect(await db.select().from(sessions).where(eq(sessions.id, f.sessionId))).toHaveLength(0);
    f.sessionId = await session(f.owner.actorId, "conta");
    await save(f);
  } else if (stage === "confirm") {
    if (!f.operationId) throw new Error("Missing closure operation");
    // Explicit new login for the test's confirmation, just like the UI journey.
    f.sessionId = await session(f.owner.actorId, "conta");
    const actor = { actorId: f.owner.actorId, sessionId: f.sessionId };
    const prepared = await readWebClosure(db, actor, f.operationId);
    expect(prepared.state).toBe("ready");
    expect(prepared.digest).toBeTruthy();
    expect((await content(f.owner)).rows.length).toBeGreaterThan(10);
    if (!prepared.digest) throw new Error("Missing real preparation digest");
    await confirmWebClosure(db, actor, f.operationId, prepared.digest);
    await save(f);
  } else if (stage === "verify") {
    if (!f.operationId) throw new Error("Missing closure operation");
    expect(
      (
        await db.select().from(accountWebClosures).where(eq(accountWebClosures.id, f.operationId))
      )[0]?.state,
    ).toBe("completed");
    const receipts = await db
      .select()
      .from(accountWebClosureSteps)
      .where(
        and(
          eq(accountWebClosureSteps.closureId, f.operationId),
          eq(accountWebClosureSteps.phase, "erase"),
        ),
      );
    expect(receipts).toHaveLength(getCollectionApps("compasso").length + 2);
    expect(receipts.every((step) => step.state === "done")).toBe(true);
    expect(
      await db
        .select()
        .from(accountWebClosureConsents)
        .where(eq(accountWebClosureConsents.closureId, f.operationId)),
    ).toHaveLength(1);
    expect((await content(f.owner)).rows).toHaveLength(0);
    expect(
      (await db.select().from(collectionAccounts).where(eq(collectionAccounts.id, f.accountId)))[0]
        ?.closedAt,
    ).not.toBeNull();
    expect(
      (
        await db
          .select()
          .from(familyMembers)
          .where(
            and(
              eq(familyMembers.groupId, f.owner.groupId),
              eq(familyMembers.userId, f.owner.actorId),
            ),
          )
      )[0]?.revokedAt,
    ).not.toBeNull();
    expect(
      (
        await db
          .select()
          .from(webParticipations)
          .where(eq(webParticipations.userId, f.owner.actorId))
      )[0]?.state,
    ).toBe("closed");
    expect(await db.select().from(users).where(eq(users.id, f.owner.actorId))).toHaveLength(1);
  } else {
    const central = process.env.COMPASSO_TEST_APP === "conta";
    const path = central ? "/api/jobs/account-maintenance" : "/api/jobs/account-departure";
    expect((await request.post(path)).status()).toBe(401);
    const send = () =>
      request.post(path, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        data: { actorId: f.other.actorId, app: "untrusted-domain" },
      });
    const response = await send();
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ failed: 0, discarded: 0 });
    expect(result.completed).toBe(central && (stage === "prepare" || stage === "finalize") ? 2 : 1);
    const repeated = await send();
    expect(repeated.status()).toBe(200);
    expect(await repeated.json()).toMatchObject({ completed: 0, failed: 0, discarded: 0 });
    if (stage === "erase")
      expect(
        await db.select().from(familyPeople).where(eq(familyPeople.id, f.owner.personId)),
      ).toHaveLength(1);
  }
  expect((await content(f.other)).digest).toBe(f.otherDigest);
  expect(
    await db.select().from(sessions).where(eq(sessions.id, f.independentSessionId)),
  ).toHaveLength(1);
});
