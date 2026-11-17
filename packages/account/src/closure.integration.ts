import { createHash, randomUUID } from "node:crypto";
import { openCompassoAccount } from "@informach/billing/collection-accounts";
import { getCollectionApps } from "@informach/config/collections";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  accountDepartureReviews,
  accountWebClosureConsents,
  accountWebClosureSteps,
  accountWebClosures,
  collectionAccounts,
  cozyaProfiles,
  customers,
  events,
  familyMembers,
  familyPeople,
  legacyFutureIntents,
  sessions,
  users,
  webParticipations,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { afterEach, beforeAll, expect, it } from "vitest";
import {
  beginWebClosure,
  claimWebClosureStep,
  commitWebClosureStep,
  confirmWebClosure,
  failWebClosureStep,
  finalizeReadyWebClosures,
  finalizeWebClosure,
  finishWebClosurePreparation,
  prepareWebClosureStep,
  readWebClosure,
  refreshWebClosurePreparation,
  renewWebClosureStep,
  reprepareWebClosureRemainder,
  requestWebClosureResumption,
  type WebClosureClaim,
  type WebClosurePlan,
} from "./closure";
import { createBillingWebClosureAdapter, processBillingWebClosures } from "./closure-billing";
import { closureDomains } from "./closure-contract";
import { familyWebClosureAdapter, processFamilyWebClosures } from "./closure-family";
import {
  beginDepartureReview,
  claimDepartureAssessment,
  finishDepartureAssessment,
} from "./departure-reviews";

const createdActors: string[] = [];
beforeAll(() => {
  if (
    process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
    !["localhost", "127.0.0.1", "postgres"].includes(
      new URL(process.env.DATABASE_URL ?? "").hostname,
    )
  )
    throw new Error("Disposable PostgreSQL required");
});
afterEach(async () => {
  if (!createdActors.length) return;
  await db
    .update(accountDepartureReviews)
    .set({ state: "cancelled" })
    .where(inArray(accountDepartureReviews.actorId, createdActors));
  const owned = db
    .select({ id: accountWebClosures.id })
    .from(accountWebClosures)
    .where(inArray(accountWebClosures.actorId, createdActors));
  await db
    .update(accountWebClosureSteps)
    .set({ state: "cancelled", leaseToken: null, leaseUntil: null, completedAt: new Date() })
    .where(
      and(
        inArray(accountWebClosureSteps.closureId, owned),
        inArray(accountWebClosureSteps.state, ["queued", "running"]),
      ),
    );
  createdActors.length = 0;
});
async function login(actorId: string, originApp: string | null = "conta") {
  const sessionId = randomUUID();
  await db.insert(sessions).values({
    id: sessionId,
    userId: actorId,
    token: randomUUID(),
    originApp,
    expiresAt: new Date(Date.now() + 3600_000),
  });
  return { actorId, sessionId };
}
async function fixture(complete = true) {
  const actorId = randomUUID();
  createdActors.push(actorId);
  await db.insert(users).values({
    id: actorId,
    name: "Closure fixture",
    email: `${actorId}@example.test`,
    emailVerified: true,
  });
  const actor = await login(actorId);
  const independent = await login(actorId, null);
  const reviewId = await beginDepartureReview(db, actorId);
  if (complete)
    for (const app of getCollectionApps("compasso")) {
      const claim = await claimDepartureAssessment(db, app.slug);
      if (!claim || claim.actorId !== actorId) throw new Error("Unexpected review fixture");
      await finishDepartureAssessment(db, claim, {
        version: 1,
        hasPersonalData: false,
        hasSharedData: false,
        activeCredentials: 0,
        managedProfiles: 0,
        sharedProfiles: 0,
        pendingOperations: 0,
      });
    }
  return { actor, independent, reviewId };
}
const plan = (domain: string, blockers: WebClosurePlan["blockers"] = []): WebClosurePlan => ({
  version: 1,
  fingerprint: createHash("sha256").update(`isolated-selection:${domain}`).digest("hex"),
  personalRecords: 0,
  sharedRecords: 0,
  credentials: 0,
  blockers,
});
async function claim(domain: string, id: string) {
  const result = await claimWebClosureStep(db, domain);
  if (!result || result.closureId !== id) throw new Error("Unexpected closure fixture");
  return result;
}
async function prepared(blocked = false) {
  const f = await fixture();
  const id = await beginWebClosure(db, f.actor, f.reviewId);
  const actor = await login(f.actor.actorId);
  for (const domain of closureDomains())
    await finishWebClosurePreparation(
      db,
      await claim(domain, id),
      plan(domain, blocked && domain === "family" ? ["responsibilities"] : []),
    );
  return { ...f, actor, id };
}
async function executing() {
  const f = await prepared();
  const view = await readWebClosure(db, f.actor, f.id);
  if (!view.digest) throw new Error("Missing prepared digest");
  await confirmWebClosure(db, f.actor, f.id, view.digest);
  return { ...f, digest: view.digest };
}

