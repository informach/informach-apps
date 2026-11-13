import { randomUUID } from "node:crypto";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { type Database, eq } from "@informach/db";
import * as schema from "@informach/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, expect, it } from "vitest";
import { assessAppProfileResponsibilities, inspectFamilyDeparture } from "./departure";
import { createFamilyService } from "./index";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Disposable database required");
const connection = postgres(url, { max: 4, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
afterAll(() => connection.end());
async function actor() {
  const id = randomUUID();
  await db
    .insert(schema.users)
    .values({ id, email: `${id}@example.test`, name: "Adulto sintético", emailVerified: true });
  return id;
}
async function inspect(actorId: string) {
  const pages = [];
  for await (const page of inspectFamilyDeparture(db, actorId, async () => {})) pages.push(page);
  return pages;
}

it("distinguishes administration, custody and app authority, including a removed custodian", async () => {
  const source = await actor();
  const target = await actor();
  const outsider = await actor();
  const group = await family.createGroup(source, "Família de avaliação");
  const invitation = await family.createInvitation(source, group.id, `${target}@example.test`);
  await family.acceptInvitation(target, invitation.token);
  const child = await family.createPerson(source, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Pessoa de avaliação",
  });
  const scope = { groupId: group.id, personId: child.id, app: "agenda-da-turma" };
  await family.activateProfile(source, scope, async () => null);
  expect(await assessAppProfileResponsibilities(db, source, scope.app)).toEqual({
    hasPersonalData: false,
    managedProfiles: 1,
    sharedProfiles: 0,
  });
  expect((await assessAppProfileResponsibilities(db, source, "bora-treinar")).managedProfiles).toBe(
    0,
  );
  expect((await assessAppProfileResponsibilities(db, outsider, scope.app)).managedProfiles).toBe(0);
  const initial = await inspect(source);
  expect(initial.find((page) => page.kind === "family.memberships")?.records).toEqual([
    expect.objectContaining({ id: group.id, otherMembers: 1, otherAdministrators: 0 }),
  ]);
  expect(initial.find((page) => page.kind === "family.identity_responsibilities")?.records).toEqual(
    [
      expect.objectContaining({
        id: child.id,
        otherCustodians: 0,
        linkedGroups: 1,
        accessibleGroups: 1,
      }),
    ],
  );
  expect(initial.find((page) => page.kind === "family.profile_responsibilities")?.records).toEqual([
    expect.objectContaining({ personId: child.id, otherManagers: 0, ownAccount: false }),
  ]);
  expect(await inspect(outsider)).toEqual([]);
  const request = await family.requestPersonTransfer(source, {
    ...scope,
    targetUserId: target,
    expectedVersion: child.version,
  });
  await family.resolvePersonTransfer(target, request.id, "accept");
  const transferred = await inspect(source);
  expect(transferred.some((page) => page.kind === "family.identity_responsibilities")).toBe(false);
  expect(transferred.some((page) => page.kind === "family.profile_responsibilities")).toBe(true);
  await family.grantAccess(source, { ...scope, userId: target, action: "manage" });
  expect((await assessAppProfileResponsibilities(db, source, scope.app)).sharedProfiles).toBe(1);
  expect(
    (await inspect(source)).find((page) => page.kind === "family.profile_responsibilities")
      ?.records,
  ).toEqual([expect.objectContaining({ otherManagers: 1 })]);
  const operationId = randomUUID();
  await family.transferAdministration(source, group.id, target);
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId: target, operationId, expectedRevision: 0 }),
  );
  const suspended = await inspect(source);
  expect(suspended.find((page) => page.kind === "family.memberships")?.records).toEqual([
    expect.objectContaining({ otherAdministrators: 0 }),
  ]);
  expect(
    suspended.find((page) => page.kind === "family.profile_responsibilities")?.records,
  ).toEqual([expect.objectContaining({ otherManagers: 0 })]);
  // Suspension does not make another adult's shared history disposable.
  expect((await assessAppProfileResponsibilities(db, source, scope.app)).sharedProfiles).toBe(1);
  await db.transaction((tx) =>
    resumeWebParticipation(tx, { userId: target, operationId, expectedRevision: 1 }),
  );
  await family.transferAdministration(target, group.id, source);
  await family.revokeMember(source, group.id, target);
  expect((await assessAppProfileResponsibilities(db, target, scope.app)).managedProfiles).toBe(0);
  expect((await assessAppProfileResponsibilities(db, source, scope.app)).sharedProfiles).toBe(0);
  // Removing membership does not erase the global responsibility or silently
  // authorize deleting this person's identity during account closure.
  expect(
    (await inspect(target)).find((page) => page.kind === "family.identity_responsibilities")
      ?.records,
  ).toEqual([expect.objectContaining({ id: child.id, accessibleGroups: 0, linkedGroups: 1 })]);
  expect(
    (await inspect(source)).find((page) => page.kind === "family.profile_responsibilities")
      ?.records,
  ).toEqual([expect.objectContaining({ otherManagers: 0 })]);
});

it("visits more than one page and refuses a disabled identity", async () => {
  const user = await actor();
  for (let index = 0; index < 51; index++) await family.createGroup(user, `Grupo ${index}`);
  const pages = await inspect(user);
  const groups = pages.flatMap((page) => (page.kind === "family.memberships" ? page.records : []));
  expect(groups).toHaveLength(51);
  expect(new Set(groups.map((group) => group.id)).size).toBe(51);
  expect(pages.filter((page) => page.kind === "family.memberships")).toHaveLength(2);
  await db.update(schema.users).set({ banned: true }).where(eq(schema.users.id, user));
  await expect(inspect(user)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
});
