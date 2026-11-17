import { createHash, randomUUID } from "node:crypto";
import type { WebClosureAuthority } from "@informach/account/closure";
import { freezeWebParticipation } from "@informach/auth/web-participation";
import { db, eq } from "@informach/db";
import {
  boraChallenges,
  boraCustomWorkouts,
  boraFamilies,
  boraProfiles,
  boraSessions,
  boraTrialClaims,
  familyAppProfiles,
  familyPeople,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { beforeAll, expect, it } from "vitest";
import { executeBoraClosure, prepareBoraClosure } from "@/features/account/closure-repository";

beforeAll(() => {
  if (
    process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
    !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "").hostname)
  )
    throw new Error("Disposable PostgreSQL required");
});
const family = createFamilyService({ db });
async function actor() {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, email: `${id}@example.test`, name: "Closure fixture", emailVerified: true });
  await db.insert(boraFamilies).values({ userId: id, reminderDays: 3, weeklySummary: true });
  return id;
}
async function fixture() {
  const owner = await actor();
  const group = await family.createGroup(owner, "Training closure");
  const child = await childProfile(owner, group.id);
  return { owner, group, child };
}
async function childProfile(owner: string, groupId: string) {
  const child = await family.createPerson(owner, {
    groupId,
    kind: "dependent",
    displayName: "PRIVATE_CHILD",
  });
  const target = { groupId, personId: child.id, app: "bora-treinar" };
  const activation = await family.activateProfile(owner, target, async (tx, familyProfileId) => {
    const [profile] = await tx
      .insert(boraProfiles)
      .values({ familyProfileId, userId: owner })
      .returning({ id: boraProfiles.id });
    if (!profile) throw new Error("Native profile missing");
    await tx.insert(boraSessions).values({
      id: randomUUID(),
      userId: owner,
      profileId: profile.id,
      workoutRef: "catalogo:fixture",
      workoutName: "PRIVATE_WORKOUT",
      startedAt: new Date(),
      durationSeconds: 60,
      mode: "manual",
    });
    return profile.id;
  });
  return { child, target, activation };
}
async function freeze(actorId: string): Promise<WebClosureAuthority> {
  const operationId = randomUUID();
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId: actorId, operationId, expectedRevision: 0 }),
  );
  return { actorId, operationId, frozenRevision: 1 };
}
const customWorkout = (userId: string) => ({
  userId,
  name: "PRIVATE_CUSTOM",
  level: "iniciante",
  focus: "corpo",
  blocks: [],
});
const prepare = (authority: WebClosureAuthority) =>
  db.transaction((tx) => prepareBoraClosure(tx, authority));