it("atomically records preparation and revokes only web login; replay requires a new recent login", async () => {
  const f = await fixture();
  const id = await beginWebClosure(db, f.actor, f.reviewId);
  expect(
    await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, f.actor.actorId)),
  ).toEqual([{ id: f.independent.sessionId }]);
  const [participation] = await db
    .select()
    .from(webParticipations)
    .where(eq(webParticipations.userId, f.actor.actorId));
  expect(participation).toMatchObject({ state: "frozen", revision: 1, operationId: id });
  await expect(beginWebClosure(db, f.actor, f.reviewId)).rejects.toMatchObject({
    code: "unauthorized",
  });
  const fresh = await login(f.actor.actorId);
  expect(await beginWebClosure(db, fresh, f.reviewId)).toBe(id);
  const view = await readWebClosure(db, fresh, id);
  expect(view.steps.map((step) => step.domain)).toEqual(closureDomains());
  expect(view.steps).toHaveLength(getCollectionApps("compasso").length + 2);
  expect(view.state).toBe("preparing");
  expect(view.digest).toBeNull();
  expect(
    await db.select({ id: users.id }).from(users).where(eq(users.id, f.actor.actorId)),
  ).toHaveLength(1);
});

it("rejects incomplete/expired reviews and stale or unrelated central authentication without freezing", async () => {
  const f = await fixture(false);
  await expect(beginWebClosure(db, f.actor, f.reviewId)).rejects.toMatchObject({
    code: "review-unavailable",
  });
  await db
    .update(accountDepartureReviews)
    .set({ state: "cancelled" })
    .where(eq(accountDepartureReviews.id, f.reviewId));
  const g = await fixture();
  await expect(beginWebClosure(db, f.actor, g.reviewId)).rejects.toMatchObject({
    code: "review-unavailable",
  });
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - 901_000) })
    .where(eq(sessions.id, g.actor.sessionId));
  await expect(beginWebClosure(db, g.actor, g.reviewId)).rejects.toMatchObject({
    code: "unauthorized",
  });
  const fresh = await login(g.actor.actorId);
  await db
    .update(accountDepartureReviews)
    .set({ createdAt: new Date(Date.now() - 3600_000), expiresAt: new Date(Date.now() - 1000) })
    .where(eq(accountDepartureReviews.id, g.reviewId));
  await expect(beginWebClosure(db, fresh, g.reviewId)).rejects.toMatchObject({
    code: "review-unavailable",
  });
  expect(
    await db
      .select()
      .from(webParticipations)
      .where(inArray(webParticipations.userId, [f.actor.actorId, g.actor.actorId])),
  ).toEqual([]);
});

it("serializes concurrent requests and creates one frozen operation and one set of steps", async () => {
  const f = await fixture();
  const outcomes = await Promise.allSettled([
    beginWebClosure(db, f.actor, f.reviewId),
    beginWebClosure(db, f.actor, f.reviewId),
  ]);
  expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((item) => item.status === "rejected")).toMatchObject([
    { reason: { code: "unauthorized" } },
  ]);
  const rows = await db
    .select()
    .from(accountWebClosures)
    .where(eq(accountWebClosures.actorId, f.actor.actorId));
  expect(rows).toHaveLength(1);
  if (!rows[0]) throw new Error("Missing closure");
  expect(
    await db
      .select()
      .from(accountWebClosureSteps)
      .where(eq(accountWebClosureSteps.closureId, rows[0].id)),
  ).toHaveLength(closureDomains().length);
  expect(
    (
      await db.select().from(webParticipations).where(eq(webParticipations.userId, f.actor.actorId))
    )[0]?.revision,
  ).toBe(1);
});

