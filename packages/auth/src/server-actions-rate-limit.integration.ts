import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { rateLimit } from "@informach/db/schema";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { postgresRateLimitStorage } from "./server-actions";

const key = `integration:fixed-window:${randomUUID()}`;

beforeAll(() => {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (
    process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
    !["localhost", "127.0.0.1", "postgres"].includes(host)
  )
    throw new Error("Disposable PostgreSQL required");
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(rateLimit).where(eq(rateLimit.key, key));
});

describe("PostgreSQL action rate limit", () => {
  it("keeps a fixed window even when requests continue after the limit", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    expect((await postgresRateLimitStorage.hit(key, 60)).count).toBe(1);
    clock.mockReturnValue(1_030_000);
    expect((await postgresRateLimitStorage.hit(key, 60)).count).toBe(2);
    clock.mockReturnValue(1_059_000);
    expect((await postgresRateLimitStorage.hit(key, 60)).count).toBe(3);
    clock.mockReturnValue(1_060_000);
    expect((await postgresRateLimitStorage.hit(key, 60)).count).toBe(1);
  });

  it("counts concurrent requests atomically", async () => {
    const hits = await Promise.all(
      Array.from({ length: 8 }, () => postgresRateLimitStorage.hit(key, 60)),
    );
    expect(hits.map((hit) => hit.count).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
