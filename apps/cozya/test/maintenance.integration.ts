import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import { cozyaAiOperations, creditLedger, creditReservations, users } from "@informach/db/schema";
import { expect, it } from "vitest";
import { maintainCozyaData } from "@/features/account/maintenance";
import { billing } from "@/features/billing/service";

it("recovers a backlog larger than one batch before pruning its billing evidence", async () => {
  if (
    process.env.COZYA_ISOLATED_INTEGRATION !== "1" ||
    !new URL(process.env.DATABASE_URL ?? "").pathname.startsWith("/cozya_review_")
  )
    throw new Error("Global retention tests require the isolated pnpm test:integration runner");
  const userId = randomUUID();
  const operationIds = Array.from({ length: 101 }, () => randomUUID());
  const now = new Date();
  const old = new Date(now.getTime() - 91 * 86400000);
  await db.insert(users).values({
    id: userId,
    name: "Retention review",
    email: `retention-${userId}@e2e.local`,
    emailVerified: true,
  });
  await db.insert(cozyaAiOperations).values(
    operationIds.map((id) => ({
      id,
      userId,
      fingerprint: id,
      statusCode: 502,
      response: { code: "AI_FAILED" },
      createdAt: old,
      expiresAt: old,
    })),
  );
  await db.insert(creditReservations).values(
    operationIds.map((id) => ({
      id,
      ownerType: "user" as const,
      ownerId: userId,
      app: "cozya",
      feature: "cozya.recipe.extract_from_text",
      estimatedAmount: 1,
      status: "committed" as const,
      expiresAt: old,
    })),
  );
  await db.insert(creditLedger).values(
    operationIds.map((id) => ({
      ownerType: "user" as const,
      ownerId: userId,
      app: "cozya",
      entryType: "consumption" as const,
      amount: -1,
      reservationId: id,
    })),
  );
  try {
    const first = await maintainCozyaData(now);
    expect(first.compensated).toBe(100);
    const remaining = await db
      .select()
      .from(cozyaAiOperations)
      .where(inArray(cozyaAiOperations.id, operationIds));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.statusCode).toBe(502);
    const second = await maintainCozyaData(now);
    expect(second.compensated).toBe(1);
    const restored = (
      await billing.getCreditHistory(
        { type: "user", id: userId },
        { entryTypes: ["adjustment"], limit: 200 },
      )
    ).entries;
    expect(restored).toHaveLength(101);
    expect(
      restored.every(
        (entry) => entry.amount === 1 && entry.metadata?.reason === "preview_unavailable",
      ),
    ).toBe(true);
    expect((await maintainCozyaData(now)).compensated).toBe(0);
  } finally {
    await db.delete(creditLedger).where(eq(creditLedger.ownerId, userId));
    await db.delete(creditReservations).where(eq(creditReservations.ownerId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
});