it("fences expired, forged and repeated preparation receipts and allows a new worker to resume", async () => {
  const f = await fixture();
  const id = await beginWebClosure(db, f.actor, f.reviewId);
  const first = await claim("app:cozya", id);
  expect(await claimWebClosureStep(db, "app:cozya")).toBeNull();
  expect(
    await finishWebClosurePreparation(db, { ...first, actorId: randomUUID() }, plan("app:cozya")),
  ).toBe(false);
  await db
    .update(accountWebClosureSteps)
    .set({ leaseUntil: new Date(Date.now() - 1000) })
    .where(eq(accountWebClosureSteps.id, first.id));
  expect(await finishWebClosurePreparation(db, first, plan("app:cozya"))).toBe(false);
  const replacement = await claim("app:cozya", id);
  expect(replacement.token).not.toBe(first.token);
  expect(await finishWebClosurePreparation(db, first, plan("app:cozya"))).toBe(false);
  expect(await finishWebClosurePreparation(db, replacement, plan("app:cozya"))).toBe(true);
  expect(await finishWebClosurePreparation(db, replacement, plan("app:cozya"))).toBe(false);
  expect(() => claimWebClosureStep(db, "edi")).toThrow("unsupported-domain");
});

it("does not confuse complete assessments with permission to erase and requires the exact plan", async () => {
  const blocked = await prepared(true);
  const blockedView = await readWebClosure(db, blocked.actor, blocked.id);
  expect(blockedView.state).toBe("preparing");
  expect(blockedView.steps.every((step) => step.state === "done")).toBe(true);
  await expect(
    confirmWebClosure(db, blocked.actor, blocked.id, "a".repeat(64)),
  ).rejects.toMatchObject({ code: "not-ready" });
  const f = await prepared();
  await expect(confirmWebClosure(db, f.actor, f.id, "b".repeat(64))).rejects.toMatchObject({
    code: "stale-plan",
  });
  expect(await claimWebClosureStep(db, "billing")).toBeNull();
});

it("refreshes blocked preparation without reopening participation and fences superseded workers", async () => {
  const f = await prepared(true);
  expect((await readWebClosure(db, f.actor, f.id)).state).toBe("preparing");
  await refreshWebClosurePreparation(db, f.actor, f.id);
  const old = await claim("family", f.id);
  await refreshWebClosurePreparation(db, f.actor, f.id);
  expect(await finishWebClosurePreparation(db, old, plan("family"))).toBe(false);
  for (const domain of closureDomains())
    await finishWebClosurePreparation(db, await claim(domain, f.id), plan(domain));
  const view = await readWebClosure(db, f.actor, f.id);
  expect(view.state).toBe("ready");
  const [participation] = await db
    .select()
    .from(webParticipations)
    .where(eq(webParticipations.userId, f.actor.actorId));
  expect(participation).toMatchObject({ state: "frozen", operationId: f.id, revision: 1 });
});

it("requires the refreshed selection's consent and never refreshes after irreversible confirmation", async () => {
  const f = await prepared();
  const original = await readWebClosure(db, f.actor, f.id);
  if (!original.digest) throw new Error("Missing original digest");
  await refreshWebClosurePreparation(db, f.actor, f.id);
  await expect(confirmWebClosure(db, f.actor, f.id, original.digest)).rejects.toMatchObject({
    code: "not-ready",
  });
  for (const domain of closureDomains())
    await finishWebClosurePreparation(db, await claim(domain, f.id), {
      ...plan(domain),
      fingerprint: createHash("sha256").update(`changed:${domain}`).digest("hex"),
    });
  await expect(confirmWebClosure(db, f.actor, f.id, original.digest)).rejects.toMatchObject({
    code: "stale-plan",
  });
  const view = await readWebClosure(db, f.actor, f.id);
  if (!view.digest) throw new Error("Missing refreshed digest");
  await confirmWebClosure(db, f.actor, f.id, view.digest);
  await expect(refreshWebClosurePreparation(db, f.actor, f.id)).rejects.toMatchObject({
    code: "irreversible",
  });
});

