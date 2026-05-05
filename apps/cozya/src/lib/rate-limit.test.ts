import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeRedis = {
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  ttl: ReturnType<typeof vi.fn>;
};

let counter = 0;
const fakeRedis: FakeRedis = {
  incr: vi.fn(async () => ++counter),
  expire: vi.fn(async () => 1),
  ttl: vi.fn(async () => 60),
};

let mockedRedis: FakeRedis | null = fakeRedis;

vi.mock("./redis", () => ({
  get redis() {
    return mockedRedis;
  },
}));

vi.mock("./logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { aiInvokeKey, COZYA_RATE_LIMITS, RateLimitedError, checkRateLimit, enforceRateLimit } from "./rate-limit";

beforeEach(() => {
  counter = 0;
  fakeRedis.incr.mockClear();
  fakeRedis.expire.mockClear();
  fakeRedis.ttl.mockClear();
  mockedRedis = fakeRedis;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkRateLimit", () => {
  it("allows the first event and sets TTL only on the first call in the window", async () => {
    const input = { key: "test:key", limit: 3, windowSeconds: 60 };
    const r1 = await checkRateLimit(input);
    expect(r1.allowed).toBe(true);
    expect(r1.count).toBe(1);
    expect(r1.remaining).toBe(2);
    expect(r1.retryAfterSeconds).toBe(0);
    expect(fakeRedis.expire).toHaveBeenCalledTimes(1);

    const r2 = await checkRateLimit(input);
    expect(r2.count).toBe(2);
    expect(fakeRedis.expire).toHaveBeenCalledTimes(1); // still 1 — not re-set
  });

  it("blocks when count exceeds limit and returns retryAfterSeconds from TTL", async () => {
    const input = { key: "test:key", limit: 2, windowSeconds: 60 };
    await checkRateLimit(input); // 1
    await checkRateLimit(input); // 2
    const r3 = await checkRateLimit(input); // 3 → blocked
    expect(r3.allowed).toBe(false);
    expect(r3.count).toBe(3);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("returns allow-all and warns when Redis is unavailable", async () => {
    mockedRedis = null;
    const input = { key: "test:key", limit: 1, windowSeconds: 60 };
    const result = await checkRateLimit(input);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(0);
    expect(result.remaining).toBe(1);
    expect(fakeRedis.incr).not.toHaveBeenCalled();
  });
});

describe("enforceRateLimit", () => {
  it("returns the result when within limit", async () => {
    const result = await enforceRateLimit({ key: "test:key", limit: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
  });

  it("throws RateLimitedError with retry hint when exceeded", async () => {
    const input = { key: "test:key", limit: 1, windowSeconds: 60 };
    await enforceRateLimit(input); // ok
    await expect(enforceRateLimit(input)).rejects.toThrow(RateLimitedError);
  });
});

describe("COZYA_RATE_LIMITS", () => {
  it("AI_INVOKE_PER_HOUR is 10 calls / 3600s", () => {
    expect(COZYA_RATE_LIMITS.AI_INVOKE_PER_HOUR).toEqual({ limit: 10, windowSeconds: 3600 });
  });

  it("aiInvokeKey is stable per user", () => {
    expect(aiInvokeKey("user-123")).toBe("cozya.ai.invoke:user:user-123");
  });
});
