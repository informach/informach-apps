import { randomUUID } from "node:crypto";
import type { WebClosureAuthority } from "@informach/account/closure";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { db, eq, sql } from "@informach/db";
import {
  estrelaChildren,
  estrelaDevices,
  estrelaFamilies,
  estrelaGoals,
  estrelaLedger,
  estrelaNotificationDeliveries,
  estrelaPairingCodes,
  estrelaPushSubscriptions,
  estrelaRedemptions,
  estrelaRewards,
  estrelaTasks,
  estrelaTaskVoices,
  familyAppProfiles,
  familyPeople,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, it } from "vitest";
import {
  executeEstrelaClosure,
  prepareEstrelaClosure,
} from "@/features/account/closure-repository";
import {
  claimDelivery,
  finishDelivery,
  savePushSubscription,
} from "@/features/lembretes/repository";

const family = createFamilyService({ db });
async function actor() {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, email: `${id}@example.test`, name: "Closure fixture", emailVerified: true });
  return id;
}
async function child(owner: string, groupId: string) {
  const person = await family.createPerson(owner, {
    groupId,
    kind: "dependent",
    displayName: "PRIVATE_CHILD",
  });
  const target = { groupId, personId: person.id, app: "dia-de-estrela" };
  const activation = await family.activateProfile(owner, target, async (tx, familyProfileId) => {
    const [native] = await tx
      .insert(estrelaChildren)
      .values({ familyProfileId, userId: owner })
      .returning();
    if (!native) throw new Error("Missing child");
    const [task] = await tx
      .insert(estrelaTasks)
      .values({
        childId: native.id,
        title: "PRIVATE_TASK",
        icon: "star",
        time: "08:00",
        days: 127,
        stars: 3,
      })
      .returning();
    if (!task) throw new Error("Missing task");
    await tx.insert(estrelaTaskVoices).values({
      taskId: task.id,
      mime: "audio/webm",
      data: Buffer.from("PRIVATE_VOICE"),
      durationMs: 100,
    });
    await tx.insert(estrelaGoals).values({
      childId: native.id,
      name: "PRIVATE_GOAL",
      stars: 10,
      photo: Buffer.from("PRIVATE_PHOTO"),
      photoMime: "image/png",
    });
    await tx.insert(estrelaLedger).values({
      childId: native.id,
      kind: "bonus",
      stars: 10,
      label: "PRIVATE_STARS",
      sourceKey: randomUUID(),
    });
    await tx
      .insert(estrelaRedemptions)
      .values({ childId: native.id, label: "PRIVATE_REQUEST", kind: "custom", stars: 2 });
    return { childId: native.id, taskId: task.id };
  });
  return { person, target, activation };
}
async function credentials(userId: string, groupId: string) {
  const [device] = await db
    .insert(estrelaDevices)
    .values({
      userId,
      familyGroupId: groupId,
      tokenHash: randomUUID(),
      label: "Fixture tablet",
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  if (!device) throw new Error("Missing device");
  await db.insert(estrelaPairingCodes).values({
    deviceId: device.id,
    codeHash: randomUUID(),
    expiresAt: new Date(Date.now() + 600_000),
  });
  await savePushSubscription(userId, {
    endpoint: `https://example.test/${randomUUID()}`,
    p256dh: "fixture",
    auth: "fixture",
  });
  const [subscription] = await db
    .select()
    .from(estrelaPushSubscriptions)
    .where(eq(estrelaPushSubscriptions.userId, userId));
  if (!subscription) throw new Error("Missing push subscription");
  return { device, subscription };
}
async function fixture() {
  const owner = await actor();
  const group = await family.createGroup(owner, "Closure home");
  await db.insert(estrelaFamilies).values({ familyGroupId: group.id, userId: owner });
  await db.insert(estrelaRewards).values({
    familyGroupId: group.id,
    userId: owner,
    kind: "custom",
    name: "PRIVATE_REWARD",
    icon: "star",
    priceStars: 10,
  });
  return {
    owner,
    group,
    child: await child(owner, group.id),
    credentials: await credentials(owner, group.id),
  };
}
async function freeze(actorId: string): Promise<WebClosureAuthority> {
  const operationId = randomUUID();
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId: actorId, operationId, expectedRevision: 0 }),
  );
  return { actorId, operationId, frozenRevision: 1 };
}
const prepare = (authority: WebClosureAuthority) =>
  db.transaction((tx) => prepareEstrelaClosure(tx, authority));