it("pauses changed scope after partial erasure, retains receipts and requires a new consent for the remainder", async () => {
  const f = await executing();
  await commitWebClosureStep(db, await claim("billing", f.id), async () => {});
  await commitWebClosureStep(db, await claim("app:cozya", f.id), async () => {});
  const oldWorker = await claim("app:agenda-da-turma", f.id);
  const changedWorker = await claim("app:bora-treinar", f.id);
  expect(await failWebClosureStep(db, changedWorker, "scope_changed")).toBe(true);
  expect((await readWebClosure(db, f.actor, f.id)).state).toBe("paused");
  expect(await claimWebClosureStep(db, "app:dia-de-estrela")).toBeNull();
  let lateEffect = false;
  expect(
    await commitWebClosureStep(db, oldWorker, async () => {
      lateEffect = true;
    }),
  ).toBe(false);
  expect(lateEffect).toBe(false);
  await expect(requestWebClosureResumption(db, f.actor, f.id)).rejects.toMatchObject({
    code: "irreversible",
  });
  const other = await fixture();
  await expect(reprepareWebClosureRemainder(db, other.actor, f.id)).rejects.toMatchObject({
    code: "not-found",
  });
  await reprepareWebClosureRemainder(db, f.actor, f.id);
  expect(await claimWebClosureStep(db, "billing")).toBeNull();
  expect(await claimWebClosureStep(db, "app:cozya")).toBeNull();
  const remaining = closureDomains().filter((domain) => !["billing", "app:cozya"].includes(domain));
  for (const domain of remaining)
    await finishWebClosurePreparation(db, await claim(domain, f.id), plan(domain));
  // Even identical indicators require fresh approval of the new preparation.
  const view = await readWebClosure(db, f.actor, f.id);
  expect(view).toMatchObject({ state: "review_required", planRevision: 2 });
  expect(view.digest).not.toBe(f.digest);
  if (!view.digest) throw new Error("Missing revised plan");
  await expect(confirmWebClosure(db, f.actor, f.id, f.digest)).rejects.toMatchObject({
    code: "stale-plan",
  });
  await expect(requestWebClosureResumption(db, f.actor, f.id)).rejects.toMatchObject({
    code: "irreversible",
  });
  expect(await claimWebClosureStep(db, "app:bora-treinar")).toBeNull();
  await confirmWebClosure(db, f.actor, f.id, view.digest);
  await confirmWebClosure(db, f.actor, f.id, view.digest);
  expect(await failWebClosureStep(db, oldWorker, "scope_changed")).toBe(false);
  const nextWorker = await claim("app:agenda-da-turma", f.id);
  expect(nextWorker.token).not.toBe(oldWorker.token);
  await commitWebClosureStep(db, nextWorker, async () => {});
  for (const domain of remaining.filter(
    (domain) => domain.startsWith("app:") && domain !== "app:agenda-da-turma",
  ))
    await commitWebClosureStep(db, await claim(domain, f.id), async () => {});
  await commitWebClosureStep(db, await claim("family", f.id), async () => {});
  const records = await db
    .select()
    .from(accountWebClosureConsents)
    .where(eq(accountWebClosureConsents.closureId, f.id))
    .orderBy(accountWebClosureConsents.revision);
  expect(records.map((record) => ({ revision: record.revision, digest: record.digest }))).toEqual([
    { revision: 1, digest: f.digest },
    { revision: 2, digest: view.digest },
  ]);
  expect(records[0]?.plans).toEqual(
    closureDomains().map((domain) => ({ domain, plan: plan(domain) })),
  );
  const completed = (await readWebClosure(db, f.actor, f.id)).steps.filter(
    (step) => step.phase === "erase",
  );
  expect(completed).toHaveLength(closureDomains().length);
  expect(completed.find((step) => step.domain === "billing")?.attempts).toBe(1);
  expect(completed.find((step) => step.domain === "app:cozya")?.attempts).toBe(1);
  expect(await finalizeWebClosure(db, f.id)).toBe("completed");
});

