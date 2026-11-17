import { createHash, randomUUID } from "node:crypto";
import {
  confirmWebClosure,
  readWebClosure,
  type WebClosureAuthority,
} from "@informach/account/closure";
import { createPostgresStore } from "@informach/ai-core/mastra";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { getCollectionApps } from "@informach/config/collections";
import { and, db, eq, inArray } from "@informach/db";
import {
  accountWebClosureSteps,
  accountWebClosures,
  cozyaAiOperations,
  cozyaProfiles,
  cozyaRecipes,
  cozyaTrialClaims,
  creditReservations,
  sessions,
  users,
} from "@informach/db/schema";
import { afterEach, beforeAll, expect, it } from "vitest";
import { executeCozyaClosure, prepareCozyaClosure } from "@/features/account/closure-repository";
import { processCozyaClosures } from "@/features/account/closure-service";
import { purgeLegacyCozyaAi } from "@/features/account/legacy-ai";
import { clearCozyaData } from "@/features/account/repository";
import { env } from "@/lib/env";

const closureFixtures: string[] = [];
afterEach(async () => {
  // Other apps run against this same disposable database. Their real workers
  // must not inherit the deliberately synthetic plans from this boundary test.
  if (closureFixtures.length)
    await db
      .update(accountWebClosureSteps)
      .set({ state: "cancelled", leaseToken: null, leaseUntil: null, completedAt: new Date() })
      .where(
        and(
          inArray(accountWebClosureSteps.closureId, closureFixtures),
          inArray(accountWebClosureSteps.state, ["queued", "running"]),
        ),
      );
  closureFixtures.length = 0;
});

beforeAll(() => {
  if (
    process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
    !["localhost", "127.0.0.1"].includes(new URL(env.DATABASE_URL).hostname)
  )
    throw new Error("Disposable Compasso database required");
});
async function fixture(): Promise<WebClosureAuthority> {
  const actorId = randomUUID();
  await db.insert(users).values({
    id: actorId,
    name: "Closure fixture",
    email: `${actorId}@example.test`,
    emailVerified: true,
  });
  const operationId = randomUUID();
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId: actorId, operationId, expectedRevision: 0 }),
  );
  return { actorId, operationId, frozenRevision: 1 };
}
const recipe = (userId: string) => ({
  userId,
  name: "PRIVATE_RECIPE",
  ingredients: "PRIVATE_INGREDIENTS",
  preparation: "PRIVATE_PREPARATION",
});
const prepare = (authority: WebClosureAuthority) =>
  db.transaction((tx) => prepareCozyaClosure(tx, authority));

it("selects all pages and erases only this adult's content, preserving trial history and identity", async () => {
  const f = await fixture(),
    other = await fixture();
  await db.insert(cozyaRecipes).values(Array.from({ length: 501 }, () => recipe(f.actorId)));
  await db.insert(cozyaRecipes).values(recipe(other.actorId));
  await db.insert(cozyaProfiles).values({ userId: f.actorId, preferences: "PRIVATE_PROFILE" });
  const emailHash = createHash("sha256").update(f.actorId).digest("hex");
  await db.insert(cozyaTrialClaims).values({ userId: f.actorId, emailHash });
  const plan = await prepare(f);
  expect(plan).toMatchObject({ personalRecords: 502, sharedRecords: 0, blockers: [] });
  expect(JSON.stringify(plan)).not.toContain("PRIVATE");
  expect(await prepare(f)).toEqual(plan);
  await db.transaction((tx) => executeCozyaClosure(tx, { ...f, phase: "erase", plan }));
  expect(await db.select().from(cozyaRecipes).where(eq(cozyaRecipes.userId, f.actorId))).toEqual(
    [],
  );
  expect(await db.select().from(cozyaProfiles).where(eq(cozyaProfiles.userId, f.actorId))).toEqual(
    [],
  );
  expect(
    await db.select().from(cozyaRecipes).where(eq(cozyaRecipes.userId, other.actorId)),
  ).toHaveLength(1);
  expect(
    await db.select().from(cozyaTrialClaims).where(eq(cozyaTrialClaims.emailHash, emailHash)),
  ).toHaveLength(1);
  expect(await db.select().from(users).where(eq(users.id, f.actorId))).toHaveLength(1);
});

it("rejects changed selection and forged operation without deleting any content", async () => {
  const f = await fixture();
  await db.insert(cozyaRecipes).values(recipe(f.actorId));
  const plan = await prepare(f);
  await db.insert(cozyaRecipes).values(recipe(f.actorId));
  await expect(
    db.transaction((tx) => executeCozyaClosure(tx, { ...f, phase: "erase", plan })),
  ).rejects.toMatchObject({ code: "stale-plan" });
  await expect(prepare({ ...f, operationId: randomUUID() })).rejects.toMatchObject({
    code: "stale-revision",
  });
  await expect(clearCozyaData(f.actorId)).rejects.toMatchObject({ code: "unavailable" });
  expect(
    await db.select().from(cozyaRecipes).where(eq(cozyaRecipes.userId, f.actorId)),
  ).toHaveLength(2);
});

