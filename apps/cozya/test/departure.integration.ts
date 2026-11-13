import { randomUUID } from "node:crypto";
import {
  beginDepartureReview,
  cancelDepartureReview,
  readDepartureReview,
} from "@informach/account/departure-reviews";
import { createPostgresStore } from "@informach/ai-core/mastra";
import { and, db, desc, eq, sql } from "@informach/db";
import {
  accountDepartureAssessments,
  cozyaAiOperations,
  cozyaRecipes,
  jobRuns,
  users,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import { POST } from "@/app/api/jobs/account-departure/route";
import { assessCozyaDeparture } from "@/features/account/departure-repository";
import { env } from "@/lib/env";

async function actor() {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    name: "Dados particulares",
    email: `${id}@example.test`,
    emailVerified: true,
  });
  return id;
}

it("assesses personal content without returning or changing another adult's data", async () => {
  const owner = await actor();
  const other = await actor();
  const recipe = {
    name: "PRIVATE_RECIPE_NAME",
    ingredients: "PRIVATE_INGREDIENTS",
    preparation: "PRIVATE_PREPARATION",
  };
  await db.insert(cozyaRecipes).values({ userId: other, ...recipe });
  expect(await assessCozyaDeparture(owner)).toEqual({
    version: 1,
    hasPersonalData: false,
    hasSharedData: false,
    activeCredentials: 0,
    managedProfiles: 0,
    sharedProfiles: 0,
    pendingOperations: 0,
  });
  const [own] = await db
    .insert(cozyaRecipes)
    .values({ userId: owner, ...recipe })
    .returning();
  const result = await assessCozyaDeparture(owner);
  expect(result.hasPersonalData).toBe(true);
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
  expect((await db.select().from(cozyaRecipes).where(eq(cozyaRecipes.userId, owner)))[0]).toEqual(
    own,
  );
  expect(await db.select().from(cozyaRecipes).where(eq(cozyaRecipes.userId, other))).toHaveLength(
    1,
  );
});

it("detects pending AI even after its local expiry without recovering or charging it", async () => {
  const owner = await actor();
  const id = randomUUID();
  await db.insert(cozyaAiOperations).values({
    id,
    userId: owner,
    fingerprint: "synthetic-departure-operation",
    expiresAt: new Date(0),
    response: null,
    statusCode: null,
  });
  expect((await assessCozyaDeparture(owner)).pendingOperations).toBe(1);
  const [operation] = await db.select().from(cozyaAiOperations).where(eq(cozyaAiOperations.id, id));
  expect(operation).toMatchObject({ response: null, statusCode: null });
});

it("detects only owned Cozya legacy memory while preserving all threads", async () => {
  const owner = await actor();
  const store = createPostgresStore({
    connectionString: env.DATABASE_URL,
    disableInit: true,
    max: 1,
  });
  const memory = await store.getStore("memory");
  if (!memory) throw new Error("Mastra unavailable");
  const other = `agenda:${owner}:${randomUUID()}`;
  const own = `cozya:${owner}:${randomUUID()}`;
  try {
    await memory.saveThread({
      thread: {
        id: other,
        resourceId: owner,
        title: "PRIVATE_OTHER_APP",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    expect((await assessCozyaDeparture(owner)).hasPersonalData).toBe(false);
    await memory.saveThread({
      thread: {
        id: own,
        resourceId: owner,
        title: "PRIVATE_COZYA",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    expect((await assessCozyaDeparture(owner)).hasPersonalData).toBe(true);
    expect(await memory.getThreadById({ threadId: own })).not.toBeNull();
    expect(await memory.getThreadById({ threadId: other })).not.toBeNull();
  } finally {
    await memory.deleteThread({ threadId: own });
    await memory.deleteThread({ threadId: other });
    await store.close();
  }
});

it("authenticates the worker route and collects only the app fixed in server composition", async () => {
  const owner = await actor();
  const id = await beginDepartureReview(db, owner);
  try {
    const unauthorized = await POST(
      new Request("http://localhost/api/jobs/account-departure", { method: "POST" }),
    );
    expect(unauthorized.status).toBe(401);
    expect(
      (await readDepartureReview(db, owner, id)).apps.every((app) => app.state === "queued"),
    ).toBe(true);
    const result = await POST(
      new Request("http://localhost/api/jobs/account-departure", {
        method: "POST",
        headers: { authorization: `Bearer ${env.CRON_SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ app: "agenda-da-turma", actorId: randomUUID() }),
      }),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      completed: 1,
      failed: 0,
      discarded: 0,
      closuresCompleted: 0,
      assessmentsCompleted: 1,
    });
    const review = await readDepartureReview(db, owner, id);
    expect(review.complete).toBe(false);
    expect(review.apps.find((app) => app.app === "cozya")?.state).toBe("done");
    expect(
      review.apps.filter((app) => app.app !== "cozya").every((app) => app.state === "queued"),
    ).toBe(true);
  } finally {
    await cancelDepartureReview(db, owner, id);
  }
});

it("records a timed-out assessment as an operational failure and retries after contention clears", async () => {
  const owner = await actor();
  const id = await beginDepartureReview(db, owner);
  const request = () =>
    new Request("http://localhost/api/jobs/account-departure", {
      method: "POST",
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`lock table cozya.recipes in access exclusive mode`);
      const response = await POST(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        completed: 0,
        failed: 1,
        discarded: 0,
        closuresCompleted: 0,
        assessmentsCompleted: 0,
      });
      const [run] = await db
        .select()
        .from(jobRuns)
        .where(and(eq(jobRuns.app, "cozya"), eq(jobRuns.job, "account-departure")))
        .orderBy(desc(jobRuns.startedAt))
        .limit(1);
      expect(run).toMatchObject({ ok: false, errorName: "AccountDepartureBatchError" });
    });
    const pending = await readDepartureReview(db, owner, id);
    expect(pending.apps.find((app) => app.app === "cozya")).toMatchObject({
      state: "queued",
      retrying: true,
      result: null,
    });
    await db
      .update(accountDepartureAssessments)
      .set({ availableAt: new Date(0) })
      .where(
        and(
          eq(accountDepartureAssessments.reviewId, id),
          eq(accountDepartureAssessments.app, "cozya"),
        ),
      );
    expect((await POST(request())).status).toBe(200);
    expect(
      (await readDepartureReview(db, owner, id)).apps.find((app) => app.app === "cozya")?.state,
    ).toBe("done");
  } finally {
    await cancelDepartureReview(db, owner, id);
  }
});