it("erases personal preferences and exclusive profile history while retaining shared training and the trial receipt", async () => {
  const f = await fixture(),
    guest = await actor();
  await family.acceptInvitation(
    guest,
    (await family.createInvitation(f.owner, f.group.id, `${guest}@example.test`)).token,
  );
  const shared = await childProfile(f.owner, f.group.id);
  await family.grantAccess(f.owner, { ...shared.target, userId: guest, action: "manage" });
  await db.insert(boraCustomWorkouts).values(customWorkout(f.owner));
  const emailHash = createHash("sha256").update(f.owner).digest("hex");
  await db.insert(boraTrialClaims).values({ emailHash, userId: f.owner });
  await db.insert(boraChallenges).values({
    familyGroupId: f.group.id,
    userId: f.owner,
    weekStart: "2026-11-09",
    metric: "treinos",
    target: 3,
  });
  const authority = await freeze(f.owner),
    plan = await prepare(authority);
  expect(plan).toMatchObject({ personalRecords: 3, sharedRecords: 2, blockers: [] });
  expect(JSON.stringify(plan)).not.toContain("PRIVATE");
  await db.transaction((tx) => executeBoraClosure(tx, { ...authority, phase: "erase", plan }));
  expect(await db.select().from(boraFamilies).where(eq(boraFamilies.userId, f.owner))).toEqual([]);
  expect(
    await db.select().from(boraCustomWorkouts).where(eq(boraCustomWorkouts.userId, f.owner)),
  ).toEqual([]);
  expect(
    await db.select().from(boraProfiles).where(eq(boraProfiles.id, f.child.activation.value)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(boraSessions)
      .where(eq(boraSessions.profileId, f.child.activation.value)),
  ).toEqual([]);
  expect(
    await db.select().from(boraProfiles).where(eq(boraProfiles.id, shared.activation.value)),
  ).toHaveLength(1);
  expect(
    await db.select().from(boraSessions).where(eq(boraSessions.profileId, shared.activation.value)),
  ).toHaveLength(1);
  expect(
    await db.select().from(boraChallenges).where(eq(boraChallenges.familyGroupId, f.group.id)),
  ).toHaveLength(1);
  expect(await db.select().from(boraFamilies).where(eq(boraFamilies.userId, guest))).toHaveLength(
    1,
  );
  expect(
    await db.select().from(boraTrialClaims).where(eq(boraTrialClaims.emailHash, emailHash)),
  ).toHaveLength(1);
  expect(
    await db.select().from(familyPeople).where(eq(familyPeople.id, f.child.child.id)),
  ).toHaveLength(1);
});

it("removes group-owned challenges only in an exclusive family, including archived native history", async () => {
  const f = await fixture();
  await family.archivePerson(f.owner, f.group.id, f.child.child.id);
  await db.insert(boraChallenges).values({
    familyGroupId: f.group.id,
    userId: f.owner,
    weekStart: "2026-11-09",
    metric: "treinos",
    target: 3,
  });
  const authority = await freeze(f.owner),
    plan = await prepare(authority);
  expect(plan).toMatchObject({ personalRecords: 3, sharedRecords: 0, blockers: [] });
  await db.transaction((tx) => executeBoraClosure(tx, { ...authority, phase: "erase", plan }));
  expect(
    await db.select().from(boraChallenges).where(eq(boraChallenges.familyGroupId, f.group.id)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(familyAppProfiles)
      .where(eq(familyAppProfiles.id, f.child.activation.profileId)),
  ).toEqual([]);
});

it("refuses to leave shared history with only a reader and does not partially erase preferences", async () => {
  const f = await fixture(),
    guest = await actor();
  await family.acceptInvitation(
    guest,
    (await family.createInvitation(f.owner, f.group.id, `${guest}@example.test`)).token,
  );
  await family.grantAccess(f.owner, { ...f.child.target, userId: guest, action: "read" });
  const authority = await freeze(f.owner),
    plan = await prepare(authority);
  expect(plan.blockers).toEqual(["responsibilities"]);
  await expect(
    db.transaction((tx) => executeBoraClosure(tx, { ...authority, phase: "erase", plan })),
  ).rejects.toMatchObject({ code: "stale-plan" });
  expect(await db.select().from(boraFamilies).where(eq(boraFamilies.userId, f.owner))).toHaveLength(
    1,
  );
  expect(
    await db
      .select()
      .from(boraSessions)
      .where(eq(boraSessions.profileId, f.child.activation.value)),
  ).toHaveLength(1);
});

it("rejects a changed selection or operation and preserves all training on resumption", async () => {
  const f = await fixture();
  const authority = await freeze(f.owner),
    plan = await prepare(authority);
  await db.insert(boraCustomWorkouts).values(customWorkout(f.owner));
  await expect(
    db.transaction((tx) => executeBoraClosure(tx, { ...authority, phase: "erase", plan })),
  ).rejects.toMatchObject({ code: "stale-plan" });
  await expect(prepare({ ...authority, operationId: randomUUID() })).rejects.toMatchObject({
    code: "stale-revision",
  });
  await db.transaction((tx) =>
    executeBoraClosure(tx, { ...authority, phase: "resume", plan: null }),
  );
  expect(await db.select().from(boraFamilies).where(eq(boraFamilies.userId, f.owner))).toHaveLength(
    1,
  );
  expect(
    await db.select().from(boraCustomWorkouts).where(eq(boraCustomWorkouts.userId, f.owner)),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(boraSessions)
      .where(eq(boraSessions.profileId, f.child.activation.value)),
  ).toHaveLength(1);
});
