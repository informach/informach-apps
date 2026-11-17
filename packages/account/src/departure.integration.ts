import { randomUUID } from "node:crypto";
import { isRecentCentralAuthentication } from "@informach/auth/web-sessions";
import { type Database, eq } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, expect, it } from "vitest";
import { inspectAccountDeparture } from "./departure";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Disposable database required");
const connection = postgres(url, { max: 4, prepare: false });
const db: Database = drizzle(connection, { schema });
afterAll(() => connection.end());

it("detects independent Edi records even without billing while isolating another person's devices", async () => {
  const actorId = randomUUID();
  const otherId = randomUUID();
  await db.insert(schema.users).values(
    [actorId, otherId].map((id) => ({
      id,
      name: "Conta independente",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const device = (userId: string) => {
    const id = randomUUID();
    return {
      id,
      userId,
      name: "PRIVATE_DEVICE_NAME",
      publicKeySpki: "PRIVATE_DEVICE_KEY",
      keyThumbprint: id.replaceAll("-", "").repeat(2),
    };
  };
  const foreign = device(otherId);
  await db.insert(schema.ediDevices).values(foreign);
  const read = async () => {
    for await (const record of inspectAccountDeparture({ db, actorId, authorize: async () => {} }))
      if (record.kind === "edi.identity_dependencies") return record.data;
    throw new Error("Missing Edi dependency assessment");
  };
  expect(await read()).toEqual({
    devicesPresent: false,
    licenseRecordPresent: false,
    pendingOperationPresent: false,
    replayProofsPresent: false,
  });
  const own = device(actorId);
  await db.insert(schema.ediDevices).values(own);
  await db.insert(schema.ediEntitlements).values({ userId: actorId });
  const nonce = randomUUID();
  await db
    .insert(schema.ediRequestNonces)
    .values({ nonce, userId: actorId, expiresAt: new Date(Date.now() + 60000) });
  const [job] = await db
    .insert(schema.ediOutbox)
    .values({ dedupeKey: randomUUID(), kind: "revoke_device", subjectId: own.id })
    .returning();
  if (!job) throw new Error("Missing Edi fixture job");
  expect(await read()).toEqual({
    devicesPresent: true,
    licenseRecordPresent: true,
    pendingOperationPresent: true,
    replayProofsPresent: true,
  });
  expect(
    (await db.select().from(schema.ediDevices).where(eq(schema.ediDevices.id, own.id)))[0],
  ).toMatchObject(own);
  expect(
    (await db.select().from(schema.ediOutbox).where(eq(schema.ediOutbox.id, job.id)))[0],
  ).toMatchObject({ attempts: 0, processedAt: null });
  await db
    .update(schema.ediOutbox)
    .set({ processedAt: new Date() })
    .where(eq(schema.ediOutbox.id, job.id));
  expect((await read()).pendingOperationPresent).toBe(false);
  await db
    .insert(schema.ediOutbox)
    .values({ dedupeKey: randomUUID(), kind: "reconcile_entitlement", subjectId: actorId });
  expect((await read()).pendingOperationPresent).toBe(true);
  await db.update(schema.users).set({ banned: true }).where(eq(schema.users.id, actorId));
  await expect(read()).rejects.toMatchObject({ name: "UnauthorizedError" });
});

it("composes responsibility and independent identity facts without changing access or granting a trial", async () => {
  const actorId = randomUUID();
  await db.insert(schema.users).values({
    id: actorId,
    name: "Conta de avaliação",
    email: `${actorId}@example.test`,
    emailVerified: true,
    role: "owner",
  });
  const family = createFamilyService({ db });
  const group = await family.createGroup(actorId, "Família de avaliação");
  await family.createPerson(actorId, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Pessoa de avaliação",
  });
  await db.insert(schema.customers).values({
    app: "edi",
    subjectType: "user",
    subjectId: actorId,
    email: "PRIVATE_BILLING_EMAIL",
    provider: "stripe",
    providerCustomerId: `cus_${randomUUID()}`,
    metadata: { note: "PRIVATE_PROVIDER_DATA" },
  });
  const sessionId = randomUUID();
  const deviceId = randomUUID();
  await db.insert(schema.ediDevices).values({
    id: deviceId,
    userId: actorId,
    name: "PRIVATE_DEVICE_NAME",
    publicKeySpki: "PRIVATE_DEVICE_KEY",
    keyThumbprint: deviceId.replaceAll("-", "").repeat(2),
  });
  await db.insert(schema.sessions).values({
    id: sessionId,
    userId: actorId,
    token: `PRIVATE_SESSION_TOKEN_${randomUUID()}`,
    originApp: "conta",
    expiresAt: new Date(Date.now() + 60000),
  });
  const authorize = async () => {
    if (!(await isRecentCentralAuthentication(actorId, sessionId, 900, db)))
      throw new Error("Session revoked");
  };
  const records = [];
  for await (const record of inspectAccountDeparture({ db, actorId, authorize }))
    records.push(record);
  expect(records[0]).toMatchObject({
    kind: "account.identity_dependencies",
    scope: "compasso-web",
    data: { hasStaffRole: true },
  });
  expect(records.some((record) => record.kind === "family.identity_responsibilities")).toBe(true);
  expect(records.find((record) => record.kind === "billing.independent_products")).toMatchObject({
    records: [{ app: "edi" }],
  });
  expect(records.find((record) => record.kind === "edi.identity_dependencies")).toEqual({
    kind: "edi.identity_dependencies",
    data: {
      devicesPresent: true,
      licenseRecordPresent: false,
      pendingOperationPresent: false,
      replayProofsPresent: false,
    },
  });
  expect(
    await db
      .select({ id: schema.ediDevices.id })
      .from(schema.ediDevices)
      .where(eq(schema.ediDevices.id, deviceId)),
  ).toHaveLength(1);
  expect(JSON.stringify(records)).not.toContain("PRIVATE_");
  expect(
    await db
      .select()
      .from(schema.collectionTrials)
      .where(eq(schema.collectionTrials.startedBy, actorId)),
  ).toHaveLength(0);
  expect(await family.listGroups(actorId)).toHaveLength(1);
  const generator = inspectAccountDeparture({ db, actorId, authorize });
  expect((await generator.next()).done).toBe(false);
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  await expect(generator.next()).rejects.toThrow("Session revoked");
});