it("renews only the live exact execution lease and never revives expired or superseded work", async () => {
  const f = await executing();
  const worker = await claim("billing", f.id);
  await db
    .update(accountWebClosureSteps)
    .set({ leaseUntil: new Date(Date.now() + 5_000) })
    .where(eq(accountWebClosureSteps.id, worker.id));
  expect(await renewWebClosureStep(db, { ...worker, token: randomUUID() })).toBe(false);
  expect(await renewWebClosureStep(db, worker)).toBe(true);
  const [renewed] = await db
    .select()
    .from(accountWebClosureSteps)
    .where(eq(accountWebClosureSteps.id, worker.id));
  expect(renewed?.attempts).toBe(1);
  expect((renewed?.leaseUntil?.getTime() ?? 0) - Date.now()).toBeGreaterThan(80_000);
  await db
    .update(accountWebClosureSteps)
    .set({ leaseUntil: new Date(Date.now() - 1_000) })
    .where(eq(accountWebClosureSteps.id, worker.id));
  expect(await renewWebClosureStep(db, worker)).toBe(false);
  const next = await claim("billing", f.id);
  await failWebClosureStep(db, next, "scope_changed");
  expect(await renewWebClosureStep(db, next)).toBe(false);
  await reprepareWebClosureRemainder(db, f.actor, f.id);
  expect(await renewWebClosureStep(db, worker)).toBe(false);
});

it("refuses to renew when participation no longer matches the frozen request", async () => {
  const changed = await executing();
  const obsolete = await claim("billing", changed.id);
  await db
    .update(webParticipations)
    .set({ revision: sql`${webParticipations.revision} + 1` })
    .where(eq(webParticipations.userId, changed.actor.actorId));
  await expect(renewWebClosureStep(db, obsolete)).rejects.toMatchObject({ code: "stale-revision" });
});

it("automatically finalizes only fully acknowledged operations and can repeat the maintenance batch", async () => {
  const f = await executing();
  expect(await finalizeReadyWebClosures(db)).toMatchObject({ completed: 0, failed: 0 });
  await commitWebClosureStep(db, await claim("billing", f.id), async () => {});
  for (const domain of closureDomains().filter((domain) => domain.startsWith("app:")))
    await commitWebClosureStep(db, await claim(domain, f.id), async () => {});
  expect(await finalizeReadyWebClosures(db)).toMatchObject({ completed: 0, failed: 0 });
  await commitWebClosureStep(db, await claim("family", f.id), async () => {});
  expect(await finalizeReadyWebClosures(db)).toMatchObject({ completed: 1, failed: 0 });
  expect(await finalizeReadyWebClosures(db)).toMatchObject({ completed: 0, failed: 0 });
  expect(
    (
      await db.select().from(webParticipations).where(eq(webParticipations.userId, f.actor.actorId))
    )[0]?.state,
  ).toBe("closed");
});

it("rechecks a blocked remainder while fencing its old preparation and preserving the original consent", async () => {
  const f = await executing();
  await failWebClosureStep(db, await claim("billing", f.id), "scope_changed");
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - 901_000) })
    .where(eq(sessions.id, f.actor.sessionId));
  await expect(reprepareWebClosureRemainder(db, f.actor, f.id)).rejects.toMatchObject({
    code: "unauthorized",
  });
  const actor = await login(f.actor.actorId);
  await reprepareWebClosureRemainder(db, actor, f.id);
  const late = await claim("family", f.id);
  await reprepareWebClosureRemainder(db, actor, f.id);
  expect(await finishWebClosurePreparation(db, late, plan("family"))).toBe(false);
  for (const domain of closureDomains())
    await finishWebClosurePreparation(
      db,
      await claim(domain, f.id),
      plan(domain, domain === "family" ? ["responsibilities"] : []),
    );
  expect((await readWebClosure(db, actor, f.id)).state).toBe("repreparing");
  await expect(confirmWebClosure(db, actor, f.id, f.digest)).rejects.toMatchObject({
    code: "not-ready",
  });
  await reprepareWebClosureRemainder(db, actor, f.id);
  for (const domain of closureDomains())
    await finishWebClosurePreparation(db, await claim(domain, f.id), plan(domain));
  const view = await readWebClosure(db, actor, f.id);
  expect(view).toMatchObject({ state: "review_required", planRevision: 4 });
  if (!view.digest) throw new Error("Missing revised plan");
  await confirmWebClosure(db, actor, f.id, view.digest);
  const receipts = await db
    .select()
    .from(accountWebClosureConsents)
    .where(eq(accountWebClosureConsents.closureId, f.id))
    .orderBy(accountWebClosureConsents.revision);
  expect(receipts.map((receipt) => receipt.revision)).toEqual([1, 4]);
  expect(receipts[0]?.digest).toBe(f.digest);
  expect(
    (
      await db.select().from(webParticipations).where(eq(webParticipations.userId, actor.actorId))
    )[0],
  ).toMatchObject({ state: "frozen", revision: 1, operationId: f.id });
});

