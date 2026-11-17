import { randomUUID } from "node:crypto";
import { freezeWebParticipation } from "@informach/auth/web-participation";
import { startCompassoTrial } from "@informach/billing/compasso";
import { and, db, eq, sql } from "@informach/db";
import {
  boraChallenges,
  boraFamilies,
  boraProfiles,
  boraSessions,
  collectionTrials,
  customers,
  emailDeliveries,
  familyAccessGrants,
  familyAppProfiles,
  familyGroups,
  familyMigrationSources,
  familyPeople,
  subscriptions,
  users,
} from "@informach/db/schema";
import { dispatchEmail } from "@informach/emails";
import { createFamilyService } from "@informach/family";
import { beforeEach, describe, expect, it } from "vitest";
import { FREE_ACCESS } from "@/features/acesso/policy";
import { getGroupAccess } from "@/features/billing/service";
import { challengeOf, clearChallenge, setChallenge } from "@/features/desafios/repository";
import { dadosDoDesafio } from "@/features/desafios/service";
import {
  deleteProfile,
  enabledTrainerIds,
  ensureFamily,
  familyExport,
  getFamily,
  listProfiles,
  progressOf,
  setPreferences,
  setTimezone,
} from "@/features/familia/repository";
import { activateTrainer, listAvailablePeople } from "@/features/familia/service";
import {
  familiasComAvisos,
  isCurrentRecipient,
  marcarResumo,
  melhoresAntesDe,
  sessoesSomadasDesde,
} from "@/features/lembretes/repository";
import {
  deleteCustomWorkout,
  listCustomWorkouts,
  saveCustomWorkout,
} from "@/features/meus-treinos/repository";
import { recoverableLegacyQueue } from "@/features/sessoes/legacy-queue-repository";
import {
  sessionById,
  sessionsOf,
  todasAsSessoes,
  volumeDaFamiliaDesde,
} from "@/features/sessoes/repository";
import { groupInputSchema, type SessionInput } from "@/features/sessoes/schema";
import { saveGroupSession, saveSession } from "@/features/sessoes/service";

