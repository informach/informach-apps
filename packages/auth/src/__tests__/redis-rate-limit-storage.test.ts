import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { type RedisRateLimitClient, redisRateLimitStorage } from "../redis-rate-limit-storage";

type MultiCalls = {
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  ttl: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
};

function makeMockClient(execResult: Array<[Error | null, unknown]> | null): {
  client: RedisRateLimitClient;
  calls: MultiCalls;
} {
  const calls: MultiCalls = {
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    exec: vi.fn(async () => execResult),
  };
  const multi = {
    incr: vi.fn((key: string) => {
      calls.incr(key);
      return multi;
    }),
    expire: vi.fn((key: string, seconds: number, mode: "NX") => {
      calls.expire(key, seconds, mode);
      return multi;
    }),
    ttl: vi.fn((key: string) => {
      calls.ttl(key);
      return multi;
    }),
    exec: calls.exec,
  };
  return {
    client: { multi: () => multi },
    calls,
  };
}

describe("redisRateLimitStorage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
  });

  it("composes the redis key as `<prefix><key>:<bucket>`", async () => {
    const { client, calls } = makeMockClient([
      [null, 1],
      [null, 1],
      [null, 60],
    ]);
    const storage = redisRateLimitStorage({ client, keyPrefix: "cozya:rl:" });
    await storage.hit("test:user:u1", 60);
    const expectedBucket = Math.floor(new Date("2026-05-10T12:00:00.000Z").getTime() / 1000 / 60);
    expect(calls.incr).toHaveBeenCalledWith(`cozya:rl:test:user:u1:${expectedBucket}`);
  });

  it("uses EXPIRE NX so the TTL is not extended on subsequent hits", async () => {
    const { client, calls } = makeMockClient([
      [null, 2],
      [null, 0], // EXPIRE NX returns 0 when TTL is already set (subsequent hit)
      [null, 30],
    ]);
    const storage = redisRateLimitStorage({ client, keyPrefix: "cozya:rl:" });
    const result = await storage.hit("test:user:u1", 60);
    expect(calls.expire).toHaveBeenCalledWith(expect.any(String), 60, "NX");
    expect(result).toEqual({ count: 2, ttlSeconds: 30 });
  });

  it("returns count from the INCR step and ttl from the TTL step", async () => {
    const { client } = makeMockClient([
      [null, 5],
      [null, 1],
      [null, 42],
    ]);
    const storage = redisRateLimitStorage({ client, keyPrefix: "x:" });
    expect(await storage.hit("k", 60)).toEqual({ count: 5, ttlSeconds: 42 });
  });

  it("falls back gracefully when exec returns null (WATCH abort)", async () => {
    const { client } = makeMockClient(null);
    const storage = redisRateLimitStorage({ client, keyPrefix: "x:" });
    expect(await storage.hit("k", 60)).toEqual({ count: 0, ttlSeconds: 60 });
  });

  it("clamps negative TTL to zero (e.g. when key has no TTL set)", async () => {
    const { client } = makeMockClient([
      [null, 1],
      [null, 1],
      [null, -1],
    ]);
    const storage = redisRateLimitStorage({ client, keyPrefix: "x:" });
    expect(await storage.hit("k", 60)).toEqual({ count: 1, ttlSeconds: 0 });
  });

  it("works without a keyPrefix (defaults to empty string)", async () => {
    const { client, calls } = makeMockClient([
      [null, 1],
      [null, 1],
      [null, 60],
    ]);
    const storage = redisRateLimitStorage({ client });
    await storage.hit("k", 60);
    const expectedBucket = Math.floor(new Date("2026-05-10T12:00:00.000Z").getTime() / 1000 / 60);
    expect(calls.incr).toHaveBeenCalledWith(`k:${expectedBucket}`);
  });
});