it("resumes only after billing and every app acknowledges cleanup, fencing late preparation", async () => {
  const f = await fixture();
  const id = await beginWebClosure(db, f.actor, f.reviewId);
  const late = await claim("app:cozya", id);
  const actor = await login(f.actor.actorId);
  await requestWebClosureResumption(db, actor, id);
  expect(await finishWebClosurePreparation(db, late, plan("app:cozya"))).toBe(false);
  expect(await claimWebClosureStep(db, "app:cozya")).toBeNull();
  await expect(finalizeWebClosure(db, id)).rejects.toMatchObject({ code: "not-ready" });
  await commitWebClosureStep(db, await claim("billing", id), async () => {});
  expect(await claimWebClosureStep(db, "family")).toBeNull();
  for (const domain of closureDomains().filter((item) => item.startsWith("app:")))
    await commitWebClosureStep(db, await claim(domain, id), async () => {});
  await commitWebClosureStep(db, await claim("family", id), async () => {});
  expect(
    (
      await db.select().from(webParticipations).where(eq(webParticipations.userId, actor.actorId))
    )[0]?.state,
  ).toBe("frozen");
  expect(await finalizeWebClosure(db, id)).toBe("cancelled");
  expect(await finalizeWebClosure(db, id)).toBe("cancelled");
  expect(
    (
      await db.select().from(webParticipations).where(eq(webParticipations.userId, actor.actorId))
    )[0],
  ).toMatchObject({ state: "active", revision: 2 });
  expect(
    await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, actor.actorId)),
  ).toEqual([{ id: f.independent.sessionId }]);
});

it("commits domain erasure and its receipt together, preserves other users and refuses cancellation after consent", async () => {
  const f = await executing();
  const other = await fixture();
  await db.insert(cozyaProfiles).values([
    { userId: f.actor.actorId, preferences: "Own private data" },
    { userId: other.actor.actorId, preferences: "Other adult" },
  ]);
  expect(await confirmWebClosure(db, f.actor, f.id, f.digest)).toBe(f.id);
  await expect(requestWebClosureResumption(db, f.actor, f.id)).rejects.toMatchObject({
    code: "irreversible",
  });
  expect(await claimWebClosureStep(db, "app:cozya")).toBeNull();
  await commitWebClosureStep(db, await claim("billing", f.id), async () => {});
  const work = await claim("app:cozya", f.id);
  await expect(
    commitWebClosureStep(db, work, async (tx, context) => {
      await tx.delete(cozyaProfiles).where(eq(cozyaProfiles.userId, context.actorId));
      throw new Error("Injected interruption after database effect");
    }),
  ).rejects.toThrow("Injected interruption");
  expect(
    await db.select().from(cozyaProfiles).where(eq(cozyaProfiles.userId, f.actor.actorId)),
  ).toHaveLength(1);
  expect(
    (
      await db.select().from(accountWebClosureSteps).where(eq(accountWebClosureSteps.id, work.id))
    )[0]?.state,
  ).toBe("running");
  await commitWebClosureStep(db, work, async (tx, context) => {
    await tx.delete(cozyaProfiles).where(eq(cozyaProfiles.userId, context.actorId));
  });
  let replayed = false;
  expect(
    await commitWebClosureStep(db, work, async () => {
      replayed = true;
    }),
  ).toBe(false);
  expect(replayed).toBe(false);
  for (const domain of closureDomains().filter(
    (item) => item.startsWith("app:") && item !== "app:cozya",
  ))
    await commitWebClosureStep(db, await claim(domain, f.id), async () => {});
  await commitWebClosureStep(db, await claim("family", f.id), async () => {});
  expect(await finalizeWebClosure(db, f.id)).toBe("completed");
  expect(
    await db.select().from(cozyaProfiles).where(eq(cozyaProfiles.userId, other.actor.actorId)),
  ).toMatchObject([{ preferences: "Other adult" }]);
  expect(
    await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, f.actor.actorId)),
  ).toEqual([{ id: f.independent.sessionId }]);
  expect(
    (
      await db.select().from(webParticipations).where(eq(webParticipations.userId, f.actor.actorId))
    )[0]?.state,
  ).toBe("closed");
});