it("blocks on a reservation even without an HTTP operation or receipt, retaining its financial evidence", async () => {
  const f = await fixture();
  await db.insert(cozyaRecipes).values(recipe(f.actorId));
  const holdId = randomUUID();
  await db.insert(creditReservations).values({
    id: holdId,
    ownerType: "user",
    ownerId: f.actorId,
    app: "cozya",
    feature: "cozya.recipe.extract_from_text",
    estimatedAmount: 1,
    status: "active",
    expiresAt: new Date(0),
  });
  const plan = await prepare(f);
  expect(plan.blockers).toEqual(["pending_operations"]);
  await expect(
    db.transaction((tx) => executeCozyaClosure(tx, { ...f, phase: "resume", plan: null })),
  ).rejects.toThrow("Uma operação de IA");
  expect(
    (await db.select().from(creditReservations).where(eq(creditReservations.id, holdId)))[0]
      ?.status,
  ).toBe("active");
  await db
    .update(creditReservations)
    .set({ status: "released" })
    .where(eq(creditReservations.id, holdId));
  const settled = await prepare(f);
  expect(settled.blockers).toEqual([]);
  expect(settled.fingerprint).toBe(plan.fingerprint);
  await db.transaction((tx) => executeCozyaClosure(tx, { ...f, phase: "erase", plan: settled }));
  expect(
    (await db.select().from(creditReservations).where(eq(creditReservations.id, holdId)))[0]
      ?.status,
  ).toBe("released");
});

it("resumption discards old AI caches, preserves recipes and refuses late cleanup after reopening", async () => {
  const f = await fixture();
  await db.insert(cozyaRecipes).values(recipe(f.actorId));
  const operationId = randomUUID();
  await db.insert(cozyaAiOperations).values({
    id: operationId,
    userId: f.actorId,
    fingerprint: "old-result",
    statusCode: 200,
    response: { private: "OLD_OUTPUT" },
    expiresAt: new Date(Date.now() + 60000),
  });
  await db.transaction((tx) => executeCozyaClosure(tx, { ...f, phase: "resume", plan: null }));
  expect(
    (await db.select().from(cozyaAiOperations).where(eq(cozyaAiOperations.id, operationId)))[0],
  ).toMatchObject({ response: null, statusCode: 410 });
  expect(
    await db.select().from(cozyaRecipes).where(eq(cozyaRecipes.userId, f.actorId)),
  ).toHaveLength(1);
  await db.transaction((tx) =>
    resumeWebParticipation(tx, {
      userId: f.actorId,
      operationId: f.operationId,
      expectedRevision: 1,
    }),
  );
  const freshId = randomUUID();
  await db.insert(cozyaAiOperations).values({
    id: freshId,
    userId: f.actorId,
    webParticipationRevision: 2,
    fingerprint: "new-result",
    statusCode: 200,
    response: { private: "NEW_OUTPUT" },
    expiresAt: new Date(Date.now() + 60000),
  });
  await expect(
    db.transaction((tx) => executeCozyaClosure(tx, { ...f, phase: "resume", plan: null })),
  ).rejects.toMatchObject({ code: "stale-revision" });
  expect(
    (await db.select().from(cozyaAiOperations).where(eq(cozyaAiOperations.id, freshId)))[0]
      ?.response,
  ).toEqual({ private: "NEW_OUTPUT" });
});

