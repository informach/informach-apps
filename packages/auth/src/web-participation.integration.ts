import { randomUUID } from "node:crypto";
import { and, db, eq, inArray, sql } from "@informach/db";
import { events, sessions, users, webParticipations } from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import {
  activeWebParticipationCondition,
  closeWebParticipation,
  currentWebParticipationCondition,
  freezeWebParticipation,
  lockActiveWebParticipation,
  readWebParticipation,
  resumeWebParticipation,
} from "./web-participation";
import { isActiveWebSession } from "./web-sessions";

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  if (!resolve) throw new Error("Promise executor did not initialize");
  return { promise, resolve };
}

beforeAll(() => {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (
    process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
    !["localhost", "127.0.0.1", "postgres"].includes(host)
  )
    throw new Error("Disposable PostgreSQL required");
});

async function account() {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    name: "Participation fixture",
    email: `${userId}@example.test`,
    emailVerified: true,
  });
  const root = randomUUID();
  const child = randomUUID();
  const independent = randomUUID();
  const expiresAt = new Date(Date.now() + 3600_000);
  await db.insert(sessions).values([
    { id: root, userId, token: randomUUID(), originApp: "conta", expiresAt },
    { id: independent, userId, token: randomUUID(), expiresAt },
  ]);
  await db.insert(sessions).values({
    id: child,
    userId,
    token: randomUUID(),
    originApp: "cozya",
    parentSessionId: root,
    expiresAt,
  });
  return { userId, root, child, independent, operationId: randomUUID(), expectedRevision: 0 };
}
const intent = (owner: Awaited<ReturnType<typeof account>>, expectedRevision = 0) => ({
  userId: owner.userId,
  operationId: owner.operationId,
  expectedRevision,
});
async function auditCount(userId: string) {
  return (
    await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(eq(events.actorId, userId), eq(events.eventType, "user.web_participation_changed")),
      )
  ).length;
}
async function isBlocked(pid: number) {
  const rows = await db.execute<{ blocked: boolean }>(sql`
    select cardinality(pg_blocking_pids(${pid})) > 0 as blocked
  `);
  return rows[0]?.blocked;
}

