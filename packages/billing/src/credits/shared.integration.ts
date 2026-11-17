import { randomUUID } from "node:crypto";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { getBalance } from "./balance";
import { lockCreditOwner } from "./locks";
import { commitReservation, releaseReservation, reserveCredits } from "./reservations";
import { authorizeCompassoSpend } from "./shared";

const url = process.env.DATABASE_URL;
if (!url || (process.env.COMPASSO_ISOLATED_DATABASE !== "1" && process.env.CI !== "true"))
  throw new Error("Billing integration requires an isolated database");
if (!["127.0.0.1", "localhost", "postgres"].includes(new URL(url).hostname))
  throw new Error("Billing integration cannot use a remote database");
const connection = postgres(url, { max: 12, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
const deps = { db, walletScope: "compasso", authorizeSpend: authorizeCompassoSpend };
afterAll(async () => {
  await connection.end();
});

async function fixture() {
  const actorId = `wallet-test-${randomUUID()}`;
  await db.insert(schema.users).values({
    id: actorId,
    name: "Test adult",
    email: `${actorId}@example.test`,
    emailVerified: true,
  });
  const group = await family.createGroup(actorId, "Wallet test");
  const person = await family.createPerson(actorId, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Child",
  });
  await family.activateProfile(
    actorId,
    { groupId: group.id, personId: person.id, app: "agenda-da-turma" },
    async () => null,
  );
  const owner = { type: "family" as const, id: group.id };
  const input = {
    owner,
    actorUserId: actorId,
    app: "cozya",
    feature: "test.recipe",
    estimatedAmount: 1,
  };
  return { actorId, group, person, owner, input };
}

describe("shared wallet accounting in PostgreSQL", () => {
  it("takes the wallet before membership so concurrent trial/spend cannot invert locks", async () => {
    const f = await fixture();
    await db.insert(schema.creditLedger).values({
      ownerType: "family",
      ownerId: f.group.id,
      app: "compasso",
      entryType: "purchase",
      amount: 5,
    });
    let signalHeld: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      signalHeld = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await lockCreditOwner(tx, f.owner);
      if (!signalHeld) throw new Error("Missing lock coordination");
      signalHeld();
      // Observe the actual PostgreSQL waiter, rather than sleeping or mocking lock calls.
      await expect
        .poll(async () => {
          const rows = await tx.execute<{ waiting: boolean }>(sql`SELECT EXISTS (
          SELECT 1 FROM pg_locks WHERE locktype = 'advisory'
          AND objid = hashtext(${`family:${f.group.id}`})::oid AND NOT granted
        ) AS waiting`);
          return rows[0]?.waiting;
        })
        .toBe(true);
      await lockFamilyMembership(tx, f.actorId, f.group.id);
    });
    await held;
    const results = await Promise.allSettled([holder, reserveCredits(deps, f.input)]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
  });
  it("serializes spending across two applications and preserves the actual consumer", async () => {
    const f = await fixture();
    await db.insert(schema.creditLedger).values({
      ownerType: "family",
      ownerId: f.group.id,
      app: "compasso",
      entryType: "purchase",
      amount: 5,
    });
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        reserveCredits(deps, {
          ...f.input,
          ...(i % 2 ? { app: "agenda-da-turma", personId: f.person.id } : {}),
        }),
      ),
    );
    const reservations = attempts.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    expect(reservations).toHaveLength(5);
    expect((await getBalance({ db, app: "compasso" }, f.owner)).available).toBe(0);
    await Promise.all(
      reservations.map((r) => commitReservation(deps, { reservationId: r.id, actualAmount: 1 })),
    );
    expect(await getBalance({ db, app: "compasso" }, f.owner)).toMatchObject({
      total: 0,
      reserved: 0,
      available: 0,
    });
    const entries = await db
      .select()
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.ownerId, f.group.id),
          eq(schema.creditLedger.entryType, "consumption"),
        ),
      );
    expect(entries).toHaveLength(5);
    for (const entry of entries) {
      expect(entry.app).toBe("compasso");
      expect(["cozya", "agenda-da-turma"]).toContain(entry.consumerApp);
      expect(entry.actorUserId).toBe(f.actorId);
      expect(entry.runId).toBeTruthy();
    }
  });

  it("rejects another family's actor, unrelated collection and missing child permission", async () => {
    const f = await fixture();
    const other = await fixture();
    await db.insert(schema.creditLedger).values({
      ownerType: "family",
      ownerId: f.group.id,
      app: "compasso",
      entryType: "purchase",
      amount: 10,
    });
    await expect(
      reserveCredits(deps, { ...f.input, actorUserId: other.actorId }),
    ).rejects.toThrow();
    await expect(reserveCredits(deps, { ...f.input, app: "edi" })).rejects.toThrow();
    await expect(
      reserveCredits(deps, { ...f.input, app: "agenda-da-turma", personId: other.person.id }),
    ).rejects.toThrow();
    await expect(reserveCredits({ db }, f.input)).rejects.toThrow(
      "transactional spend authorization",
    );
    const invitation = await family.createInvitation(
      f.actorId,
      f.group.id,
      `${other.actorId}@example.test`,
    );
    await family.acceptInvitation(other.actorId, invitation.token);
    await expect(
      reserveCredits(deps, {
        ...f.input,
        actorUserId: other.actorId,
        app: "agenda-da-turma",
        personId: f.person.id,
      }),
    ).rejects.toThrow();
    const reservation = await reserveCredits(deps, { ...f.input, actorUserId: other.actorId });
    await releaseReservation(deps, { reservationId: reservation.id, reason: "user_cancel" });
    await family.revokeMember(f.actorId, f.group.id, other.actorId);
    await expect(
      reserveCredits(deps, { ...f.input, actorUserId: other.actorId }),
    ).rejects.toThrow();
    expect((await getBalance({ db, app: "compasso" }, f.owner)).available).toBe(10);
  });

  it("holds an expiring grant at acceptance time and never spends purchased credits twice", async () => {
    const f = await fixture();
    await db.insert(schema.creditLedger).values([
      {
        ownerType: "family",
        ownerId: f.group.id,
        app: "compasso",
        entryType: "bonus_grant",
        amount: 5,
        createdAt: new Date("2020-01-01"),
        expiresAt: new Date("2020-01-03"),
      },
      {
        ownerType: "family",
        ownerId: f.group.id,
        app: "compasso",
        entryType: "purchase",
        amount: 10,
        createdAt: new Date("2020-01-01"),
      },
    ]);
    // A historical reservation models a month boundary without sleeping or changing clocks.
    const [reservation] = await db
      .insert(schema.creditReservations)
      .values({
        ownerType: "family",
        ownerId: f.group.id,
        app: "compasso",
        consumerApp: "cozya",
        actorUserId: f.actorId,
        feature: "test",
        estimatedAmount: 5,
        createdAt: new Date("2020-01-02"),
        expiresAt: sql`clock_timestamp() + interval '10 minutes'`,
      })
      .returning();
    if (!reservation) throw new Error("Missing reservation fixture");
    expect(await getBalance({ db, app: "compasso" }, f.owner)).toMatchObject({
      total: 15,
      reserved: 5,
      available: 10,
    });
    await commitReservation(deps, { reservationId: reservation.id, actualAmount: 3 });
    expect(await getBalance({ db, app: "compasso" }, f.owner)).toMatchObject({
      total: 10,
      reserved: 0,
      available: 10,
    });
    await expect(
      commitReservation(deps, { reservationId: reservation.id, actualAmount: 3 }),
    ).rejects.toThrow();
    await releaseReservation(deps, { reservationId: reservation.id, reason: "timeout" });
    expect((await getBalance({ db, app: "compasso" }, f.owner)).available).toBe(10);
  });

  it("enforces the accepted ceiling and serializes competing release and commit", async () => {
    const f = await fixture();
    await db.insert(schema.creditLedger).values({
      ownerType: "family",
      ownerId: f.group.id,
      app: "compasso",
      entryType: "purchase",
      amount: 10,
    });
    const reservation = await reserveCredits(deps, { ...f.input, estimatedAmount: 2 });
    await expect(
      commitReservation(deps, { reservationId: reservation.id, actualAmount: 3 }),
    ).rejects.toThrow("ceiling");
    const results = await Promise.allSettled([
      releaseReservation(deps, { reservationId: reservation.id, reason: "timeout" }),
      commitReservation(deps, { reservationId: reservation.id, actualAmount: 2 }),
    ]);
    expect(results[0]?.status).toBe("fulfilled");
    const [resolved] = await db
      .select()
      .from(schema.creditReservations)
      .where(eq(schema.creditReservations.id, reservation.id));
    const balance = await getBalance({ db, app: "compasso" }, f.owner);
    expect(balance.reserved).toBe(0);
    expect(balance.available).toBe(resolved?.status === "committed" ? 8 : 10);
    const expired = await reserveCredits(deps, f.input);
    await db
      .update(schema.creditReservations)
      .set({ expiresAt: new Date("2020-01-01") })
      .where(eq(schema.creditReservations.id, expired.id));
    await expect(
      commitReservation(deps, { reservationId: expired.id, actualAmount: 1 }),
    ).rejects.toThrow();
    const [expiration] = await db
      .select()
      .from(schema.creditReservations)
      .where(eq(schema.creditReservations.id, expired.id));
    expect(expiration?.status).toBe("expired");
  });
});