it("requires provider cleanup before the database receipt and keeps another app's memory", async () => {
  const f = await fixture();
  await db.insert(cozyaRecipes).values(recipe(f.actorId));
  const store = createPostgresStore({
    connectionString: env.DATABASE_URL,
    disableInit: true,
    max: 1,
  });
  const memory = await store.getStore("memory");
  if (!memory) throw new Error("Mastra memory required");
  const own = `cozya:${f.actorId}:${randomUUID()}`,
    other = `agenda:${f.actorId}:${randomUUID()}`;
  try {
    for (const id of [own, other])
      await memory.saveThread({
        thread: {
          id,
          resourceId: f.actorId,
          title: "PRIVATE_MEMORY",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    const plan = await prepare(f);
    await expect(
      db.transaction((tx) => executeCozyaClosure(tx, { ...f, phase: "erase", plan })),
    ).rejects.toThrow("Uma operação de IA");
    expect(
      await db.select().from(cozyaRecipes).where(eq(cozyaRecipes.userId, f.actorId)),
    ).toHaveLength(1);
    expect(await purgeLegacyCozyaAi(f.actorId)).toBe(1);
    expect(await purgeLegacyCozyaAi(f.actorId)).toBe(0);
    await db.transaction((tx) => executeCozyaClosure(tx, { ...f, phase: "erase", plan }));
    expect(await memory.getThreadById({ threadId: own })).toBeNull();
    expect(await memory.getThreadById({ threadId: other })).not.toBeNull();
  } finally {
    await memory.deleteThread({ threadId: own });
    await memory.deleteThread({ threadId: other });
    await store.close();
  }
});

it("retains unrelated shared-resource metadata and a foreign span even in the same trace", async () => {
  const f = await fixture();
  const store = createPostgresStore({
    connectionString: env.DATABASE_URL,
    disableInit: true,
    max: 1,
  });
  const memory = await store.getStore("memory");
  if (!memory) throw new Error("Mastra memory required");
  const own = `cozya:${f.actorId}:${randomUUID()}`,
    traceId = randomUUID();
  try {
    await memory.saveThread({
      thread: {
        id: own,
        resourceId: f.actorId,
        title: "PRIVATE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await memory.saveResource({
      resource: {
        id: f.actorId,
        workingMemory: "# Perfil culinário do usuário\nPRIVATE",
        metadata: { independentApp: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    for (const app of ["cozya", "edi"])
      await store.db.none(
        `INSERT INTO ai_mastra.mastra_ai_spans ("traceId", "spanId", name, "spanType", "isEvent", "startedAt", "serviceName", "userId") VALUES ($1, $2, 'Synthetic privacy span', 'agent_run', false, now(), $2, $3)`,
        [traceId, app, f.actorId],
      );
    await purgeLegacyCozyaAi(f.actorId);
    expect((await memory.getResourceById({ resourceId: f.actorId }))?.metadata).toEqual({
      independentApp: true,
    });
    expect((await memory.getResourceById({ resourceId: f.actorId }))?.workingMemory).toBeFalsy();
    expect(
      await store.db.any<{ spanId: string }>(
        `SELECT "spanId" FROM ai_mastra.mastra_ai_spans WHERE "traceId" = $1`,
        [traceId],
      ),
    ).toEqual([{ spanId: "edi" }]);
  } finally {
    await memory.deleteThread({ threadId: own });
    await store.db.none(`DELETE FROM ai_mastra.mastra_ai_spans WHERE "traceId" = $1`, [traceId]);
    await store.db.none(`DELETE FROM ai_mastra.mastra_resources WHERE id = $1`, [f.actorId]);
    await store.close();
  }
});

it("the real app worker commits cleanup and its durable receipt while other domains remain pending", async () => {
  const f = await fixture();
  await db.insert(cozyaRecipes).values(recipe(f.actorId));
  const catalog = getCollectionApps("compasso")
    .map((app) => app.slug)
    .sort();
  const domains = ["billing", "family", ...catalog.map((app) => `app:${app}`)].sort();
  closureFixtures.push(f.operationId);
  await db.insert(accountWebClosures).values({
    id: f.operationId,
    actorId: f.actorId,
    sourceReviewId: randomUUID(),
    catalog,
    frozenRevision: f.frozenRevision,
  });
  // The other domains contain no test data. This fixture supplies only their
  // preparation receipts; it never pretends to run or complete their erasure.
  const preparations: (typeof accountWebClosureSteps.$inferInsert)[] = domains.map((domain) =>
    domain === "app:cozya"
      ? { closureId: f.operationId, domain, phase: "prepare" }
      : {
          closureId: f.operationId,
          domain,
          phase: "prepare",
          state: "done",
          completedAt: new Date(),
          plan: {
            version: 1,
            fingerprint: createHash("sha256").update(domain).digest("hex"),
            personalRecords: 0,
            sharedRecords: 0,
            credentials: 0,
            blockers: [],
          },
        },
  );
  await db.insert(accountWebClosureSteps).values(preparations);
  expect(await processCozyaClosures()).toEqual({ completed: 1, failed: 0, discarded: 0 });
  const sessionId = randomUUID();
  await db.insert(sessions).values({
    id: sessionId,
    userId: f.actorId,
    token: randomUUID(),
    originApp: "conta",
    expiresAt: new Date(Date.now() + 3600000),
  });
  const actor = { actorId: f.actorId, sessionId };
  const view = await readWebClosure(db, actor, f.operationId);
  if (!view.digest) throw new Error("Missing prepared digest");
  await confirmWebClosure(db, actor, f.operationId, view.digest);
  expect(await processCozyaClosures()).toEqual({ completed: 0, failed: 0, discarded: 0 });
  // No billing facts exist here; establish its prior receipt to exercise ordering.
  await db
    .update(accountWebClosureSteps)
    .set({ state: "done", completedAt: new Date() })
    .where(
      and(
        eq(accountWebClosureSteps.closureId, f.operationId),
        eq(accountWebClosureSteps.domain, "billing"),
        eq(accountWebClosureSteps.phase, "erase"),
      ),
    );
  expect(await processCozyaClosures()).toEqual({ completed: 1, failed: 0, discarded: 0 });
  expect(await processCozyaClosures()).toEqual({ completed: 0, failed: 0, discarded: 0 });
  expect(await db.select().from(cozyaRecipes).where(eq(cozyaRecipes.userId, f.actorId))).toEqual(
    [],
  );
  const result = await readWebClosure(db, actor, f.operationId);
  expect(result.state).toBe("executing");
  expect(
    result.steps.find((step) => step.domain === "app:cozya" && step.phase === "erase")?.state,
  ).toBe("done");
  expect(result.steps.some((step) => step.phase === "erase" && step.state === "queued")).toBe(true);
});
