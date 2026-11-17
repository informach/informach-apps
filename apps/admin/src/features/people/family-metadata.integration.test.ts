import { randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  agendaStudentProfiles,
  estrelaChildren,
  estrelaCompletions,
  estrelaFamilies,
  estrelaTasks,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { describe, expect, it } from "vitest";
import { readDb } from "@/lib/read-db";
import { productPresenceFor, usageCounts } from "./repository";

describe("canonical household metadata through the read-only administration connection", () => {
  it("counts current membership and readable profiles without treating the creator as the current authority", async () => {
    const owner = randomUUID();
    const guest = randomUUID();
    for (const id of [owner, guest])
      await db
        .insert(users)
        .values({ id, name: "Synthetic adult", email: `${id}@example.test`, emailVerified: true });
    const family = createFamilyService({ db });
    const group = await family.createGroup(owner, "Private household name");
    const invite = await family.createInvitation(owner, group.id, `${guest}@example.test`);
    await family.acceptInvitation(guest, invite.token);
    await db
      .insert(estrelaFamilies)
      .values({ familyGroupId: group.id, userId: owner, onboardedAt: new Date() });
    const person = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "NEVER EXPOSE THIS NAME",
    });
    const activation = await family.activateProfile(
      owner,
      { groupId: group.id, personId: person.id, app: "dia-de-estrela" },
      async (tx, familyProfileId) => {
        const [child] = await tx
          .insert(estrelaChildren)
          .values({ familyProfileId, userId: owner })
          .returning({ id: estrelaChildren.id });
        if (!child) throw new Error("Missing child");
        return child;
      },
    );
    const [task] = await db
      .insert(estrelaTasks)
      .values({
        childId: activation.value.id,
        title: "NEVER EXPOSE THIS TASK",
        icon: "star",
        time: "08:00",
        days: 127,
        stars: 2,
      })
      .returning({ id: estrelaTasks.id });
    if (!task) throw new Error("Missing task");
    await db.insert(estrelaCompletions).values({
      childId: activation.value.id,
      taskId: task.id,
      date: "2026-11-01",
      markedBy: "child",
      status: "approved",
      stars: 2,
    });
    expect((await productPresenceFor([guest])).presence.get(guest)?.has("dia-de-estrela")).toBe(
      true,
    );
    const initial = await usageCounts(guest);
    expect(initial.estrela).toMatchObject({
      present: true,
      children: 0,
      completions: 0,
      guardianIn: 1,
    });
    await family.grantAccess(owner, {
      groupId: group.id,
      personId: person.id,
      app: "dia-de-estrela",
      userId: guest,
      action: "read",
    });
    const allowed = await usageCounts(guest);
    expect(allowed.estrela).toMatchObject({ children: 1, completions: 1 });
    expect(JSON.stringify(allowed)).not.toContain("NEVER EXPOSE");
    await family.revokeAccess(owner, {
      groupId: group.id,
      personId: person.id,
      app: "dia-de-estrela",
      userId: guest,
      action: "read",
    });
    expect((await usageCounts(guest)).estrela.children).toBe(0);
    await family.revokeMember(owner, group.id, guest);
    expect((await productPresenceFor([guest])).presence.has(guest)).toBe(false);
    expect((await usageCounts(guest)).estrela.present).toBe(false);
    // A coding error in a screen cannot mutate even this disposable fixture.
    await expect(
      readDb().execute(sql`update ${users} set name = 'forbidden' where id = ${owner}`),
    ).rejects.toThrow();
    expect(
      (await db.select({ name: users.name }).from(users).where(eq(users.id, owner)))[0]?.name,
    ).toBe("Synthetic adult");
  });
});

it("counts Agenda access per canonical family and forgets revoked grants without exposing school data", async () => {
  const owner = randomUUID(),
    guest = randomUUID();
  for (const id of [owner, guest])
    await db
      .insert(users)
      .values({ id, name: "Synthetic", email: `${id}@example.test`, emailVerified: true });
  const family = createFamilyService({ db });
  const group = await family.createGroup(owner, "PRIVATE FAMILY");
  const invite = await family.createInvitation(owner, group.id, `${guest}@example.test`);
  await family.acceptInvitation(guest, invite.token);
  const person = await family.createPerson(owner, {
    groupId: group.id,
    kind: "dependent",
    displayName: "PRIVATE CHILD",
  });
  await family.activateProfile(
    owner,
    { groupId: group.id, personId: person.id, app: "agenda-da-turma" },
    async (tx, familyProfileId) => {
      await tx.insert(agendaStudentProfiles).values({ familyProfileId });
    },
  );
  expect(
    (await productPresenceFor([guest])).presence.get(guest)?.has("agenda-da-turma") ?? false,
  ).toBe(false);
  expect((await usageCounts(guest)).agenda).toMatchObject({ childProfiles: 0, guestIn: 0 });
  const target = {
    groupId: group.id,
    personId: person.id,
    app: "agenda-da-turma",
    userId: guest,
    action: "read" as const,
  };
  await family.grantAccess(owner, target);
  expect((await productPresenceFor([guest])).presence.get(guest)?.has("agenda-da-turma")).toBe(
    true,
  );
  const permitted = await usageCounts(guest);
  expect(permitted.agenda).toMatchObject({ childProfiles: 1, guestIn: 1, invitedAdults: 0 });
  expect(JSON.stringify(permitted)).not.toContain("PRIVATE");
  expect((await usageCounts(owner)).agenda.invitedAdults).toBe(1);
  await family.revokeAccess(owner, target);
  expect((await usageCounts(guest)).agenda).toMatchObject({ childProfiles: 0, guestIn: 0 });
  expect((await usageCounts(owner)).agenda.invitedAdults).toBe(0);
  expect(
    (await productPresenceFor([guest])).presence.get(guest)?.has("agenda-da-turma") ?? false,
  ).toBe(false);
});
