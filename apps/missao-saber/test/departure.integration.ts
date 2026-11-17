import { randomUUID } from "node:crypto";
import {
  beginDepartureReview,
  cancelDepartureReview,
  readDepartureReview,
} from "@informach/account/departure-reviews";
import { db, eq } from "@informach/db";
import { missaoProfiles, missaoStudyDevices, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, it } from "vitest";
import { POST } from "@/app/api/jobs/account-departure/route";
import { assessMissaoDeparture } from "@/features/account/departure-repository";
import { env } from "@/lib/env";

const family = createFamilyService({ db });
async function actor() {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, name: "Pessoa de avaliação", email: `${id}@example.test`, emailVerified: true });
  return id;
}

it("assesses canonical responsibility and shared history without erasing or inferring authority from membership", async () => {
  const owner = await actor();
  const guest = await actor();
  const group = await family.createGroup(owner, "Contexto de avaliação");
  const invite = await family.createInvitation(owner, group.id, `${guest}@example.test`);
  await family.acceptInvitation(guest, invite.token);
  const person = await family.createPerson(owner, {
    groupId: group.id,
    kind: "dependent",
    displayName: "PRIVATE_PERSON_NAME",
  });
  const scope = { groupId: group.id, personId: person.id, app: "missao-saber" };
  await family.activateProfile(owner, scope, async (tx, familyProfileId) => {
    const [native] = await tx
      .insert(missaoProfiles)
      .values({ familyProfileId, userId: owner, grade: 5, courseId: "obmep" })
      .returning({ id: missaoProfiles.id });
    if (!native) throw new Error("Missing native profile");
    return native.id;
  });
  const before = await db.select().from(missaoProfiles);
  expect(await assessMissaoDeparture(owner)).toMatchObject({
    managedProfiles: 1,
    sharedProfiles: 0,
    hasSharedData: true,
  });
  expect((await assessMissaoDeparture(guest)).managedProfiles).toBe(0);
  await family.grantAccess(owner, { ...scope, userId: guest, action: "read" });
  expect((await assessMissaoDeparture(owner)).sharedProfiles).toBe(1);
  expect((await assessMissaoDeparture(guest)).managedProfiles).toBe(0);
  await family.grantAccess(owner, { ...scope, userId: guest, action: "manage" });
  expect((await assessMissaoDeparture(guest)).managedProfiles).toBe(1);
  await family.revokeMember(owner, group.id, guest);
  expect((await assessMissaoDeparture(guest)).managedProfiles).toBe(0);
  expect((await assessMissaoDeparture(owner)).sharedProfiles).toBe(0);
  expect(await db.select().from(missaoProfiles)).toEqual(before);

  const reviewId = await beginDepartureReview(db, owner);
  try {
    expect(
      (await POST(new Request("http://localhost/api/jobs/account-departure", { method: "POST" })))
        .status,
    ).toBe(401);
    const result = await POST(
      new Request("http://localhost/api/jobs/account-departure", {
        method: "POST",
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
        body: JSON.stringify({ app: "cozya", actorId: guest }),
      }),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      completed: 1,
      failed: 0,
      discarded: 0,
      closuresCompleted: 0,
      assessmentsCompleted: 1,
    });
    const review = await readDepartureReview(db, owner, reviewId);
    expect(review.complete).toBe(false);
    expect(review.apps.find((row) => row.app === "missao-saber")?.result?.managedProfiles).toBe(1);
    expect(
      review.apps
        .filter((row) => row.app !== "missao-saber")
        .every((row) => row.state === "queued"),
    ).toBe(true);
    expect(JSON.stringify(review)).not.toContain("PRIVATE_PERSON_NAME");
  } finally {
    await cancelDepartureReview(db, owner, reviewId);
  }
});

it("detects the adult's own local settings or credentials without exposing them to another actor", async () => {
  const owner = await actor();
  const other = await actor();
  const group = await family.createGroup(owner, "Contexto privado");
  await db.insert(missaoStudyDevices).values({
    userId: owner,
    familyGroupId: group.id,
    tokenHash: "PRIVATE_STUDY_TOKEN",
    label: "PRIVATE_STUDY_LABEL",
    expiresAt: new Date(Date.now() + 60000),
  });
  const assessment = await assessMissaoDeparture(owner);
  expect(assessment.hasPersonalData).toBe(true);
  expect(assessment.activeCredentials).toBe(1);
  expect(JSON.stringify(assessment)).not.toContain("PRIVATE");
  expect((await assessMissaoDeparture(other)).hasPersonalData).toBe(false);
  expect((await assessMissaoDeparture(other)).activeCredentials).toBe(0);
  const [identity] = await db.select().from(users).where(eq(users.id, owner));
  expect(identity?.banned).toBe(false);
});
