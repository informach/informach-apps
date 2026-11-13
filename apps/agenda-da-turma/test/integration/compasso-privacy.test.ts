import { randomUUID } from "node:crypto";
import { db } from "@informach/db";
import { agendaNotices, agendaTasks } from "@informach/db/schema";
import { expect, it } from "vitest";
import { exportAgendaAccount } from "@/features/account/export-repository";
import { createStudentProfile } from "@/features/students/service";
import { agendaFixture, family, value } from "./compasso-fixture";

it("exports only current readable children and the complete reviewed scope of originals", async () => {
  const f = await agendaFixture(true);
  const person = await family.createPerson(f.owner, {
    groupId: f.actor.familyGroupId,
    kind: "dependent",
    displayName: "Private sibling",
  });
  const sibling = value(
    await createStudentProfile(f.actor, { personId: person.id, birthDate: null }),
  );
  await db.insert(agendaTasks).values([
    {
      profileId: f.profile.id,
      createdByUserId: f.owner,
      type: "task",
      title: "Visible task",
      fingerprint: randomUUID(),
    },
    {
      profileId: sibling.id,
      createdByUserId: f.owner,
      type: "task",
      title: "Private sibling task",
      fingerprint: randomUUID(),
    },
  ]);
  await db.insert(agendaNotices).values([
    {
      familyGroupId: f.actor.familyGroupId,
      createdByUserId: f.owner,
      status: "confirmed",
      source: "other",
      text: "Both children original",
      contentHash: randomUUID(),
      sourceProfileIds: [f.profile.id, sibling.id],
      sharedWithinFamily: true,
    },
    {
      familyGroupId: f.actor.familyGroupId,
      createdByUserId: f.owner,
      status: "confirmed",
      source: "other",
      text: "Author private original",
      contentHash: randomUUID(),
      sourceProfileIds: [f.profile.id],
      sharedWithinFamily: false,
    },
    {
      familyGroupId: f.actor.familyGroupId,
      createdByUserId: f.owner,
      status: "confirmed",
      source: "other",
      text: "Shared readable original",
      contentHash: randomUUID(),
      sourceProfileIds: [f.profile.id],
      sharedWithinFamily: true,
    },
  ]);
  await family.grantAccess(f.owner, { ...f.target, action: "read" });
  const exported = await exportAgendaAccount(f.visitor);
  expect(exported.profiles.map((p) => p.id)).toEqual([f.profile.id]);
  expect(exported.actions.map((a) => a.title)).toEqual(["Visible task"]);
  expect(exported.notices.map((n) => n.text)).toEqual(["Shared readable original"]);
  expect(JSON.stringify(exported)).not.toMatch(/Private sibling|Both children|Author private/);
  await family.grantAccess(f.owner, { ...f.target, personId: person.id, action: "read" });
  expect((await exportAgendaAccount(f.visitor)).notices.map((n) => n.text)).toContain(
    "Both children original",
  );
});
it("does not grant an export bypass to the original payer or creator", async () => {
  const f = await agendaFixture(true);
  await db.insert(agendaTasks).values({
    profileId: f.profile.id,
    createdByUserId: f.owner,
    type: "task",
    title: "No creator bypass",
    fingerprint: randomUUID(),
  });
  for (const action of ["read", "manage"] as const)
    await family.grantAccess(f.owner, { ...f.target, action });
  await family.revokeAccess(f.visitor.userId, { ...f.target, userId: f.owner, action: "read" });
  const exported = await exportAgendaAccount(f.actor);
  expect(exported.profiles).toHaveLength(0);
  expect(exported.actions).toHaveLength(0);
  expect(exported.notices).toHaveLength(0);
});
it("rejects a different household and never merges same-name children", async () => {
  const f = await agendaFixture(true),
    other = await agendaFixture(true);
  await expect(
    exportAgendaAccount({ userId: f.owner, familyGroupId: other.actor.familyGroupId }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  const exported = await exportAgendaAccount(f.actor);
  expect(exported.profiles.map((p) => p.id)).toEqual([f.profile.id]);
  expect(exported.profiles[0]?.personId).toBe(f.target.personId);
});
