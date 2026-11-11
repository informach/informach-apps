import { randomUUID } from "node:crypto";
import { freezeWebParticipation, webCommercialLockKey } from "@informach/auth/web-participation";
import { db, eq, sql } from "@informach/db";
import { customers, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { beforeAll, expect, it } from "vitest";
import { openCompassoAccount } from "./collection-accounts";
import { withActiveCompassoBillingLock } from "./credit-purchases";

beforeAll(() => {
  if (
    process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
    !["localhost", "127.0.0.1", "postgres"].includes(
      new URL(process.env.DATABASE_URL ?? "").hostname,
    )
  )
    throw new Error("Disposable PostgreSQL required");
});
async function fixture() {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `${userId}@example.test`,
    name: "Commercial fixture",
    emailVerified: true,
  });
  const group = await createFamilyService({ db }).createGroup(userId, "Commercial fixture");
  const account = await openCompassoAccount(db, userId, group.id);
  return { userId, accountId: account.id };
}
function signal<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  if (!resolve) throw new Error("Signal not initialized");
  return { promise, resolve };
}

it("waits for admitted provider work and its durable receipt before freezing, then rejects a late admission", async () => {
  const f = await fixture();
  const entered = signal<void>(),
    release = signal<void>(),
    freezing = signal<number>();
  const operation = withActiveCompassoBillingLock(db, f.userId, f.accountId, async () => {
    entered.resolve();
    await release.promise;
    await db.insert(customers).values({
      provider: "stripe",
      providerCustomerId: `cus_${randomUUID()}`,
      app: "compasso",
      subjectType: "billing_account",
      subjectId: f.accountId,
      email: `${f.userId}@example.test`,
    });
  });
  await entered.promise;
  const freeze = db.transaction(async (tx) => {
    const [session] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    if (!session) throw new Error("Missing database session");
    freezing.resolve(session.pid);
    return freezeWebParticipation(tx, {
      userId: f.userId,
      operationId: randomUUID(),
      expectedRevision: 0,
    });
  });
  try {
    const pid = await freezing.promise;
    await expect
      .poll(async () => {
        const [row] = await db.execute<{ blocked: boolean }>(
          sql`select cardinality(pg_blocking_pids(${pid})) > 0 as blocked`,
        );
        return row?.blocked;
      })
      .toBe(true);
  } finally {
    release.resolve();
    await operation;
  }
  await freeze;
  expect(
    await db.select().from(customers).where(eq(customers.subjectId, f.accountId)),
  ).toHaveLength(1);
  let lateCalled = false;
  await expect(
    withActiveCompassoBillingLock(db, f.userId, f.accountId, async () => {
      lateCalled = true;
    }),
  ).rejects.toMatchObject({ code: "unavailable" });
  expect(lateCalled).toBe(false);
});

it("takes both locks on one coordination connection and serves more actors than the pool capacity", async () => {
  const actors = await Promise.all(Array.from({ length: 4 }, () => fixture()));
  await Promise.all(
    actors.map((f) =>
      withActiveCompassoBillingLock(db, f.userId, f.accountId, async () => {
        for (const key of [webCommercialLockKey(f.userId), `compasso:billing:${f.accountId}`]) {
          const [row] = await db.transaction((tx) =>
            tx.execute<{ acquired: boolean }>(
              sql`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as acquired`,
            ),
          );
          expect(row?.acquired).toBe(false);
        }
      }),
    ),
  );
});