it("retains a classified failure for retry and rolls back when a lease expires before the receipt", async () => {
  const f = await executing();
  const first = await claim("billing", f.id);
  expect(await failWebClosureStep(db, first, "step_failed")).toBe(true);
  expect(await claimWebClosureStep(db, "billing")).toBeNull();
  await db
    .update(accountWebClosureSteps)
    .set({ availableAt: new Date(0) })
    .where(eq(accountWebClosureSteps.id, first.id));
  const next = await claim("billing", f.id);
  expect(next.token).not.toBe(first.token);
  await db
    .insert(cozyaProfiles)
    .values({ userId: f.actor.actorId, preferences: "Preserved on rollback" });
  await expect(
    commitWebClosureStep(db, next, async (tx, context) => {
      await tx.delete(cozyaProfiles).where(eq(cozyaProfiles.userId, context.actorId));
      // Deterministic lease-expiry fault; no sleeping or production clock override.
      await tx
        .update(accountWebClosureSteps)
        .set({ leaseUntil: sql`clock_timestamp() - interval '1 second'` })
        .where(eq(accountWebClosureSteps.id, next.id));
    }),
  ).rejects.toMatchObject({ code: "stale-claim" });
  expect(
    await db.select().from(cozyaProfiles).where(eq(cozyaProfiles.userId, f.actor.actorId)),
  ).toHaveLength(1);
  const entries = await db
    .select({ payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.actorId, f.actor.actorId),
        eq(events.eventType, "user.web_closure_step_completed"),
      ),
    );
  expect(entries).toHaveLength(closureDomains().length);
});

it("rejects a changed catalog and a forged step without running any domain effect", async () => {
  const f = await executing();
  const issued = await claim("billing", f.id);
  let ran = false;
  const forged: WebClosureClaim = { ...issued, domain: "app:cozya" };
  expect(
    await commitWebClosureStep(db, forged, async () => {
      ran = true;
    }),
  ).toBe(false);
  await db
    .update(accountWebClosures)
    .set({ catalog: ["cozya"] })
    .where(eq(accountWebClosures.id, f.id));
  expect(
    await commitWebClosureStep(db, issued, async () => {
      ran = true;
    }),
  ).toBe(false);
  expect(ran).toBe(false);
});

