import { randomUUID } from "node:crypto";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { startCompassoTrial } from "@informach/billing/compasso";
import { and, db, eq, sql } from "@informach/db";
import {
  collectionTrials,
  estrelaChildren,
  estrelaDevices,
  estrelaNotificationDeliveries,
  estrelaPushSubscriptions,
  familyAccessGrants,
  familyAppProfiles,
  familyGroups,
  familyPeople,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { describe, expect, it } from "vitest";
import {
  createDevice,
  createPairingCode,
  getPinChallenge,
  heartbeat,
  readDevice,
  redeemPairingCode,
  touchDevice,
} from "@/features/aparelho/repository";
import { balances, completeTask, giveBonus } from "@/features/estrelas/repository";
import type { AdultAuthority, ChildAuthority, PinAuthority } from "@/features/familia/authority";
import {
  completeOnboarding,
  createChild,
  deleteChild,
  familyExport,
  getFamily,
  hasChildAccess,
  listChildren,
  setPinHash,
} from "@/features/familia/repository";
import {
  canNotifyChild,
  claimDelivery,
  familyAdults,
  finishDelivery,
  hasPushSubscription,
  pushSubscriptionsOf,
  savePushSubscription,
} from "@/features/lembretes/repository";
import { createReward, goalPhoto, setGoal } from "@/features/loja/repository";
import { createTask, getTask, readVoice, saveVoice } from "@/features/rotina/repository";
import { taskSchema } from "@/features/rotina/schemas";
import { avisarFamilia, fluxoDaFamilia } from "@/features/tempo-real/bus";

const family = createFamilyService({ db });
const taskInput = taskSchema.parse({
  title: "Tarefa privada",
  icon: "star",
  time: "00:00",
  days: 127,
  stars: 3,
});
const trialConfig = {
  db,
  trialHashSecret: "isolated-authority-trial-secret-at-least-32-characters",
};
async function fixture(two = false) {
  const owner = randomUUID();
  const guest = randomUUID();
  for (const id of [owner, guest])
    await db
      .insert(users)
      .values({ id, name: "Adult", email: `${id}@example.test`, emailVerified: true });
  const group = await family.createGroup(owner, "Context");
  const actor: AdultAuthority = { kind: "adult", userId: owner, familyGroupId: group.id };
  const reader: AdultAuthority = { ...actor, userId: guest };
  const invite = await family.createInvitation(owner, group.id, `${guest}@example.test`);
  await family.acceptInvitation(guest, invite.token);
  const people: Awaited<ReturnType<typeof family.createPerson>>[] = [];
  for (const name of two ? ["Same name", "Same name"] : ["Child"])
    people.push(
      await family.createPerson(owner, { groupId: group.id, kind: "dependent", displayName: name }),
    );
  await startCompassoTrial(trialConfig, owner, group.id);
  const ids = await completeOnboarding(actor, {
    personIds: people.map((p) => p.id),
    templateIds: [],
    pinHash: "fixture-scrypt-hash",
    timezone: "America/Sao_Paulo",
  });
  const kids = await listChildren(actor);
  const first = kids.find((k) => k.id === ids[0]);
  const second = kids.find((k) => k.id === ids[1]);
  if (!first) throw new Error("Missing child fixture");
  const grant = async (action: "read" | "write" | "manage", index = 0) => {
    const person = people[index];
    if (!person) throw new Error("Missing person");
    await family.grantAccess(owner, {
      groupId: group.id,
      personId: person.id,
      app: "dia-de-estrela",
      userId: guest,
      action,
    });
  };
  return { actor, reader, first, second, grant };
}
async function device(actor: AdultAuthority, childId: string) {
  const issued = await createDevice(actor, { childIds: [childId], label: "Fixture tablet" });
  const child: ChildAuthority = { ...actor, kind: "child", deviceId: issued.device.id, childId };
  return { ...issued, child };
}

// The production service never receives a creator ID in place of the actual actor.
describe("canonical Estrela permissions and devices", () => {
  it("fences push claims by participation revision, recipient and delivery deadline", async () => {
    const { actor, reader, first, grant } = await fixture();
    await grant("read");
    await savePushSubscription(reader.userId, {
      endpoint: `https://example.test/${randomUUID()}`,
      p256dh: "fixture",
      auth: "fixture",
    });
    const [subscription] = await pushSubscriptionsOf([reader.userId]);
    if (!subscription) throw new Error("Missing subscription");
    const old = await claimDelivery(reader.userId, `old:${randomUUID()}`, subscription.id);
    if (!old) throw new Error("Missing push claim");
    expect(await canNotifyChild(actor.familyGroupId, first.id, reader.userId, old)).toBe(true);
    expect(await canNotifyChild(actor.familyGroupId, first.id, actor.userId, old)).toBe(false);
    const operationId = randomUUID();
    await db.transaction((tx) =>
      freezeWebParticipation(tx, { userId: reader.userId, operationId, expectedRevision: 0 }),
    );
    expect(await canNotifyChild(actor.familyGroupId, first.id, reader.userId, old)).toBe(false);
    await db.transaction((tx) =>
      resumeWebParticipation(tx, { userId: reader.userId, operationId, expectedRevision: 1 }),
    );
    expect(await canNotifyChild(actor.familyGroupId, first.id, reader.userId, old)).toBe(false);
    const fresh = await claimDelivery(reader.userId, `fresh:${randomUUID()}`, subscription.id);
    if (!fresh) throw new Error("Missing fresh push claim");
    expect(await canNotifyChild(actor.familyGroupId, first.id, reader.userId, fresh)).toBe(true);
    await db
      .update(estrelaNotificationDeliveries)
      .set({ lastAttemptAt: sql`clock_timestamp() - interval '61 seconds'` })
      .where(eq(estrelaNotificationDeliveries.id, fresh.id));
    expect(await canNotifyChild(actor.familyGroupId, first.id, reader.userId, fresh)).toBe(false);
    await finishDelivery(fresh, "sent");
    expect(
      (
        await db
          .select()
          .from(estrelaNotificationDeliveries)
          .where(eq(estrelaNotificationDeliveries.id, fresh.id))
      )[0]?.status,
    ).toBe("processing");
    await db
      .update(estrelaNotificationDeliveries)
      .set({ status: "failed" })
      .where(eq(estrelaNotificationDeliveries.id, old.id));
    await finishDelivery(old, "sent");
    expect(
      (
        await db
          .select()
          .from(estrelaNotificationDeliveries)
          .where(eq(estrelaNotificationDeliveries.id, old.id))
      )[0]?.status,
    ).toBe("failed");
    await db
      .delete(estrelaPushSubscriptions)
      .where(eq(estrelaPushSubscriptions.id, subscription.id));
    expect(await claimDelivery(reader.userId, `late:${randomUUID()}`, subscription.id)).toBeNull();
  });
  it("invalidates issued devices and pending pairing codes across a web suspension", async () => {
    const { actor, reader, first, grant } = await fixture();
    await grant("read");
    await grant("write");
    const taskId = await createTask(actor, first.id, taskInput);
    const issued = await device(reader, first.id);
    const pending = await createPairingCode(reader, {
      childIds: [first.id],
      label: "Pending tablet",
    });
    const endpoint = `https://example.test/push/${randomUUID()}`;
    await savePushSubscription(reader.userId, { endpoint, p256dh: "fixture", auth: "fixture" });
    await expect(
      savePushSubscription(actor.userId, { endpoint, p256dh: "other", auth: "other" }),
    ).rejects.toMatchObject({ code: "DEVICE_ALREADY_LINKED" });
    const operationId = randomUUID();
    await db.transaction((tx) =>
      freezeWebParticipation(tx, { userId: reader.userId, operationId, expectedRevision: 0 }),
    );
    expect(await readDevice(issued.token)).toBeNull();
    expect(await getTask(issued.child, taskId)).toBeNull();
    expect(await getTask(actor, taskId)).not.toBeNull();
    expect(await hasPushSubscription(reader.userId)).toBe(false);
    expect(await pushSubscriptionsOf([reader.userId])).toEqual([]);
    expect(await claimDelivery(reader.userId, "after-freeze", randomUUID())).toBeNull();
    await expect(
      savePushSubscription(reader.userId, { endpoint, p256dh: "late", auth: "late" }),
    ).rejects.toMatchObject({ code: "unavailable" });
    await db.transaction((tx) =>
      resumeWebParticipation(tx, { userId: reader.userId, operationId, expectedRevision: 1 }),
    );
    expect(await readDevice(issued.token)).toBeNull();
    await expect(heartbeat(issued.child)).rejects.toMatchObject({ code: "DEVICE" });
    await expect(redeemPairingCode(pending.code)).rejects.toMatchObject({ code: "CODE" });
    expect(await getTask(issued.child, taskId)).toBeNull();
    const fresh = await device(reader, first.id);
    expect(await readDevice(fresh.token)).not.toBeNull();
    expect(await getTask(fresh.child, taskId)).not.toBeNull();
  });
  it("membership alone cannot read routines; read is not write, administration or pairing", async () => {
    const { actor, reader, first, grant } = await fixture();
    const taskId = await createTask(actor, first.id, taskInput);
    expect(await listChildren(reader)).toHaveLength(0);
    expect(await getTask(reader, taskId)).toBeNull();
    await grant("read");
    expect(await getTask(reader, taskId)).toMatchObject({ id: taskId });
    expect((await listChildren(reader))[0]).toMatchObject({ canWrite: false, canManage: false });
    await expect(createTask(reader, first.id, taskInput)).rejects.toMatchObject({ code: "CHILD" });
    await expect(
      createDevice(reader, { childIds: [first.id], label: "Reader" }),
    ).rejects.toMatchObject({ code: "CHILD" });
    await expect(
      createReward(reader, { kind: "money", name: "R$ 1", icon: "banknote", moneyCents: 100 }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(await familyAdults(actor.familyGroupId, first.id)).toContain(reader.userId);
    await grant("write");
    expect(await createTask(reader, first.id, taskInput)).toBeTruthy();
    await expect(deleteChild(reader, first.id)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("a delegated device stays scoped to one child and does not revive after grants are recreated", async () => {
    const { actor, reader, first, second, grant } = await fixture(true);
    if (!second) throw new Error("Missing sibling");
    await grant("read");
    await grant("write");
    const taskId = await createTask(actor, first.id, taskInput);
    const siblingTask = await createTask(actor, second.id, taskInput);
    const issued = await device(reader, first.id);
    expect(await getTask(issued.child, taskId)).not.toBeNull();
    expect(await getTask(issued.child, siblingTask)).toBeNull();
    await expect(
      completeTask({ actor: issued.child, childId: second.id, taskId: siblingTask }),
    ).rejects.toMatchObject({ code: "CHILD" });
    await family.revokeAccess(actor.userId, {
      groupId: actor.familyGroupId,
      personId: first.personId,
      app: "dia-de-estrela",
      userId: reader.userId,
      action: "write",
    });
    expect(await readDevice(issued.token)).toBeNull();
    expect(await getTask(issued.child, taskId)).toBeNull();
    await grant("write");
    expect(await readDevice(issued.token)).toBeNull();
    await expect(heartbeat(issued.child)).rejects.toMatchObject({ code: "DEVICE" });
    expect(await readDevice((await device(reader, first.id)).token)).not.toBeNull();
  });

  it("a pending code cannot redeem a withdrawn delegation and an expired device cannot renew", async () => {
    const { actor, reader, first, grant } = await fixture();
    await grant("read");
    await grant("write");
    const pending = await createPairingCode(reader, { childIds: [first.id], label: "Pending" });
    await family.revokeAccess(actor.userId, {
      groupId: actor.familyGroupId,
      personId: first.personId,
      app: "dia-de-estrela",
      userId: reader.userId,
      action: "read",
    });
    await grant("read");
    await expect(redeemPairingCode(pending.code)).rejects.toMatchObject({ code: "CODE" });
    const issued = await device(reader, first.id);
    await db
      .update(estrelaDevices)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(estrelaDevices.id, issued.device.id));
    await expect(touchDevice(issued.child)).rejects.toMatchObject({ code: "DEVICE" });
    expect(await readDevice(issued.token)).toBeNull();
  });

  it("PIN authority is narrow, expires in the database and changes with the PIN generation", async () => {
    const { actor, first, second } = await fixture(true);
    if (!second) throw new Error("Missing sibling");
    const issued = await device(actor, first.id);
    const challenge = await getPinChallenge(issued.child);
    if (!challenge) throw new Error("Missing PIN challenge");
    const pin: PinAuthority = {
      kind: "pin",
      userId: actor.userId,
      familyGroupId: actor.familyGroupId,
      deviceId: issued.device.id,
      pinGeneration: challenge.pinGeneration,
      unlockedUntil: Date.now() + 60_000,
    };
    await giveBonus(pin, first.id, 2, "Approved by PIN");
    await expect(giveBonus(pin, second.id, 2, "Other child")).rejects.toMatchObject({
      code: "CHILD",
    });
    await expect(
      Reflect.apply(giveBonus, undefined, [issued.child, first.id, 2, "Forged adult"]),
    ).rejects.toMatchObject({ code: "PARENT" });
    await expect(Reflect.apply(createChild, undefined, [pin, randomUUID()])).rejects.toMatchObject({
      code: "AUTH",
    });
    await expect(
      giveBonus({ ...pin, unlockedUntil: Date.now() - 1 }, first.id, 2, "Expired"),
    ).rejects.toMatchObject({ code: "CHILD" });
    await setPinHash(actor, "new-fixture-scrypt-hash");
    await expect(giveBonus(pin, first.id, 2, "Old generation")).rejects.toMatchObject({
      code: "CHILD",
    });
    expect(await readDevice(issued.token)).not.toBeNull();
    expect(await getFamily(actor)).not.toHaveProperty("pinHash");
    expect(await getFamily(actor)).not.toHaveProperty("pinGeneration");
  });

  it("revocation while a writer waits for the household lock is observed after the wait", async () => {
    const { actor, reader, first, grant } = await fixture();
    await grant("read");
    await grant("write");
    let ready = () => {};
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = db.transaction(async (tx) => {
      await tx
        .select({ id: familyGroups.id })
        .from(familyGroups)
        .where(eq(familyGroups.id, actor.familyGroupId))
        .for("update");
      ready();
      await gate;
      await tx
        .delete(familyAccessGrants)
        .where(
          and(
            eq(familyAccessGrants.profileId, first.familyProfileId),
            eq(familyAccessGrants.userId, reader.userId),
            eq(familyAccessGrants.action, "write"),
          ),
        );
    });
    await locked;
    const mutation = giveBonus(reader, first.id, 5, "Must not commit");
    const outcome = mutation.then(
      () => "committed",
      (error: unknown) => error,
    );
    try {
      const deadline = Date.now() + 5_000;
      let waiting = false;
      while (Date.now() < deadline) {
        const rows = await db.execute(
          sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%family%groups%'`,
        );
        if (rows.length) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
    } finally {
      release();
      await blocker;
    }
    expect(await outcome).toMatchObject({ code: "ACCESS_DENIED" });
    expect((await balances(actor, [first.id])).get(first.id)?.saldo).toBe(0);
  });

  it("coverage expiration is checked inside writes and the free slot belongs to the whole family", async () => {
    const { actor, reader, first, second, grant } = await fixture(true);
    if (!second) throw new Error("Missing sibling");
    await grant("read", 1);
    await grant("write", 1);
    const taskId = await createTask(actor, second.id, taskInput);
    await db
      .update(collectionTrials)
      .set({
        startsAt: new Date(Date.now() - 15 * 86_400_000),
        endsAt: new Date(Date.now() - 1000),
      })
      .where(eq(collectionTrials.groupId, actor.familyGroupId));
    expect(await getTask(reader, taskId)).not.toBeNull();
    await expect(createTask(reader, second.id, taskInput)).rejects.toMatchObject({ code: "PLAN" });
    await expect(
      saveVoice(actor, taskId, { mime: "audio/webm", data: Buffer.from([1]), durationMs: 500 }),
    ).rejects.toMatchObject({ code: "PLAN" });
    expect(await createTask(actor, first.id, taskInput)).toBeTruthy();
    expect(await canNotifyChild(actor.familyGroupId, second.id, reader.userId)).toBe(false);
  });

  it("an open stream closes when its read grant is withdrawn and never forwards another household", async () => {
    const { actor, reader, first, grant } = await fixture();
    await grant("read");
    const abort = new AbortController();
    const response = fluxoDaFamilia(actor.familyGroupId, abort.signal, () =>
      hasChildAccess(reader),
    );
    const stream = response.body?.getReader();
    if (!stream) throw new Error("Missing event stream");
    const text = new TextDecoder();
    try {
      expect(text.decode((await stream.read()).value)).toBe("retry: 5000\n\n");
      await avisarFamilia(randomUUID(), "loja");
      await avisarFamilia(actor.familyGroupId, "rotina");
      expect(text.decode((await stream.read()).value)).toBe("data: rotina\n\n");
      await family.revokeAccess(actor.userId, {
        groupId: actor.familyGroupId,
        personId: first.personId,
        app: "dia-de-estrela",
        userId: reader.userId,
        action: "read",
      });
      await avisarFamilia(actor.familyGroupId, "conclusao");
      expect(await stream.read()).toMatchObject({ done: true });
      await grant("read");
      await avisarFamilia(actor.familyGroupId, "loja");
      expect(await stream.read()).toMatchObject({ done: true });
    } finally {
      abort.abort();
      await stream.cancel();
    }
  });

  it("files and export respect grants and deleting one app preserves the shared person and another app", async () => {
    const { actor, reader, first, second, grant } = await fixture(true);
    if (!second) throw new Error("Missing sibling");
    await grant("read");
    const taskId = await createTask(actor, first.id, taskInput);
    const otherTask = await createTask(actor, second.id, taskInput);
    await saveVoice(actor, taskId, {
      mime: "audio/webm",
      data: Buffer.from([1, 2]),
      durationMs: 500,
    });
    await saveVoice(actor, otherTask, {
      mime: "audio/webm",
      data: Buffer.from([3, 4]),
      durationMs: 500,
    });
    expect(await readVoice(reader, taskId)).not.toBeNull();
    expect(await readVoice(reader, otherTask)).toBeNull();
    await setGoal(actor, second.id, {
      name: "Private goal",
      reais: 2,
      photo: { mime: "image/png", data: Buffer.from([1]) },
    });
    expect(await goalPhoto(reader, second.id)).toBeNull();
    const exported = await familyExport(reader);
    expect(exported.children.map((c) => c.id)).toEqual([first.id]);
    expect(exported.taskRows.map((t) => t.id)).toEqual([taskId]);
    expect(exported.voices.map((v) => v.taskId)).toEqual([taskId]);
    expect(exported.goalRows).toHaveLength(0);
    expect(exported.family).not.toHaveProperty("pinHash");
    const otherApp = await family.activateProfile(
      actor.userId,
      { groupId: actor.familyGroupId, personId: first.personId, app: "bora-treinar" },
      async () => null,
    );
    await family.archivePerson(actor.userId, actor.familyGroupId, first.personId);
    await deleteChild(actor, first.id);
    expect(
      await db
        .select({ id: familyPeople.id })
        .from(familyPeople)
        .where(eq(familyPeople.id, first.personId)),
    ).toHaveLength(1);
    expect(
      await db
        .select({ id: familyAppProfiles.id })
        .from(familyAppProfiles)
        .where(eq(familyAppProfiles.id, otherApp.profileId)),
    ).toHaveLength(1);
    expect(
      await db
        .select({ id: estrelaChildren.id })
        .from(estrelaChildren)
        .where(eq(estrelaChildren.id, first.id)),
    ).toHaveLength(0);
  });
});
