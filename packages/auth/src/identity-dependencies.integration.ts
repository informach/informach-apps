import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import * as schema from "@informach/db/schema";
import { expect, it } from "vitest";
import { inspectSharedIdentityDependencies } from "./identity-dependencies";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Disposable database required");

it("preserves independent identity facts without exposing credentials or mixing web consent", async () => {
  const owner = randomUUID();
  const member = randomUUID();
  await db.insert(schema.users).values([
    {
      id: owner,
      name: "Responsável",
      email: `${owner}@example.test`,
      emailVerified: true,
      role: "owner",
    },
    { id: member, name: "Outro adulto", email: `${member}@example.test`, emailVerified: true },
  ]);
  const organization = randomUUID();
  await db
    .insert(schema.organizations)
    .values({ id: organization, name: "PRIVATE_ORGANIZATION", slug: randomUUID() });
  await db
    .insert(schema.members)
    .values({ id: randomUUID(), userId: owner, organizationId: organization, role: "owner" });
  const client = randomUUID();
  await db.insert(schema.oauthClients).values({
    id: client,
    clientId: client,
    clientSecret: "PRIVATE_CLIENT_SECRET",
    redirectUris: ["http://localhost:1"],
  });
  const now = new Date();
  await db.insert(schema.oauthConsents).values({
    id: randomUUID(),
    clientId: client,
    userId: owner,
    scopes: ["openid"],
    createdAt: now,
    updatedAt: now,
  });
  const web = randomUUID();
  await db
    .insert(schema.ssoClients)
    .values({ id: web, clientId: web, redirectUris: ["http://localhost:2"] });
  await db.insert(schema.ssoConsents).values({
    id: randomUUID(),
    clientId: web,
    userId: member,
    scopes: ["openid"],
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.sessions).values([
    {
      id: randomUUID(),
      userId: owner,
      token: `PRIVATE_TOKEN_${randomUUID()}`,
      expiresAt: new Date(now.getTime() + 60000),
    },
    {
      id: randomUUID(),
      userId: member,
      token: `PRIVATE_TOKEN_${randomUUID()}`,
      originApp: "conta",
      expiresAt: new Date(now.getTime() + 60000),
    },
  ]);
  const before = await inspectSharedIdentityDependencies(db, owner);
  expect(before).toMatchObject({
    hasStaffRole: true,
    hasOtherRole: false,
    organizationMemberships: 1,
    desktopAuthorizationPresent: true,
    unscopedLiveSessions: 1,
  });
  const plain = await inspectSharedIdentityDependencies(db, member);
  expect(plain).toMatchObject({
    hasStaffRole: false,
    organizationMemberships: 0,
    desktopAuthorizationPresent: false,
    unscopedLiveSessions: 0,
  });
  expect(JSON.stringify(before)).not.toContain("PRIVATE_");
  expect(
    await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, owner)),
  ).toHaveLength(1);
  await db.update(schema.users).set({ banned: true }).where(eq(schema.users.id, owner));
  await expect(inspectSharedIdentityDependencies(db, owner)).rejects.toMatchObject({
    name: "UnauthorizedError",
  });
});
