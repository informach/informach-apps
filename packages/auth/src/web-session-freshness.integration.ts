import { randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import { sessions, users } from "@informach/db/schema";
import { beforeAll, expect, it, vi } from "vitest";
import { isRecentCentralAuthentication, isRecentWebAuthentication } from "./web-sessions";

beforeAll(() => {
  if (
    process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
    !["localhost", "127.0.0.1", "postgres"].includes(
      new URL(process.env.DATABASE_URL ?? "").hostname,
    )
  )
    throw new Error("Disposable PostgreSQL required");
});

it("uses one authoritative clock for central authentication freshness", async () => {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await db.insert(users).values({
    id: userId,
    name: "Freshness fixture",
    email: `${userId}@example.test`,
    emailVerified: true,
  });
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    token: randomUUID(),
    originApp: "conta",
    expiresAt: new Date(Date.now() + 3600_000),
  });
  const childId = randomUUID();
  await db.insert(sessions).values({
    id: childId,
    userId,
    token: randomUUID(),
    originApp: "cozya",
    parentSessionId: sessionId,
    expiresAt: new Date(Date.now() + 3600_000),
  });
  const child = { userId, sessionId: childId, app: "cozya", maxAgeSeconds: 900 };
  const actualNow = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(actualNow - 5000);
  try {
    expect(await isRecentCentralAuthentication(userId, sessionId)).toBe(true);
    expect(await isRecentWebAuthentication(child)).toBe(true);
  } finally {
    clock.mockRestore();
  }
  expect(await isRecentCentralAuthentication(randomUUID(), sessionId)).toBe(false);
  expect(await isRecentCentralAuthentication(userId, childId)).toBe(false);
  await db
    .update(sessions)
    .set({ createdAt: sql`clock_timestamp() - interval '16 minutes'` })
    .where(eq(sessions.id, sessionId));
  expect(await isRecentCentralAuthentication(userId, sessionId)).toBe(false);
  expect(await isRecentWebAuthentication(child)).toBe(false);
  await db
    .update(sessions)
    .set({ createdAt: sql`clock_timestamp() + interval '1 minute'` })
    .where(eq(sessions.id, sessionId));
  expect(await isRecentCentralAuthentication(userId, sessionId)).toBe(false);
  expect(await isRecentWebAuthentication(child)).toBe(false);
  await db
    .update(sessions)
    .set({
      createdAt: sql`clock_timestamp()`,
      expiresAt: sql`clock_timestamp() - interval '1 second'`,
    })
    .where(eq(sessions.id, sessionId));
  expect(await isRecentCentralAuthentication(userId, sessionId)).toBe(false);
  expect(await isRecentWebAuthentication(child)).toBe(false);
});