describe("transactional web participation", () => {
  it("correlates active state and credential revision in single-table projections and filters", async () => {
    const untouched = await account(),
      frozen = await account(),
      resumed = await account();
    await db.transaction((tx) => freezeWebParticipation(tx, intent(frozen)));
    await db.transaction((tx) => freezeWebParticipation(tx, intent(resumed)));
    await db.transaction((tx) => resumeWebParticipation(tx, intent(resumed, 1)));
    const ids = [untouched.userId, frozen.userId, resumed.userId];
    const rows = await db
      .select({
        id: users.id,
        active: activeWebParticipationCondition(users.id).mapWith(Boolean),
        initial: currentWebParticipationCondition(users.id, 0).mapWith(Boolean),
        renewed: currentWebParticipationCondition(users.id, 2).mapWith(Boolean),
      })
      .from(users)
      .where(inArray(users.id, ids));
    expect(rows.find((row) => row.id === untouched.userId)).toEqual({
      id: untouched.userId,
      active: true,
      initial: true,
      renewed: false,
    });
    expect(rows.find((row) => row.id === frozen.userId)).toEqual({
      id: frozen.userId,
      active: false,
      initial: false,
      renewed: false,
    });
    expect(rows.find((row) => row.id === resumed.userId)).toEqual({
      id: resumed.userId,
      active: true,
      initial: false,
      renewed: true,
    });
    expect(
      await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, ids), currentWebParticipationCondition(users.id, 2))),
    ).toEqual([{ id: resumed.userId }]);
  });
  it("freezes once, revokes only web sessions and preserves other identities", async () => {
    const owner = await account();
    const other = await account();
    expect(
      await isActiveWebSession({ userId: owner.userId, sessionId: owner.child, app: "cozya" }),
    ).toBe(true);
    expect(await db.transaction((tx) => freezeWebParticipation(tx, intent(owner)))).toEqual({
      state: "frozen",
      revision: 1,
    });
    expect(await db.transaction((tx) => freezeWebParticipation(tx, intent(owner)))).toEqual({
      state: "frozen",
      revision: 1,
    });
    expect(await auditCount(owner.userId)).toBe(1);
    expect(
      await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, owner.userId)),
    ).toEqual([{ id: owner.independent }]);
    expect(
      await isActiveWebSession({ userId: other.userId, sessionId: other.child, app: "cozya" }),
    ).toBe(true);
    expect(
      await db.select({ id: users.id }).from(users).where(eq(users.id, owner.userId)),
    ).toHaveLength(1);
    await expect(
      db.transaction((tx) => lockActiveWebParticipation(tx, owner.userId)),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("rolls back participation, session revocation and audit together", async () => {
    const owner = await account();
    await expect(
      db.transaction(async (tx) => {
        await freezeWebParticipation(tx, intent(owner));
        throw new Error("Coordinator transaction aborted");
      }),
    ).rejects.toThrow("Coordinator transaction aborted");
    expect(await readWebParticipation(db, owner.userId)).toEqual({ state: "active", revision: 0 });
    expect(await auditCount(owner.userId)).toBe(0);
    expect(
      await isActiveWebSession({ userId: owner.userId, sessionId: owner.child, app: "cozya" }),
    ).toBe(true);
  });

  it("does not serialize concurrent domain writers for one active user", async () => {
    const owner = await account();
    await db.transaction((tx) => lockActiveWebParticipation(tx, owner.userId));
    const held = deferred<void>();
    const release = deferred<void>();
    const first = db.transaction(async (tx) => {
      await lockActiveWebParticipation(tx, owner.userId);
      held.resolve();
      await release.promise;
    });
    try {
      await held.promise;
      expect(
        await db.transaction(async (tx) => {
          await tx.execute(sql`set local statement_timeout = '1s'`);
          return lockActiveWebParticipation(tx, owner.userId);
        }),
      ).toBe(0);
    } finally {
      release.resolve();
      await first;
    }
  });

  it("waits for admitted writes, then refuses a late writer", async () => {
    const owner = await account();
    const held = deferred<void>();
    const release = deferred<void>();
    const freezing = deferred<number>();
    const first = db.transaction(async (tx) => {
      await lockActiveWebParticipation(tx, owner.userId);
      held.resolve();
      await release.promise;
      await tx
        .update(users)
        .set({ name: "Committed before freeze" })
        .where(eq(users.id, owner.userId));
    });
    await held.promise;
    const freeze = db.transaction(async (tx) => {
      const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!row) throw new Error("Missing PostgreSQL session");
      freezing.resolve(row.pid);
      return freezeWebParticipation(tx, intent(owner));
    });
    try {
      const pid = await freezing.promise;
      await expect.poll(() => isBlocked(pid)).toBe(true);
    } finally {
      release.resolve();
      await first;
    }
    await freeze;
    const [saved] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, owner.userId));
    expect(saved?.name).toBe("Committed before freeze");
    await expect(
      db.transaction(async (tx) => {
        await lockActiveWebParticipation(tx, owner.userId, 0);
        await tx
          .update(users)
          .set({ name: "Forbidden late write" })
          .where(eq(users.id, owner.userId));
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("a writer waiting behind freeze cannot use its earlier authorization", async () => {
    const owner = await account();
    const held = deferred<void>();
    const release = deferred<void>();
    const waiting = deferred<number>();
    const freeze = db.transaction(async (tx) => {
      await freezeWebParticipation(tx, intent(owner));
      held.resolve();
      await release.promise;
    });
    await held.promise;
    const writer = db.transaction(async (tx) => {
      const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!row) throw new Error("Missing PostgreSQL session");
      waiting.resolve(row.pid);
      return lockActiveWebParticipation(tx, owner.userId);
    });
    const rejected = expect(writer).rejects.toMatchObject({ code: "unavailable" });
    try {
      const pid = await waiting.promise;
      await expect.poll(() => isBlocked(pid)).toBe(true);
    } finally {
      release.resolve();
      await freeze;
    }
    await rejected;
  });

  it("resumption rejects stale jobs and old freeze commands; closure is terminal", async () => {
    const owner = await account();
    const admittedRevision = await db.transaction((tx) =>
      lockActiveWebParticipation(tx, owner.userId),
    );
    await db.transaction((tx) => freezeWebParticipation(tx, intent(owner)));
    await expect(
      db.transaction((tx) =>
        resumeWebParticipation(tx, { ...intent(owner, 1), operationId: randomUUID() }),
      ),
    ).rejects.toMatchObject({ code: "invalid-transition" });
    expect(await db.transaction((tx) => resumeWebParticipation(tx, intent(owner, 1)))).toEqual({
      state: "active",
      revision: 2,
    });
    expect(await db.transaction((tx) => resumeWebParticipation(tx, intent(owner, 1)))).toEqual({
      state: "active",
      revision: 2,
    });
    await expect(
      db.transaction((tx) => lockActiveWebParticipation(tx, owner.userId, admittedRevision)),
    ).rejects.toMatchObject({ code: "stale-revision" });
    await expect(
      db.transaction((tx) => freezeWebParticipation(tx, intent(owner))),
    ).rejects.toMatchObject({ code: "stale-revision" });
    expect(await db.transaction((tx) => lockActiveWebParticipation(tx, owner.userId, 2))).toBe(2);
    const next = { userId: owner.userId, operationId: randomUUID(), expectedRevision: 2 };
    await db.transaction((tx) => freezeWebParticipation(tx, next));
    expect(
      await db.transaction((tx) => closeWebParticipation(tx, { ...next, expectedRevision: 3 })),
    ).toEqual({ state: "closed", revision: 4 });
    expect(
      await db.transaction((tx) => closeWebParticipation(tx, { ...next, expectedRevision: 3 })),
    ).toEqual({ state: "closed", revision: 4 });
    await expect(
      db.transaction((tx) => resumeWebParticipation(tx, { ...next, expectedRevision: 4 })),
    ).rejects.toMatchObject({ code: "invalid-transition" });
    await expect(
      db.transaction((tx) => freezeWebParticipation(tx, { ...next, expectedRevision: 4 })),
    ).rejects.toMatchObject({ code: "invalid-transition" });
    expect(await auditCount(owner.userId)).toBe(4);
  });

  it("rejects a repeatable-read snapshot taken before freeze", async () => {
    const owner = await account();
    await db.transaction((tx) => lockActiveWebParticipation(tx, owner.userId));
    await expect(
      db.transaction(
        async (tx) => {
          await tx
            .select()
            .from(webParticipations)
            .where(eq(webParticipations.userId, owner.userId));
          await db.transaction((other) => freezeWebParticipation(other, intent(owner)));
          await lockActiveWebParticipation(tx, owner.userId);
        },
        { isolationLevel: "repeatable read" },
      ),
    ).rejects.toMatchObject({ cause: { code: "40001" } });
  });

  it("does not admit unverified or banned actors", async () => {
    const owner = await account();
    await db.update(users).set({ banned: true }).where(eq(users.id, owner.userId));
    await expect(
      db.transaction((tx) => lockActiveWebParticipation(tx, owner.userId)),
    ).rejects.toMatchObject({ code: "unavailable" });
    await db
      .update(users)
      .set({ banned: false, emailVerified: false })
      .where(eq(users.id, owner.userId));
    await expect(
      db.transaction((tx) => lockActiveWebParticipation(tx, owner.userId)),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