const family = createFamilyService({ db });
let owner: string;
let guest: string;
beforeEach(async () => {
  owner = randomUUID();
  guest = randomUUID();
  await db.insert(users).values(
    [owner, guest].map((id) => ({
      id,
      name: "Adult",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  await db.insert(boraFamilies).values([owner, guest].map((userId) => ({ userId })));
});
async function fixture(groupId?: string) {
  const group = groupId ? { id: groupId } : await family.createGroup(owner, "Training context");
  const child = await family.createPerson(owner, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Ana",
  });
  const target = { groupId: group.id, personId: child.id, app: "bora-treinar" };
  const activation = await family.activateProfile(owner, target, async (tx, familyProfileId) => {
    const [profile] = await tx
      .insert(boraProfiles)
      .values({ userId: owner, familyProfileId })
      .returning({ id: boraProfiles.id });
    if (!profile) throw new Error("Missing training fixture");
    return profile.id;
  });
  if (!groupId) {
    const invite = await family.createInvitation(owner, group.id, `${guest}@example.test`);
    await family.acceptInvitation(guest, invite.token);
  }
  return { target, profileId: activation.value };
}
async function trialFixture(groupId: string) {
  await db.insert(collectionTrials).values({
    groupId,
    collection: "compasso",
    startedBy: owner,
    startsAt: new Date(Date.now() - 13 * 86400000),
    endsAt: new Date(Date.now() + 86400000),
  });
}
const session = (profileId: string): SessionInput => ({
  id: randomUUID(),
  profileId,
  workoutRef: "catalogo:primeiro-treino",
  startedAt: Date.now() - 60_000,
  durationSeconds: 60,
  mode: "manual",
  logs: [
    {
      exerciseId: "agachamento",
      kind: "reps",
      reps: 5,
      partials: 0,
      holdSeconds: 0,
      seconds: 30,
      issues: {},
    },
  ],
});

describe("Bora canonical profile access", () => {
  it("blocks personal preferences, exports and scheduled reminders after web freeze", async () => {
    await setPreferences(owner, { reminderDays: 3, reminderHour: 8, weeklySummary: true });
    const [before] = await db.select().from(boraFamilies).where(eq(boraFamilies.userId, owner));
    await db.transaction((tx) =>
      freezeWebParticipation(tx, { userId: owner, operationId: randomUUID(), expectedRevision: 0 }),
    );
    await expect(ensureFamily(owner)).rejects.toMatchObject({ code: "unavailable" });
    await expect(setTimezone(owner, "UTC")).rejects.toMatchObject({ code: "unavailable" });
    await expect(
      setPreferences(owner, { reminderDays: 0, reminderHour: 10, weeklySummary: false }),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(deleteCustomWorkout(owner, randomUUID())).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(familyExport(owner)).rejects.toMatchObject({ code: "unavailable" });
    expect(await getFamily(owner)).toBeNull();
    expect(await listCustomWorkouts(owner)).toEqual([]);
    expect(await isCurrentRecipient(owner, `${owner}@example.test`)).toBe(false);
    expect((await familiasComAvisos(null, 1000)).map((row) => row.userId)).not.toContain(owner);
    await marcarResumo(owner, "2027-02-01");
    expect((await db.select().from(boraFamilies).where(eq(boraFamilies.userId, owner)))[0]).toEqual(
      before,
    );
    await setTimezone(guest, "UTC");
    expect((await getFamily(guest))?.timezone).toBe("UTC");
  });

  it("keeps commercial slots independent of an adult's limited visibility", async () => {
    const first = await fixture();
    const second = await fixture(first.target.groupId);
    await family.grantAccess(owner, { ...second.target, userId: guest, action: "read" });
    expect(await listProfiles(guest, first.target.groupId)).toHaveLength(1);
    expect(await enabledTrainerIds(guest, first.target.groupId, 1)).toEqual([first.profileId]);
  });

  it("does not offer an already activated person when the identity manager cannot read app content", async () => {
    const f = await fixture();
    const [activation] = await db
      .select({ id: boraProfiles.familyProfileId })
      .from(boraProfiles)
      .where(eq(boraProfiles.id, f.profileId));
    if (!activation) throw new Error("Missing activation");
    await db.delete(familyAccessGrants).where(eq(familyAccessGrants.profileId, activation.id));
    expect(await listProfiles(owner, f.target.groupId)).toEqual([]);
    expect(await listAvailablePeople(owner, f.target.groupId)).not.toContainEqual(
      expect.objectContaining({ id: f.target.personId }),
    );
    expect(await listAvailablePeople(guest, f.target.groupId)).not.toContainEqual(
      expect.objectContaining({ id: f.target.personId }),
    );
  });

  it("preserves shared profiles and sessions when old adult preferences are removed", async () => {
    const f = await fixture();
    await saveSession(owner, f.target.groupId, session(f.profileId), "America/Sao_Paulo");
    await db.delete(boraFamilies).where(eq(boraFamilies.userId, owner));
    expect(await sessionsOf(owner, f.profileId)).toHaveLength(1);
    expect((await listProfiles(owner, f.target.groupId)).map((p) => p.id)).toContain(f.profileId);
  });

  it("suppresses a digest retry after its recipient loses access without persisting its private body", async () => {
    const f = await fixture();
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "read" });
    let attempts = 0;
    const result = await dispatchEmail(
      {
        db,
        defaultFrom: "no-reply@example.test",
        mode: "live",
        sandboxDir: "unused",
        sleep: async () => {},
        send: async () => {
          attempts++;
          await family.revokeAccess(owner, { ...f.target, userId: guest, action: "read" });
          throw Object.assign(new Error("synthetic transient transport failure"), {
            response: { statusCode: 503 },
          });
        },
      },
      {
        to: `${guest}@example.test`,
        userId: guest,
        subject: "Resumo",
        text: "Private training history",
        category: "bora.weekly-summary",
        messageKey: randomUUID(),
        unsubscribeUrl: "http://localhost:3007/api/email/unsubscribe?t=synthetic",
        authorizeContent: async () =>
          (await listProfiles(guest, f.target.groupId)).some((p) => p.id === f.profileId),
      },
    );
    expect(attempts).toBe(1);
    expect(result).toMatchObject({ ok: false, status: "skipped" });
    expect(
      await db
        .select({
          html: emailDeliveries.html,
          text: emailDeliveries.text,
          status: emailDeliveries.status,
        })
        .from(emailDeliveries)
        .where(eq(emailDeliveries.id, result.deliveryId)),
    ).toEqual([{ html: null, text: null, status: "skipped" }]);
  });
  it("isolates group challenges and permits a read-only adult to view without creating history", async () => {
    const f = await fixture();
    const other = await fixture();
    const week = "2026-11-09";
    const target = { metric: "treinos" as const, exerciseId: null, target: 2 };
    await trialFixture(f.target.groupId);
    await setChallenge(owner, f.target.groupId, week, target);
    expect(await challengeOf(guest, f.target.groupId, week)).toEqual(target);
    expect(await challengeOf(guest, other.target.groupId, week)).toBeNull();
    await expect(setChallenge(guest, f.target.groupId, week, target)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "read" });
    const access = { ...FREE_ACCESS, unlocked: true, profileLimit: 6 };
    const visible = await dadosDoDesafio(
      guest,
      f.profileId,
      "America/Sao_Paulo",
      access,
      new Date("2026-11-09T15:00:00Z"),
    );
    expect(visible).toMatchObject({
      liberado: true,
      familia: { desafio: target },
      perfisLiberados: 1,
    });
    expect(
      await db.select().from(boraChallenges).where(eq(boraChallenges.profileId, f.profileId)),
    ).toEqual([]);
    await expect(
      setChallenge(guest, other.target.groupId, week, target, f.profileId),
    ).rejects.toThrow();
    await family.revokeMember(owner, f.target.groupId, guest);
    expect(await challengeOf(guest, f.target.groupId, week)).toBeNull();
    await clearChallenge(owner, f.target.groupId, week);
    expect(await challengeOf(owner, f.target.groupId, week)).toBeNull();
  });

  it("reads reminder statistics through current grants and the selected family", async () => {
    const f = await fixture();
    const other = await fixture();
    await saveSession(owner, f.target.groupId, session(f.profileId), "America/Sao_Paulo");
    expect(await sessoesSomadasDesde(guest, new Date(0), f.target.groupId)).toEqual([]);
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "read" });
    expect(await sessoesSomadasDesde(guest, new Date(0), f.target.groupId)).toHaveLength(1);
    expect(await sessoesSomadasDesde(guest, new Date(0), other.target.groupId)).toEqual([]);
    expect(
      (await melhoresAntesDe(guest, new Date(), f.target.groupId))
        .get(f.profileId)
        ?.get("agachamento")?.bestSet,
    ).toBe(5);
    await family.revokeAccess(owner, { ...f.target, userId: guest, action: "read" });
    expect((await melhoresAntesDe(guest, new Date(), f.target.groupId)).size).toBe(0);
  });
  it("activates existing people atomically within the coverage limit without copying identity", async () => {
    const group = await family.createGroup(owner, "Ativações gratuitas");
    const first = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Ana com um nome que ultrapassa o antigo limite do Bora Treinar",
    });
    const second = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Beto",
    });
    const results = await Promise.allSettled(
      [first, second].map((p) => activateTrainer(owner, group.id, p.id)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const activated = await listProfiles(owner, group.id);
    expect(activated).toHaveLength(1);
    const profile = activated[0];
    if (!profile) throw new Error("Missing activated trainer");
    expect(
      await db
        .select({ familyProfileId: boraProfiles.familyProfileId })
        .from(boraProfiles)
        .where(eq(boraProfiles.id, profile.id)),
    ).toEqual([{ familyProfileId: expect.any(String) }]);
    expect(
      await db.select().from(familyAppProfiles).where(eq(familyAppProfiles.groupId, group.id)),
    ).toHaveLength(1);
    await expect(activateTrainer(owner, group.id, profile.personId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("requires manage permission to delete only this app history and allows clean reactivation", async () => {
    const f = await fixture();
    const input = session(f.profileId);
    await saveSession(owner, f.target.groupId, input, "America/Sao_Paulo");
    const other = await family.activateProfile(
      owner,
      { ...f.target, app: "missao-saber" },
      async () => undefined,
    );
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "read" });
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "write" });
    await expect(deleteProfile(guest, f.profileId)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    expect(await sessionsOf(owner, f.profileId)).toHaveLength(1);
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "manage" });
    await deleteProfile(guest, f.profileId);
    expect(await db.select().from(boraSessions).where(eq(boraSessions.id, input.id))).toEqual([]);
    expect(
      await db.select().from(familyPeople).where(eq(familyPeople.id, f.target.personId)),
    ).toHaveLength(1);
    expect(
      await db.select().from(familyAppProfiles).where(eq(familyAppProfiles.id, other.profileId)),
    ).toHaveLength(1);
    const fresh = await activateTrainer(owner, f.target.groupId, f.target.personId);
    expect(fresh).not.toBe(f.profileId);
    expect(await sessionsOf(owner, fresh)).toEqual([]);
  });
  it("shares the same history only with a granted adult and rejects stale authorized-ID lists", async () => {
    const f = await fixture();
    const input = session(f.profileId);
    await saveSession(owner, f.target.groupId, input, "America/Sao_Paulo");
    expect((await listProfiles(guest)).some((p) => p.id === f.profileId)).toBe(false);
    expect(await sessionsOf(guest, f.profileId)).toEqual([]);
    expect(await progressOf(guest, f.profileId)).toEqual({});
    expect(await sessionById(guest, input.id)).toBeNull();
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "read" });
    expect(await sessionsOf(guest, f.profileId)).toMatchObject([
      { id: input.id, logs: [{ exerciseId: "agachamento", reps: 5 }] },
    ]);
    expect(await todasAsSessoes(guest, f.profileId, 1)).toHaveLength(1);
    await family.updatePerson(owner, {
      groupId: f.target.groupId,
      personId: f.target.personId,
      expectedVersion: 1,
      displayName: "Ana Maria com nome compartilhado",
      color: "#123456",
      avatar: "person",
    });
    expect((await listProfiles(guest)).find((p) => p.id === f.profileId)).toMatchObject({
      name: "Ana Maria com nome compartilhado",
      color: "#123456",
    });
    expect((await familyExport(guest)).profiles.some((p) => p.id === f.profileId)).toBe(true);

    expect(await volumeDaFamiliaDesde(guest, f.target.groupId, new Date(0))).toHaveLength(1);
    await expect(
      saveSession(guest, f.target.groupId, session(f.profileId), "America/Sao_Paulo"),
    ).rejects.toThrow("Perfil não disponível");
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "write" });
    await saveSession(guest, f.target.groupId, session(f.profileId), "America/Sao_Paulo");
    expect(await sessionsOf(owner, f.profileId)).toHaveLength(2);
    await family.revokeAccess(owner, { ...f.target, userId: guest, action: "write" });
    await expect(
      saveSession(guest, f.target.groupId, session(f.profileId), "America/Sao_Paulo"),
    ).rejects.toThrow("Perfil não disponível");
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "write" });
    await family.revokeAccess(owner, { ...f.target, userId: guest, action: "read" });
    const previous = await progressOf(owner, f.profileId);
    await expect(
      saveSession(guest, f.target.groupId, session(f.profileId), "America/Sao_Paulo"),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(await progressOf(owner, f.profileId)).toEqual(previous);
    await family.archivePerson(owner, f.target.groupId, f.target.personId);
    expect(await todasAsSessoes(owner, f.profileId)).toEqual([]);
    expect(await sessionById(guest, input.id)).toBeNull();
  });

  it("rejects an entire group workout when one profile lost its write grant", async () => {
    const first = await fixture();
    const second = await fixture();
    for (const f of [first, second]) {
      await family.grantAccess(owner, { ...f.target, userId: guest, action: "read" });
      await family.grantAccess(owner, { ...f.target, userId: guest, action: "write" });
    }
    await family.revokeAccess(owner, { ...second.target, userId: guest, action: "write" });
    const groupId = randomUUID();
    const input = {
      groupId,
      sessoes: [first, second].map((f) => ({ ...session(f.profileId), groupId })),
    };
    await expect(
      saveGroupSession(guest, first.target.groupId, input, "America/Sao_Paulo"),
    ).rejects.toThrow("Perfil não disponível");
    expect(
      await db
        .select({ id: boraSessions.id })
        .from(boraSessions)
        .where(eq(boraSessions.groupId, groupId)),
    ).toEqual([]);
    await family.grantAccess(owner, { ...second.target, userId: guest, action: "write" });
    await expect(
      saveGroupSession(guest, first.target.groupId, input, "America/Sao_Paulo"),
    ).rejects.toThrow("mesma família");
    expect(
      await db
        .select({ id: boraSessions.id })
        .from(boraSessions)
        .where(eq(boraSessions.groupId, groupId)),
    ).toEqual([]);
  });
  it("saves and replays a shared workout atomically within one canonical family", async () => {
    const first = await fixture();
    const second = await fixture(first.target.groupId);
    for (const f of [first, second])
      for (const action of ["read", "write"] as const)
        await family.grantAccess(owner, { ...f.target, userId: guest, action });
    const groupId = randomUUID();
    const input = {
      groupId,
      sessoes: [first, second].map((f) => ({ ...session(f.profileId), groupId })),
    };
    await trialFixture(first.target.groupId);
    await saveGroupSession(guest, first.target.groupId, input, "America/Sao_Paulo");
    await saveGroupSession(guest, first.target.groupId, input, "America/Sao_Paulo");
    for (const f of [first, second]) expect(await sessionsOf(owner, f.profileId)).toHaveLength(1);
  });
  it("binds Compasso and legacy coverage to the chosen family without exposing the payer contract", async () => {
    const current = await fixture();
    const legacy = await fixture();
    const unrelated = await fixture();
    await startCompassoTrial(
      { db, trialHashSecret: "isolated-compasso-trial".repeat(3) },
      owner,
      current.target.groupId,
    );
    await expect(
      startCompassoTrial(
        { db, trialHashSecret: "isolated-compasso-trial".repeat(3) },
        owner,
        unrelated.target.groupId,
      ),
    ).rejects.toThrow("already-used");
    expect(await getGroupAccess(guest, current.target.groupId)).toMatchObject({
      unlocked: true,
      profileLimit: 6,
      trial: { active: true },
    });
    const [customer] = await db
      .insert(customers)
      .values({
        provider: "stripe",
        providerCustomerId: `cus_${randomUUID()}`,
        subjectType: "user",
        subjectId: owner,
        app: "bora-treinar",
        email: `${owner}@example.test`,
      })
      .returning({ id: customers.id });
    if (!customer) throw new Error("Missing legacy customer fixture");
    await db.insert(subscriptions).values({
      customerId: customer.id,
      provider: "stripe",
      providerSubscriptionId: `sub_${randomUUID()}`,
      productId: "bora_family_monthly",
      providerPriceId: "price_old_fixture",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86400000),
    });
    await db
      .insert(familyMigrationSources)
      .values({ app: "bora-treinar", sourceOwnerId: owner, groupId: legacy.target.groupId });
    expect(await getGroupAccess(guest, legacy.target.groupId)).toMatchObject({
      unlocked: true,
      profileLimit: 4,
      subscription: null,
    });
    expect(await getGroupAccess(owner, unrelated.target.groupId)).toMatchObject({
      unlocked: false,
      profileLimit: 1,
      subscription: null,
    });
  });
});