it("commits the real family detachment only after all other domains and finalizes without deleting the independent login", async () => {
  const f = await fixture();
  const family = createFamilyService({ db });
  const group = await family.createGroup(f.actor.actorId, "Final family fixture");
  const account = await openCompassoAccount(db, f.actor.actorId, group.id);
  const start = new Date(Date.now() + 86400_000);
  const [future] = await db
    .insert(legacyFutureIntents)
    .values({
      accountId: account.id,
      payerUserId: f.actor.actorId,
      requestKey: randomUUID(),
      productId: "compasso_monthly",
      providerPriceId: "price_fixture",
      amountCents: 4990,
      interval: "month",
      paidThrough: start,
      startsAt: start,
      termsRevision: "a".repeat(64),
      setupExpiresAt: start,
      setupProtocolVersion: 1,
    })
    .returning();
  if (!future) throw new Error("Missing future setup");
  const billingDeps = {
    db,
    commerce: () => {
      throw new Error("An unbilled account needs no provider");
    },
  };
  const billingAdapter = createBillingWebClosureAdapter(billingDeps);
  const child = await family.createPerson(f.actor.actorId, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Exclusive common identity",
  });
  const id = await beginWebClosure(db, f.actor, f.reviewId);
  const actor = await login(f.actor.actorId);
  // The other domains contain no data in this coordinator fixture. Their
  // receipts exercise ordering; family preparation and execution are real.
  for (const domain of closureDomains()) {
    const claimed = await claim(domain, id);
    if (domain === "billing") await prepareWebClosureStep(db, claimed, billingAdapter.prepare);
    else if (domain === "family")
      await prepareWebClosureStep(db, claimed, familyWebClosureAdapter.prepare);
    else await finishWebClosurePreparation(db, claimed, plan(domain));
  }
  const view = await readWebClosure(db, actor, id);
  if (!view.digest) throw new Error("Missing family consent digest");
  expect(
    view.steps.find((step) => step.domain === "billing" && step.phase === "prepare")?.plan
      ?.credentials,
  ).toBe(1);
  expect(
    (await db.select().from(legacyFutureIntents).where(eq(legacyFutureIntents.id, future.id)))[0]
      ?.state,
  ).toBe("setup_pending");
  await confirmWebClosure(db, actor, id, view.digest);
  expect(await processFamilyWebClosures(db)).toEqual({ completed: 0, failed: 0, discarded: 0 });
  expect(await db.select().from(familyPeople).where(eq(familyPeople.id, child.id))).toHaveLength(1);
  expect(await processBillingWebClosures(billingDeps)).toEqual({
    completed: 1,
    failed: 0,
    discarded: 0,
  });
  expect(
    (await db.select().from(legacyFutureIntents).where(eq(legacyFutureIntents.id, future.id)))[0]
      ?.state,
  ).toBe("canceled");
  expect(
    (await db.select().from(collectionAccounts).where(eq(collectionAccounts.id, account.id)))[0]
      ?.closedAt,
  ).toBeInstanceOf(Date);
  for (const domain of closureDomains().filter((item) => item.startsWith("app:")))
    await commitWebClosureStep(db, await claim(domain, id), async () => {});
  expect(await processFamilyWebClosures(db)).toEqual({ completed: 1, failed: 0, discarded: 0 });
  expect(await db.select().from(familyPeople).where(eq(familyPeople.id, child.id))).toEqual([]);
  expect(
    (await db.select().from(familyMembers).where(eq(familyMembers.userId, actor.actorId)))[0]
      ?.revokedAt,
  ).toBeInstanceOf(Date);
  await finalizeWebClosure(db, id);
  expect(
    (
      await db.select().from(webParticipations).where(eq(webParticipations.userId, actor.actorId))
    )[0]?.state,
  ).toBe("closed");
  expect(
    await db.select().from(sessions).where(eq(sessions.id, f.independent.sessionId)),
  ).toHaveLength(1);
  expect(await processFamilyWebClosures(db)).toEqual({ completed: 0, failed: 0, discarded: 0 });
});

it("resumes a payer without calling a provider or closing their commercial account", async () => {
  const f = await fixture();
  const family = createFamilyService({ db });
  const group = await family.createGroup(f.actor.actorId, "Resume billing fixture");
  const account = await openCompassoAccount(db, f.actor.actorId, group.id);
  await db.insert(customers).values({
    provider: "stripe",
    app: "compasso",
    providerCustomerId: `cus_${randomUUID()}`,
    subjectType: "billing_account",
    subjectId: account.id,
    email: `${f.actor.actorId}@example.test`,
  });
  const id = await beginWebClosure(db, f.actor, f.reviewId);
  await requestWebClosureResumption(db, await login(f.actor.actorId), id);
  expect(
    await processBillingWebClosures({
      db,
      commerce: () => {
        throw new Error("Resume must not cancel remote contracts");
      },
    }),
  ).toEqual({ completed: 1, failed: 0, discarded: 0 });
  expect(
    (await db.select().from(collectionAccounts).where(eq(collectionAccounts.id, account.id)))[0]
      ?.closedAt,
  ).toBeNull();
});