it("erases an archived exclusive child's full history and issuer credentials, keeping shared children and group settings", async () => {
  const f = await fixture(),
    guest = await actor();
  await family.acceptInvitation(
    guest,
    (await family.createInvitation(f.owner, f.group.id, `${guest}@example.test`)).token,
  );
  const shared = await child(f.owner, f.group.id);
  await family.grantAccess(f.owner, { ...shared.target, userId: guest, action: "manage" });
  const otherCredentials = await credentials(guest, f.group.id);
  await family.archivePerson(f.owner, f.group.id, f.child.person.id);
  const authority = await freeze(f.owner),
    plan = await prepare(authority);
  expect(plan).toMatchObject({
    personalRecords: 1,
    sharedRecords: 3,
    credentials: 2,
    blockers: [],
  });
  expect(JSON.stringify(plan)).not.toContain("PRIVATE");
  await db.transaction((tx) => executeEstrelaClosure(tx, { ...authority, phase: "erase", plan }));
  expect(
    await db
      .select()
      .from(estrelaChildren)
      .where(eq(estrelaChildren.id, f.child.activation.value.childId)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(estrelaTaskVoices)
      .where(eq(estrelaTaskVoices.taskId, f.child.activation.value.taskId)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(estrelaGoals)
      .where(eq(estrelaGoals.childId, f.child.activation.value.childId)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(estrelaLedger)
      .where(eq(estrelaLedger.childId, f.child.activation.value.childId)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(estrelaRedemptions)
      .where(eq(estrelaRedemptions.childId, f.child.activation.value.childId)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(familyAppProfiles)
      .where(eq(familyAppProfiles.id, f.child.activation.profileId)),
  ).toEqual([]);
  expect(await db.select().from(estrelaDevices).where(eq(estrelaDevices.userId, f.owner))).toEqual(
    [],
  );
  expect(
    await db
      .select()
      .from(estrelaPairingCodes)
      .where(eq(estrelaPairingCodes.deviceId, f.credentials.device.id)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(estrelaPushSubscriptions)
      .where(eq(estrelaPushSubscriptions.userId, f.owner)),
  ).toEqual([]);
  expect(
    await db.select().from(estrelaDevices).where(eq(estrelaDevices.id, otherCredentials.device.id)),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(estrelaPushSubscriptions)
      .where(eq(estrelaPushSubscriptions.userId, guest)),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(estrelaTaskVoices)
      .where(eq(estrelaTaskVoices.taskId, shared.activation.value.taskId)),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(estrelaLedger)
      .where(eq(estrelaLedger.childId, shared.activation.value.childId)),
  ).toHaveLength(1);
  expect(
    await db.select().from(estrelaFamilies).where(eq(estrelaFamilies.familyGroupId, f.group.id)),
  ).toHaveLength(1);
  expect(
    await db.select().from(estrelaRewards).where(eq(estrelaRewards.familyGroupId, f.group.id)),
  ).toHaveLength(1);
  expect(
    await db.select().from(familyPeople).where(eq(familyPeople.id, f.child.person.id)),
  ).toHaveLength(1);
});

it("removes household settings and rewards only for an exclusive group", async () => {
  const f = await fixture(),
    authority = await freeze(f.owner),
    plan = await prepare(authority);
  expect(plan).toMatchObject({ personalRecords: 3, sharedRecords: 0, blockers: [] });
  await db.transaction((tx) => executeEstrelaClosure(tx, { ...authority, phase: "erase", plan }));
  expect(
    await db.select().from(estrelaFamilies).where(eq(estrelaFamilies.familyGroupId, f.group.id)),
  ).toEqual([]);
  expect(
    await db.select().from(estrelaRewards).where(eq(estrelaRewards.familyGroupId, f.group.id)),
  ).toEqual([]);
});

it("blocks an in-flight push, then resumes without losing history or reviving old credentials and claims", async () => {
  const f = await fixture();
  const claim = await claimDelivery(f.owner, "pending", f.credentials.subscription.id);
  if (!claim) throw new Error("Missing delivery");
  const authority = await freeze(f.owner);
  expect((await prepare(authority)).blockers).toContain("pending_operations");
  await expect(
    db.transaction((tx) =>
      executeEstrelaClosure(tx, { ...authority, phase: "resume", plan: null }),
    ),
  ).rejects.toMatchObject({ code: "not-ready" });
  expect(
    await db.select().from(estrelaDevices).where(eq(estrelaDevices.userId, f.owner)),
  ).toHaveLength(1);
  await db
    .update(estrelaNotificationDeliveries)
    .set({ lastAttemptAt: sql`clock_timestamp() - interval '61 seconds'` })
    .where(eq(estrelaNotificationDeliveries.id, claim.id));
  await db.transaction((tx) =>
    executeEstrelaClosure(tx, { ...authority, phase: "resume", plan: null }),
  );
  await finishDelivery(claim, "sent");
  expect(
    (
      await db
        .select()
        .from(estrelaNotificationDeliveries)
        .where(eq(estrelaNotificationDeliveries.id, claim.id))
    )[0]?.status,
  ).toBe("failed");
  expect(
    await db
      .select()
      .from(estrelaLedger)
      .where(eq(estrelaLedger.childId, f.child.activation.value.childId)),
  ).toHaveLength(1);
  expect(
    await db.select().from(estrelaFamilies).where(eq(estrelaFamilies.familyGroupId, f.group.id)),
  ).toHaveLength(1);
  await db.transaction((tx) =>
    resumeWebParticipation(tx, {
      userId: f.owner,
      operationId: authority.operationId,
      expectedRevision: 1,
    }),
  );
  expect(await claimDelivery(f.owner, "late", f.credentials.subscription.id)).toBeNull();
  const fresh = await credentials(f.owner, f.group.id);
  await expect(
    db.transaction((tx) =>
      executeEstrelaClosure(tx, { ...authority, phase: "resume", plan: null }),
    ),
  ).rejects.toMatchObject({ code: "stale-revision" });
  expect(
    await db.select().from(estrelaDevices).where(eq(estrelaDevices.id, fresh.device.id)),
  ).toHaveLength(1);
});

it("refuses an unavailable manager or changed consent selection without partially deleting credentials", async () => {
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
    db.transaction((tx) => executeEstrelaClosure(tx, { ...authority, phase: "erase", plan })),
  ).rejects.toMatchObject({ code: "stale-plan" });
  await expect(prepare({ ...authority, operationId: randomUUID() })).rejects.toMatchObject({
    code: "stale-revision",
  });
  expect(
    await db.select().from(estrelaDevices).where(eq(estrelaDevices.userId, f.owner)),
  ).toHaveLength(1);
  const solo = await fixture(),
    soloAuthority = await freeze(solo.owner),
    soloPlan = await prepare(soloAuthority);
  await db.insert(estrelaRewards).values({
    familyGroupId: solo.group.id,
    kind: "custom",
    name: "Late reward",
    icon: "star",
    priceStars: 20,
  });
  await expect(
    db.transaction((tx) =>
      executeEstrelaClosure(tx, { ...soloAuthority, phase: "erase", plan: soloPlan }),
    ),
  ).rejects.toMatchObject({ code: "stale-plan" });
  expect(
    await db
      .select()
      .from(estrelaChildren)
      .where(eq(estrelaChildren.id, solo.child.activation.value.childId)),
  ).toHaveLength(1);
});
