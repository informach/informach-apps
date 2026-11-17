import { randomUUID } from "node:crypto";
import { closeWebParticipation, freezeWebParticipation } from "@informach/auth/web-participation";
import { type Database, eq } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, expect, it } from "vitest";
import { closureDomains } from "./closure-contract";
import { accountExportJson, exportAccountRecords } from "./privacy";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Disposable PostgreSQL required");
const connection = postgres(url, { max: 4, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
afterAll(() => connection.end());

async function actor() {
  const id = randomUUID();
  await db
    .insert(schema.users)
    .values({ id, name: "Exportação de conta", email: `${id}@example.test`, emailVerified: true });
  return id;
}
async function asText(source: AsyncIterable<Uint8Array>) {
  const decoder = new TextDecoder();
  let result = "";
  for await (const bytes of source) result += decoder.decode(bytes, { stream: true });
  return result + decoder.decode();
}
const authorize = async () => {};

it("exports all authorized family pages and wallet entries without private people or metadata", async () => {
  const owner = await actor();
  const member = await actor();
  const group = await family.createGroup(owner, "Visible group");
  const child = await family.createPerson(owner, {
    groupId: group.id,
    kind: "dependent",
    displayName: "PRIVATE_CHILD_NAME",
  });
  await family.activateProfile(
    owner,
    { groupId: group.id, personId: child.id, app: "agenda-da-turma" },
    async () => null,
  );
  const invitation = await family.createInvitation(owner, group.id, `${member}@example.test`);
  await family.acceptInvitation(member, invitation.token);
  await db.insert(schema.creditLedger).values(
    Array.from({ length: 45 }, () => ({
      ownerType: "family" as const,
      ownerId: group.id,
      app: "compasso",
      entryType: "promo_grant" as const,
      amount: 1,
      metadata: { private: "PRIVATE_LEDGER_PAYLOAD" },
    })),
  );
  // More groups than one export page, without creating another person's authority.
  for (let index = 0; index < 21; index++)
    await family.createGroup(member, `Extra family ${index}`);
  let completed = false;
  const copy = await asText(
    accountExportJson({ db, actorId: member, authorize }, async () => {
      completed = true;
    }),
  );
  expect(completed).toBe(true);
  expect(copy).toContain('"completedAt":');
  expect(copy).toContain("Extra family 20");
  expect(copy.match(/"kind":"family.current_access"/g)).toHaveLength(22);
  expect(copy.match(/"type":"promo_grant"/g)).toHaveLength(45);
  for (const hidden of [
    "PRIVATE_CHILD_NAME",
    "PRIVATE_LEDGER_PAYLOAD",
    invitation.token,
    "tokenHash",
    "password",
    "webTwoFactors",
  ])
    expect(copy).not.toContain(hidden);
  expect(() => JSON.parse(copy)).not.toThrow();
});

it("stops on revoked membership between wallet pages instead of sealing a partial copy", async () => {
  const owner = await actor();
  const member = await actor();
  const group = await family.createGroup(owner, "Revocable group");
  const invitation = await family.createInvitation(owner, group.id, `${member}@example.test`);
  await family.acceptInvitation(member, invitation.token);
  await db.insert(schema.creditLedger).values(
    Array.from({ length: 45 }, () => ({
      ownerType: "family" as const,
      ownerId: group.id,
      app: "compasso",
      entryType: "promo_grant" as const,
      amount: 1,
    })),
  );
  const records = exportAccountRecords({ db, actorId: member, authorize });
  let firstWallet = false;
  for (let step = 0; step < 5 && !firstWallet; step++) {
    const record = await records.next();
    firstWallet = !record.done && record.value.kind === "family.credit_statement";
  }
  expect(firstWallet).toBe(true);
  await family.revokeMember(owner, group.id, member);
  await expect(records.next()).rejects.toMatchObject({ code: "ACCESS_DENIED" });
});

it("exports paged consent history after closure without re-exposing family content or another account's process", async () => {
  const owner = await actor(),
    other = await actor();
  await family.createGroup(owner, "FAMILY_NO_LONGER_VISIBLE");
  const operationId = randomUUID(),
    otherOperation = randomUUID();
  await db.insert(schema.accountWebClosures).values(
    [owner, other].map((actorId, index) => ({
      id: index === 0 ? operationId : otherOperation,
      actorId,
      sourceReviewId: randomUUID(),
      catalog: closureDomains()
        .filter((domain) => domain.startsWith("app:"))
        .map((domain) => domain.slice(4)),
      frozenRevision: 1,
      state: "completed" as const,
      consentDigest: "a".repeat(64),
      confirmedAt: new Date(),
      completedAt: new Date(),
    })),
  );
  const plans = closureDomains().map((domain) => ({
    domain,
    plan: {
      version: 1 as const,
      fingerprint: "b".repeat(64),
      personalRecords: 1,
      sharedRecords: 2,
      credentials: 3,
      blockers: [],
    },
  }));
  await db.insert(schema.accountWebClosureConsents).values(
    Array.from({ length: 51 }, (_, index) => ({
      closureId: operationId,
      revision: index + 1,
      digest: "a".repeat(64),
      plans,
    })),
  );
  await db
    .insert(schema.accountWebClosureConsents)
    .values({ closureId: otherOperation, revision: 1, digest: "c".repeat(64), plans });
  await db.transaction(async (tx) => {
    await freezeWebParticipation(tx, { userId: owner, operationId, expectedRevision: 0 });
    await closeWebParticipation(tx, { userId: owner, operationId, expectedRevision: 1 });
  });
  const copy = await asText(accountExportJson({ db, actorId: owner, authorize }));
  expect(copy).toContain('"state":"closed"');
  expect(copy).toContain('"revision":51');
  expect(copy.match(/"kind":"account.closure_consents"/g)).toHaveLength(2);
  expect(copy).toContain(operationId);
  for (const hidden of [
    otherOperation,
    "FAMILY_NO_LONGER_VISIBLE",
    "c".repeat(64),
    "fingerprint",
    "leaseToken",
    "sourceReviewId",
  ])
    expect(copy).not.toContain(hidden);
  expect(copy).toContain('"completedAt":');
});

it("does not emit cached identity after cancellation, and does not seal after an audit failure", async () => {
  const owner = await actor();
  const controller = new AbortController();
  let completed = false;
  const stream = accountExportJson(
    { db, actorId: owner, authorize, signal: controller.signal },
    async () => {
      completed = true;
    },
  );
  expect((await stream.next()).done).toBe(false);
  controller.abort();
  await expect(stream.next()).rejects.toThrow();
  expect(completed).toBe(false);
  await expect(
    asText(
      accountExportJson({ db, actorId: owner, authorize }, async () => {
        throw new Error("Synthetic audit failure");
      }),
    ),
  ).rejects.toThrow("Synthetic audit failure");
  await db.update(schema.users).set({ banned: true }).where(eq(schema.users.id, owner));
  await expect(asText(accountExportJson({ db, actorId: owner, authorize }))).rejects.toThrow(
    "Export account is unavailable",
  );
});
