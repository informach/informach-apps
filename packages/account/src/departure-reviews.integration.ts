import { randomUUID } from "node:crypto";
import { getCollectionApps } from "@informach/config/collections";
import { type Database, eq, sql } from "@informach/db";
import * as schema from "@informach/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeEach, expect, it } from "vitest";
import {
  beginDepartureReview,
  cancelDepartureReview,
  claimDepartureAssessment,
  type DepartureAssessment,
  finishDepartureAssessment,
  processDepartureAssessments,
  purgeExpiredDepartureReviews,
  readDepartureReview,
} from "./departure-reviews";

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
const apps = getCollectionApps("compasso")
  .map((app) => app.slug)
  .sort();
const empty: DepartureAssessment = {
  version: 1,
  hasPersonalData: false,
  hasSharedData: false,
  activeCredentials: 0,
  managedProfiles: 0,
  sharedProfiles: 0,
  pendingOperations: 0,
};
let actorId: string;
beforeEach(async () => {
  actorId = randomUUID();
  await db.insert(schema.users).values({
    id: actorId,
    email: `${actorId}@example.test`,
    name: "Avaliação de dados",
    emailVerified: true,
  });
});
afterEach(async () => {
  await db
    .update(schema.accountDepartureReviews)
    .set({ state: "cancelled" })
    .where(eq(schema.accountDepartureReviews.actorId, actorId));
});

it("covers unpublished apps, isolates the actor and cannot call a missing assessment complete", async () => {
  const [id, duplicate] = await Promise.all([
    beginDepartureReview(db, actorId),
    beginDepartureReview(db, actorId),
  ]);
  expect(duplicate).toBe(id);
  const review = await readDepartureReview(db, actorId, id);
  expect(review.apps.map((app) => app.app)).toEqual(apps);
  expect(review.apps.some((app) => app.app === "dia-de-estrela")).toBe(true);
  expect(review.complete).toBe(false);
  expect(review.apps.every((app) => app.result === null)).toBe(true);
  await expect(readDepartureReview(db, actorId, randomUUID())).rejects.toMatchObject({
    code: "not-found",
  });
  await expect(readDepartureReview(db, randomUUID(), id)).rejects.toMatchObject({
    code: "unauthorized",
  });
  await expect(claimDepartureAssessment(db, "edi")).rejects.toMatchObject({
    code: "unsupported-app",
  });
  for (const app of apps.slice(0, -1)) {
    const claim = await claimDepartureAssessment(db, app);
    expect(claim?.actorId).toBe(actorId);
    if (!claim) throw new Error("Expected claim");
    expect(await finishDepartureAssessment(db, claim, empty)).toBe(true);
  }
  expect((await readDepartureReview(db, actorId, id)).complete).toBe(false);
  const final = await claimDepartureAssessment(db, apps.at(-1) ?? "");
  if (!final) throw new Error("Expected final claim");
  expect(await finishDepartureAssessment(db, final, empty)).toBe(true);
  expect(await finishDepartureAssessment(db, final, empty)).toBe(false);
  expect((await readDepartureReview(db, actorId, id)).complete).toBe(true);
  const [identity] = await db.select().from(schema.users).where(eq(schema.users.id, actorId));
  expect(identity).toMatchObject({
    name: "Avaliação de dados",
    emailVerified: true,
    banned: false,
  });
});