describe("Compasso offline migration and full family capacity", () => {
  it("recovers old pending workouts only for the imported owner and exact family, with current grants", async () => {
    const f = await fixture();
    const candidate = { id: randomUUID(), profileIds: [f.profileId] };
    const scope = { actorId: owner, familyGroupId: f.target.groupId };
    await db
      .insert(familyMigrationSources)
      .values({
        app: "bora-treinar",
        sourceOwnerId: owner,
        groupId: f.target.groupId,
      })
      .onConflictDoUpdate({
        target: [familyMigrationSources.app, familyMigrationSources.sourceOwnerId],
        set: { groupId: f.target.groupId },
      });
    // The group source alone does not establish that this native profile was imported.
    expect(await recoverableLegacyQueue(scope, [candidate])).toEqual([]);
    await db
      .update(familyAppProfiles)
      .set({ sourceKey: f.profileId })
      .where(eq(familyAppProfiles.personId, f.target.personId));
    expect(await recoverableLegacyQueue(scope, [candidate])).toEqual([candidate.id]);
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "read" });
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "write" });
    expect(await recoverableLegacyQueue({ ...scope, actorId: guest }, [candidate])).toEqual([]);
    expect(
      await recoverableLegacyQueue({ ...scope, familyGroupId: randomUUID() }, [candidate]),
    ).toEqual([]);
    expect(
      await recoverableLegacyQueue(scope, [
        { ...candidate, profileIds: [f.profileId, randomUUID()] },
      ]),
    ).toEqual([]);
    await family.archivePerson(owner, f.target.groupId, f.target.personId);
    expect(await recoverableLegacyQueue(scope, [candidate])).toEqual([]);
  });

  it("accepts all six family profiles in one idempotent workout and rejects overflow", async () => {
    const group = await family.createGroup(owner, "All family participants");
    const invite = await family.createInvitation(owner, group.id, `${guest}@example.test`);
    await family.acceptInvitation(guest, invite.token);
    for (let index = 0; index < 4; index++)
      await family.createPerson(owner, {
        groupId: group.id,
        kind: "dependent",
        displayName: `Participant ${index}`,
      });
    const otherAdult = (await family.listPeople(guest, group.id)).find(
      (person) => person.accountId === guest,
    );
    if (!otherAdult) throw new Error("Missing second adult fixture");
    const people = [...(await family.listPeople(owner, group.id)), otherAdult];
    expect(people).toHaveLength(6);
    const ids: string[] = [];
    for (const person of people) {
      const actorId = person.accountId ?? owner;
      const result = await family.activateProfile(
        actorId,
        {
          groupId: group.id,
          personId: person.id,
          app: "bora-treinar",
        },
        async (tx, familyProfileId) => {
          const [row] = await tx
            .insert(boraProfiles)
            .values({ userId: owner, familyProfileId })
            .returning({ id: boraProfiles.id });
          if (!row) throw new Error("Missing fixture");
          return row.id;
        },
      );
      if (actorId !== owner)
        for (const action of ["read", "write"] as const)
          await family.grantAccess(actorId, {
            groupId: group.id,
            personId: person.id,
            app: "bora-treinar",
            userId: owner,
            action,
          });
      ids.push(result.value);
    }
    const workoutGroupId = randomUUID();
    const input = groupInputSchema.parse({
      groupId: workoutGroupId,
      sessoes: ids.map((id) => ({ ...session(id), groupId: workoutGroupId })),
    });
    await trialFixture(group.id);
    await saveGroupSession(owner, group.id, input, "America/Sao_Paulo");
    await saveGroupSession(owner, group.id, input, "America/Sao_Paulo");
    expect(
      await db
        .select({ id: boraSessions.id })
        .from(boraSessions)
        .where(eq(boraSessions.groupId, workoutGroupId)),
    ).toHaveLength(6);
    expect(
      groupInputSchema.safeParse({
        ...input,
        sessoes: [...input.sessoes, { ...session(randomUUID()), groupId: workoutGroupId }],
      }).success,
    ).toBe(false);
  });
  it("rejects an expired household after the writer waits for its lock", async () => {
    const f = await fixture();
    await trialFixture(f.target.groupId);
    expect((await getGroupAccess(owner, f.target.groupId)).unlocked).toBe(true);
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
        .where(eq(familyGroups.id, f.target.groupId))
        .for("update");
      ready();
      await gate;
      await tx
        .update(collectionTrials)
        .set({ endsAt: new Date(Date.now() - 1000) })
        .where(eq(collectionTrials.groupId, f.target.groupId));
    });
    await locked;
    const input = { ...session(f.profileId), mode: "camera" as const };
    const result = saveSession(owner, f.target.groupId, input, "America/Sao_Paulo").then(
      () => "committed",
      (error: unknown) => error,
    );
    try {
      await expect
        .poll(async () => {
          const rows =
            await db.execute(sql`select 1 from pg_stat_activity where datname = current_database()
          and wait_event_type = 'Lock' and query like '%family%groups%'`);
          return rows.length;
        })
        .toBeGreaterThan(0);
    } finally {
      release();
      await blocker;
    }
    expect(await result).toMatchObject({ code: "PLAN" });
    expect(await db.select().from(boraSessions).where(eq(boraSessions.id, input.id))).toEqual([]);
    await saveSession(owner, f.target.groupId, session(f.profileId), "America/Sao_Paulo");
    expect(await sessionsOf(owner, f.profileId)).toHaveLength(1);
  });

  it("uses the whole-household slot and current coverage for every paid writer", async () => {
    const first = await fixture();
    const second = await fixture(first.target.groupId);
    await trialFixture(first.target.groupId);
    await family.grantAccess(owner, { ...second.target, userId: guest, action: "read" });
    await family.grantAccess(owner, { ...second.target, userId: guest, action: "write" });
    await db
      .update(collectionTrials)
      .set({ endsAt: new Date(Date.now() - 1000) })
      .where(eq(collectionTrials.groupId, first.target.groupId));
    await expect(
      saveSession(guest, first.target.groupId, session(second.profileId), "America/Sao_Paulo"),
    ).rejects.toMatchObject({ code: "PLAN" });
    const workoutGroupId = randomUUID();
    await expect(
      saveGroupSession(
        owner,
        first.target.groupId,
        {
          groupId: workoutGroupId,
          sessoes: [first, second].map((f) => ({
            ...session(f.profileId),
            groupId: workoutGroupId,
          })),
        },
        "America/Sao_Paulo",
      ),
    ).rejects.toMatchObject({ code: "PLAN" });
    await expect(
      setChallenge(owner, first.target.groupId, "2026-11-09", {
        metric: "treinos",
        exerciseId: null,
        target: 2,
      }),
    ).rejects.toMatchObject({ code: "PLAN" });
    await expect(
      saveCustomWorkout(owner, first.target.groupId, {
        name: "Expired",
        subtitle: "",
        level: "Iniciante",
        focus: "Força",
        blocks: [{ type: "sets", slot: "trilha:empurrar", sets: 2, target: 8, rest: 30 }],
      }),
    ).rejects.toMatchObject({ code: "PLAN" });
    expect(
      await db.select().from(boraSessions).where(eq(boraSessions.groupId, workoutGroupId)),
    ).toEqual([]);
  });

  it("can erase an archived activation without erasing its shared person", async () => {
    const f = await fixture();
    await saveSession(owner, f.target.groupId, session(f.profileId), "America/Sao_Paulo");
    await family.archivePerson(owner, f.target.groupId, f.target.personId);
    await deleteProfile(owner, f.profileId);
    expect(await db.select().from(boraProfiles).where(eq(boraProfiles.id, f.profileId))).toEqual(
      [],
    );
    expect(
      await db.select().from(familyPeople).where(eq(familyPeople.id, f.target.personId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(familyAppProfiles)
        .where(
          and(
            eq(familyAppProfiles.personId, f.target.personId),
            eq(familyAppProfiles.app, "bora-treinar"),
          ),
        ),
    ).toEqual([]);
  });
});