it("claims once concurrently and fences an expired worker after reassignment", async () => {
  const id = await beginDepartureReview(db, actorId);
  const claims = await Promise.all([
    claimDepartureAssessment(db, "cozya"),
    claimDepartureAssessment(db, "cozya"),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const old = claims.find((claim) => claim !== null);
  if (!old) throw new Error("Missing claim");
  await db
    .update(schema.accountDepartureAssessments)
    .set({ leaseUntil: new Date(0) })
    .where(eq(schema.accountDepartureAssessments.id, old.id));
  const next = await claimDepartureAssessment(db, "cozya");
  if (!next) throw new Error("Missing replacement claim");
  expect(next.token).not.toBe(old.token);
  expect(await finishDepartureAssessment(db, old, empty)).toBe(false);
  expect(await finishDepartureAssessment(db, next, { ...empty, hasPersonalData: true })).toBe(true);
  const row = (await readDepartureReview(db, actorId, id)).apps.find((app) => app.app === "cozya");
  expect(row?.result?.hasPersonalData).toBe(true);
  const [job] = await db
    .select()
    .from(schema.accountDepartureAssessments)
    .where(eq(schema.accountDepartureAssessments.id, old.id));
  expect(job?.attempts).toBe(2);
});

it("preserves failures for retry without storing raw exceptions or unvalidated content", async () => {
  const id = await beginDepartureReview(db, actorId);
  const outcome = await processDepartureAssessments({
    db,
    app: "cozya",
    assess: async () => {
      throw new Error("PRIVATE_PROVIDER_RESPONSE");
    },
  });
  expect(outcome).toEqual({ completed: 0, failed: 1, discarded: 0 });
  const review = await readDepartureReview(db, actorId, id);
  expect(review.apps.find((app) => app.app === "cozya")).toMatchObject({
    state: "queued",
    retrying: true,
    result: null,
  });
  await db
    .update(schema.accountDepartureAssessments)
    .set({ availableAt: new Date(0) })
    .where(eq(schema.accountDepartureAssessments.reviewId, id));
  const claim = await claimDepartureAssessment(db, "cozya");
  if (!claim) throw new Error("Missing retry");
  await expect(
    finishDepartureAssessment(db, claim, {
      ...empty,
      rawPrompt: "PRIVATE_PROVIDER_RESPONSE",
    } as DepartureAssessment),
  ).rejects.toThrow();
  expect(await finishDepartureAssessment(db, claim, empty)).toBe(true);
  const jobs = await db
    .select()
    .from(schema.accountDepartureAssessments)
    .where(eq(schema.accountDepartureAssessments.reviewId, id));
  expect(JSON.stringify(jobs)).not.toContain("PRIVATE_PROVIDER_RESPONSE");
});

it("fences cancellation and replacement, rejects another owner, and hides expired results", async () => {
  const id = await beginDepartureReview(db, actorId);
  const claim = await claimDepartureAssessment(db, "cozya");
  if (!claim) throw new Error("Missing claim");
  const other = randomUUID();
  await db.insert(schema.users).values({
    id: other,
    email: `${other}@example.test`,
    name: "Outra pessoa",
    emailVerified: true,
  });
  await expect(readDepartureReview(db, other, id)).rejects.toMatchObject({ code: "not-found" });
  await expect(cancelDepartureReview(db, other, id)).rejects.toMatchObject({ code: "not-found" });
  const fresh = await beginDepartureReview(db, actorId, true);
  expect(fresh).not.toBe(id);
  expect(await finishDepartureAssessment(db, claim, empty)).toBe(false);
  expect((await readDepartureReview(db, actorId, id)).state).toBe("cancelled");
  const final = await claimDepartureAssessment(db, "cozya");
  if (!final) throw new Error("Missing fresh claim");
  expect(await finishDepartureAssessment(db, final, empty)).toBe(true);
  await db
    .update(schema.accountDepartureReviews)
    .set({ createdAt: new Date(0), expiresAt: new Date(60000) })
    .where(eq(schema.accountDepartureReviews.id, fresh));
  const expired = await readDepartureReview(db, actorId, fresh);
  expect(expired.expired).toBe(true);
  expect(expired.complete).toBe(false);
  expect(expired.apps.every((app) => app.result === null)).toBe(true);
  expect(await claimDepartureAssessment(db, "agenda-da-turma")).toBeNull();
  expect(await beginDepartureReview(db, actorId)).not.toBe(fresh);
});

it("refuses a revoked identity and requires a fresh manifest after missing catalog coverage", async () => {
  const id = await beginDepartureReview(db, actorId);
  const claim = await claimDepartureAssessment(db, "cozya");
  if (!claim) throw new Error("Missing claim");
  await db.update(schema.users).set({ banned: true }).where(eq(schema.users.id, actorId));
  expect(await finishDepartureAssessment(db, claim, empty)).toBe(false);
  expect(await claimDepartureAssessment(db, "agenda-da-turma")).toBeNull();
  await expect(beginDepartureReview(db, actorId)).rejects.toMatchObject({ code: "unauthorized" });
  await db.update(schema.users).set({ banned: false }).where(eq(schema.users.id, actorId));
  await db
    .delete(schema.accountDepartureAssessments)
    .where(eq(schema.accountDepartureAssessments.id, claim.id));
  expect(await readDepartureReview(db, actorId, id)).toMatchObject({
    stale: true,
    complete: false,
  });
  expect(await beginDepartureReview(db, actorId)).not.toBe(id);
});

it("skips a locked review and services a different account without waiting", async () => {
  const first = await beginDepartureReview(db, actorId);
  const other = randomUUID();
  await db.insert(schema.users).values({
    id: other,
    email: `${other}@example.test`,
    name: "Fila seguinte",
    emailVerified: true,
  });
  const second = await beginDepartureReview(db, other);
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '2000ms'`);
      await tx
        .select()
        .from(schema.accountDepartureReviews)
        .where(eq(schema.accountDepartureReviews.id, first))
        .for("update");
      const claim = await claimDepartureAssessment(db, "cozya");
      expect(claim?.reviewId).toBe(second);
    });
  } finally {
    await cancelDepartureReview(db, other, second);
  }
});

it("purges only aged assessment caches in bounded batches and fences late workers", async () => {
  await purgeExpiredDepartureReviews(db, 500);
  const old = await beginDepartureReview(db, actorId);
  const claim = await claimDepartureAssessment(db, "cozya");
  if (!claim) throw new Error("Missing claim");
  await db
    .update(schema.accountDepartureReviews)
    .set({
      createdAt: sql`clock_timestamp() - interval '26 hours'`,
      expiresAt: sql`clock_timestamp() - interval '25 hours'`,
    })
    .where(eq(schema.accountDepartureReviews.id, old));
  const recent = await beginDepartureReview(db, actorId);
  await db
    .update(schema.accountDepartureReviews)
    .set({
      createdAt: sql`clock_timestamp() - interval '2 hours'`,
      expiresAt: sql`clock_timestamp() - interval '1 hour'`,
    })
    .where(eq(schema.accountDepartureReviews.id, recent));
  const fresh = await beginDepartureReview(db, actorId);
  await db.transaction(async (tx) => {
    await tx
      .select()
      .from(schema.accountDepartureReviews)
      .where(eq(schema.accountDepartureReviews.id, old))
      .for("update");
    expect(await purgeExpiredDepartureReviews(db, 1)).toEqual({ removed: 0 });
  });
  expect(await purgeExpiredDepartureReviews(db, 1)).toEqual({ removed: 1 });
  expect(await finishDepartureAssessment(db, claim, empty)).toBe(false);
  await expect(readDepartureReview(db, actorId, old)).rejects.toMatchObject({ code: "not-found" });
  expect(
    await db
      .select()
      .from(schema.accountDepartureAssessments)
      .where(eq(schema.accountDepartureAssessments.reviewId, old)),
  ).toHaveLength(0);
  expect((await readDepartureReview(db, actorId, recent)).expired).toBe(true);
  expect((await readDepartureReview(db, actorId, fresh)).expired).toBe(false);
  expect(
    await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, actorId)),
  ).toHaveLength(1);
  expect(await purgeExpiredDepartureReviews(db)).toEqual({ removed: 0 });
});
